import React, { useEffect, useMemo, useState } from 'react'
import { useDarkMode } from '@darkMode/useDarkMode'

interface EventLogEntry {
    id: number
    topic: string
    payload_type: string
    metadata_type: string
    created: string
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

export const EventPanelApp: React.FC = () => {
    useDarkMode()
    const [events, setEvents] = useState<EventLogEntry[]>([])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let isMounted = true

        window.eventPanelAPI
            .queryDatabase(EVENT_QUERY)
            .then((rows) => {
                if (isMounted) {
                    setEvents(rows)
                    setError(null)
                }
            })
            .catch((queryError) => {
                if (isMounted) {
                    setError(
                        queryError instanceof Error
                            ? queryError.message
                            : 'Unable to load events'
                    )
                }
            })

        window.eventPanelAPI.onEvent((event) => {
            setEvents((current) => {
                if (current.some((row) => row.id === event.id)) {
                    return current
                }
                return [event, ...current].slice(0, 30)
            })
        })

        return () => {
            isMounted = false
            window.eventPanelAPI.removeEventListener()
        }
    }, [])

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
                    No events logged yet.
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
        <div className="flex h-screen min-w-0 flex-col border-r border-border bg-background">
            <header className="shrink-0 border-b border-border bg-muted/20 px-3 py-2.5">
                <h1 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    Event History
                </h1>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    Recent SQLite event rows
                </p>
            </header>
            <main className="flex min-h-0 flex-1 flex-col">{content}</main>
        </div>
    )
}
