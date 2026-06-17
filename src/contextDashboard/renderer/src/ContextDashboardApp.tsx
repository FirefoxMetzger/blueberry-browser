import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useDarkMode } from '@darkMode/useDarkMode'
import {
    WORKSPACE_ACTIVITY_QUERY,
    WORKSPACE_TAB_EVENTS_QUERY,
} from '../../../events/queries'
import { Favicon, getFaviconUrl } from './Favicon'

interface EventLogEntry {
    id: number
    topic: string
    payload_type: string
    metadata_type: string
    created: string
}

interface TabEventRow {
    payload_type: string
    payload: string
}

interface DashboardTab {
    id: string
    title: string
    url: string
    kind: 'browser' | 'agent-chat' | 'pending'
    isActive: boolean
}

interface WorkspaceContext {
    topic: string
    name: string
}

const TAB_EVENT_TYPES = new Set([
    'tab-created',
    'tab-closed',
    'tab-url-changed',
    'tab-title-changed',
    'tab-kind-changed',
    'tab-activated',
    'tab-moved',
])

const formatCreated = (created: string): string => {
    const date = new Date(created)
    if (Number.isNaN(date.getTime())) {
        return created
    }
    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

const formatType = (type: string): string => {
    return type.replace(/-/g, ' ')
}

const buildTabsFromEventRows = (rows: TabEventRow[]): DashboardTab[] => {
    const tabOrder: string[] = []
    const tabs = new Map<
        string,
        { id: string; title: string; url: string; kind: DashboardTab['kind'] }
    >()
    let lastActiveTabId: string | null = null

    const addTab = (
        tabId: string,
        url: string,
        title: string,
        kind: DashboardTab['kind'] = 'browser'
    ): void => {
        if (!tabOrder.includes(tabId)) {
            tabOrder.push(tabId)
        }
        tabs.set(tabId, { id: tabId, title, url, kind })
    }

    const removeTab = (tabId: string): void => {
        const index = tabOrder.indexOf(tabId)
        if (index !== -1) {
            tabOrder.splice(index, 1)
        }
        tabs.delete(tabId)
        if (lastActiveTabId === tabId) {
            lastActiveTabId =
                tabOrder.length > 0 ? tabOrder[tabOrder.length - 1] : null
        }
    }

    for (const row of rows) {
        const payload = JSON.parse(row.payload) as Record<string, unknown>

        switch (row.payload_type) {
            case 'tab-created':
                addTab(
                    payload.tabId as string,
                    payload.url as string,
                    (payload.title as string | undefined) ?? 'New Tab',
                    (payload.kind as DashboardTab['kind'] | undefined) ?? 'browser'
                )
                lastActiveTabId = payload.tabId as string
                break
            case 'tab-closed':
                removeTab(payload.tabId as string)
                break
            case 'tab-url-changed': {
                const tab = tabs.get(payload.tabId as string)
                if (tab) {
                    tab.url = payload.url as string
                }
                break
            }
            case 'tab-title-changed': {
                const tab = tabs.get(payload.tabId as string)
                if (tab) {
                    tab.title = payload.title as string
                }
                break
            }
            case 'tab-kind-changed': {
                const tab = tabs.get(payload.tabId as string)
                if (tab) {
                    tab.kind = payload.kind as DashboardTab['kind']
                    if (typeof payload.url === 'string') {
                        tab.url = payload.url
                    }
                    if (typeof payload.title === 'string') {
                        tab.title = payload.title
                    }
                }
                break
            }
            case 'tab-activated':
                if (tabs.has(payload.tabId as string)) {
                    lastActiveTabId = payload.tabId as string
                }
                break
            case 'tab-moved':
                if (payload.direction === 'out') {
                    removeTab(payload.tabId as string)
                } else {
                    addTab(
                        payload.tabId as string,
                        payload.url as string,
                        payload.title as string,
                        (payload.kind as DashboardTab['kind'] | undefined) ?? 'browser'
                    )
                    lastActiveTabId = payload.tabId as string
                }
                break
            default:
                break
        }
    }

    return tabOrder
        .map((tabId) => tabs.get(tabId))
        .filter((tab): tab is NonNullable<typeof tab> => tab !== undefined)
        .map((tab) => ({
            ...tab,
            isActive: tab.id === lastActiveTabId,
        }))
}

const TabRow: React.FC<{ tab: DashboardTab }> = ({ tab }) => {
    return (
        <li
            className={`flex min-w-0 items-center gap-2 border-b border-border/70 px-3 py-2 last:border-b-0 ${
                tab.isActive ? 'bg-muted/40' : ''
            }`}
        >
            <Favicon src={getFaviconUrl(tab.url)} />
            <span
                className={`min-w-0 flex-1 truncate text-xs ${
                    tab.isActive ? 'font-semibold text-foreground' : 'text-foreground/90'
                }`}
            >
                {tab.title || 'New Tab'}
            </span>
        </li>
    )
}

const ConversationRow: React.FC<{ tab: DashboardTab }> = ({ tab }) => {
    return (
        <li
            className={`flex min-w-0 items-center gap-2 border-b border-border/70 px-3 py-2 last:border-b-0 ${
                tab.isActive ? 'bg-muted/40' : ''
            }`}
        >
            <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
            <span
                className={`min-w-0 flex-1 truncate text-xs ${
                    tab.isActive ? 'font-semibold text-foreground' : 'text-foreground/90'
                }`}
            >
                {tab.title || 'Agent Chat'}
            </span>
        </li>
    )
}

const EventRow: React.FC<{ event: EventLogEntry }> = ({ event }) => {
    return (
        <li className="relative border-b border-border/70 px-3 py-2.5 last:border-b-0">
            <div className="mb-1.5 flex min-w-0 items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                    {formatType(event.payload_type)}
                </span>
                <span className="shrink-0 text-[10px] leading-none text-muted-foreground">
                    {formatCreated(event.created)}
                </span>
            </div>
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] leading-tight text-muted-foreground">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/75">
                        topic
                    </span>
                    <span className="truncate">{event.topic}</span>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/75">
                        metadata
                    </span>
                    <span className="truncate">{formatType(event.metadata_type)}</span>
                </div>
            </div>
        </li>
    )
}

export const ContextDashboardApp: React.FC = () => {
    useDarkMode()
    const [events, setEvents] = useState<EventLogEntry[]>([])
    const [tabs, setTabs] = useState<DashboardTab[]>([])
    const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(
        null
    )
    const [error, setError] = useState<string | null>(null)
    const activeTopicRef = useRef<string | null>(null)

    const loadEvents = useCallback(async (topic: string): Promise<void> => {
        try {
            const rows = await window.contextDashboardAPI.queryDatabase(
                WORKSPACE_ACTIVITY_QUERY,
                [topic]
            )
            setEvents(rows as EventLogEntry[])
            setError(null)
        } catch (queryError) {
            setError(
                queryError instanceof Error
                    ? queryError.message
                    : 'Unable to load events'
            )
        }
    }, [])

    const loadTabs = useCallback(async (topic: string): Promise<void> => {
        try {
            const rows = await window.contextDashboardAPI.queryDatabase(
                WORKSPACE_TAB_EVENTS_QUERY,
                [topic]
            )
            setTabs(buildTabsFromEventRows(rows as TabEventRow[]))
            setError(null)
        } catch (queryError) {
            setError(
                queryError instanceof Error ? queryError.message : 'Unable to load tabs'
            )
        }
    }, [])

    const applyWorkspaceContext = useCallback(
        (context: WorkspaceContext): void => {
            activeTopicRef.current = context.topic
            setWorkspaceContext(context)
            void loadEvents(context.topic)
            void loadTabs(context.topic)
        },
        [loadEvents, loadTabs]
    )

    useEffect(() => {
        let isMounted = true

        window.contextDashboardAPI
            .getActiveWorkspaceContext()
            .then((context) => {
                if (isMounted) {
                    applyWorkspaceContext(context)
                }
            })
            .catch((contextError) => {
                if (isMounted) {
                    setError(
                        contextError instanceof Error
                            ? contextError.message
                            : 'Unable to load workspace context'
                    )
                }
            })

        window.contextDashboardAPI.onWorkspaceContextUpdated((context) => {
            if (isMounted) {
                applyWorkspaceContext(context)
            }
        })

        window.contextDashboardAPI.onEvent((event) => {
            const activeTopic = activeTopicRef.current
            if (!activeTopic || event.topic !== activeTopic) {
                return
            }

            if (TAB_EVENT_TYPES.has(event.payload_type)) {
                void loadTabs(activeTopic)
            }

            setEvents((current) => {
                if (current.some((row) => row.id === event.id)) {
                    return current
                }
                return [event as EventLogEntry, ...current].slice(0, 30)
            })
        })

        return () => {
            isMounted = false
            window.contextDashboardAPI.removeEventListener()
            window.contextDashboardAPI.removeWorkspaceContextUpdatedListener()
        }
    }, [applyWorkspaceContext, loadTabs])

    const browserTabs = useMemo(
        () => tabs.filter((tab) => tab.kind === 'browser' || tab.kind === 'pending'),
        [tabs]
    )

    const conversations = useMemo(
        () => tabs.filter((tab) => tab.kind === 'agent-chat'),
        [tabs]
    )

    const tabsContent = useMemo(() => {
        if (browserTabs.length === 0) {
            return (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                    No open tabs in this workspace.
                </div>
            )
        }

        return (
            <ul className="max-h-48 overflow-y-auto">
                {browserTabs.map((tab) => (
                    <TabRow key={tab.id} tab={tab} />
                ))}
            </ul>
        )
    }, [browserTabs])

    const conversationsContent = useMemo(() => {
        if (conversations.length === 0) {
            return (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                    No open conversations in this workspace.
                </div>
            )
        }

        return (
            <ul className="max-h-48 overflow-y-auto">
                {conversations.map((tab) => (
                    <ConversationRow key={tab.id} tab={tab} />
                ))}
            </ul>
        )
    }, [conversations])

    const activityContent = useMemo(() => {
        if (error) {
            return (
                <div className="px-3 py-4 text-xs text-destructive">
                    {error}
                </div>
            )
        }

        if (events.length === 0) {
            return (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                    No events logged yet for this workspace.
                </div>
            )
        }

        return (
            <ol className="min-h-0 flex-1 overflow-y-auto">
                {events.map((event) => (
                    <EventRow event={event} key={event.id} />
                ))}
            </ol>
        )
    }, [error, events])

    return (
        <div className="flex h-screen min-w-0 flex-col bg-background">
            <header className="shrink-0 border-b border-border bg-muted/20 px-3 py-2.5">
                <h1 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    Context Dashboard
                </h1>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {workspaceContext
                        ? `Workspace: ${workspaceContext.name}`
                        : 'Active workspace context'}
                </p>
            </header>

            <section className="shrink-0 border-b border-border">
                <div className="border-b border-border/70 bg-muted/10 px-3 py-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                        Tabs
                    </h2>
                </div>
                {tabsContent}
            </section>

            <section className="shrink-0 border-b border-border">
                <div className="border-b border-border/70 bg-muted/10 px-3 py-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                        Conversations
                    </h2>
                </div>
                {conversationsContent}
            </section>

            <section className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b border-border/70 bg-muted/10 px-3 py-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                        Activity
                    </h2>
                </div>
                <main className="flex min-h-0 flex-1 flex-col">{activityContent}</main>
            </section>
        </div>
    )
}
