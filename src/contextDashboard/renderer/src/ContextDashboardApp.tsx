import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDarkMode } from '@darkMode/useDarkMode'

interface EventLogEntry {
    id: number
    topic: string
    payload_type: string
    metadata_type: string
    created: string
}

interface WorkspaceContext {
    topic: string
    name: string
}

const EVENT_QUERY = `
  SELECT
    id,
    created,
    CASE
      WHEN topic != 'default' AND payload_type = 'rpc-args' THEN 'default'
      ELSE topic
    END AS topic,
    CASE
      WHEN topic != 'default' AND payload_type = 'rpc-args' THEN topic
      ELSE payload_type
    END AS payload_type,
    metadata_type
  FROM events
  WHERE topic = ?
  ORDER BY id DESC
  LIMIT 30
`

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
    const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(
        null
    )
    const [error, setError] = useState<string | null>(null)
    const activeTopicRef = useRef<string | null>(null)

    const loadEvents = useCallback(async (topic: string): Promise<void> => {
        try {
            const rows = await window.contextDashboardAPI.queryDatabase(EVENT_QUERY, [topic])
            setEvents(rows)
            setError(null)
        } catch (queryError) {
            setError(
                queryError instanceof Error
                    ? queryError.message
                    : 'Unable to load events'
            )
        }
    }, [])

    const applyWorkspaceContext = useCallback(
        (context: WorkspaceContext): void => {
            activeTopicRef.current = context.topic
            setWorkspaceContext(context)
            void loadEvents(context.topic)
        },
        [loadEvents]
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

            setEvents((current) => {
                if (current.some((row) => row.id === event.id)) {
                    return current
                }
                return [event, ...current].slice(0, 30)
            })
        })

        return () => {
            isMounted = false
            window.contextDashboardAPI.removeEventListener()
            window.contextDashboardAPI.removeWorkspaceContextUpdatedListener()
        }
    }, [applyWorkspaceContext])

    const content = useMemo(() => {
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
                    Event History
                </h1>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {workspaceContext
                        ? `Recent events for ${workspaceContext.name}`
                        : 'Recent workspace events'}
                </p>
            </header>
            <main className="flex min-h-0 flex-1 flex-col">{content}</main>
        </div>
    )
}
