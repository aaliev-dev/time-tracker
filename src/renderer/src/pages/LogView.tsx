import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ActivityEvent } from '../../../shared/types'
import { formatDuration, formatLocalDate, formatTime } from '../lib/format'

/**
 * LogView — chronological event log + visual timeline bar for a day.
 *
 * Два блока:
 * 1. Visual timeline — горизонтальный бар 00:00→24:00, каждый event = цветной блок
 * 2. Event list — хронологический список с start/end временем, длительностью
 *
 * Данные: window.api.activities.getDay(date) → ActivityEvent[]
 */
export default function LogView({ selectedDate, onDateChange }: {
  selectedDate: string
  onDateChange: (date: string) => void
}): JSX.Element {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{
    appName: string
    color: string
    tsStart: string
    tsEnd: string
    duration: number
    windowTitle: string | null
    url: string | null
    leftPct: number
  } | null>(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    const result = await window.api.activities.getDay(selectedDate)
    setEvents(result)
    setLoading(false)
  }, [selectedDate])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Date navigation
  const shiftDate = (days: number): void => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + days)
    onDateChange(formatLocalDate(d))
  }

  const today = formatLocalDate(new Date())
  const isToday = selectedDate === today

  // Filter out AFK for the visual timeline
  const activeEvents = events.filter((e) => !e.isAfk)
  const totalActive = activeEvents.reduce((sum, e) => sum + e.duration, 0)

  // Color mapping per app — deterministic hash → palette
  const colorForApp = (appName: string): string => {
    let hash = 0
    for (let i = 0; i < appName.length; i++) {
      hash = (hash * 31 + appName.charCodeAt(i)) | 0
    }
    const colors = ['#7aa2f7', '#bb9af7', '#9ece6a', '#e0af68', '#f7768e', '#7dcfff', '#ffc777', '#73daca']
    return colors[Math.abs(hash) % colors.length]
  }

  // Timeline calculations — map events to 0-24h positions
  const dayStart = new Date(selectedDate + 'T00:00:00')
  const dayMs = 24 * 60 * 60 * 1000

  const eventBars = activeEvents.map((e) => {
    const startMs = Math.max(0, new Date(e.tsStart).getTime() - dayStart.getTime())
    const endMs = Math.min(dayMs, new Date(e.tsEnd).getTime() - dayStart.getTime())
    const leftPct = (startMs / dayMs) * 100
    const widthPct = ((endMs - startMs) / dayMs) * 100
    return { event: e, leftPct, widthPct, color: colorForApp(e.appName) }
  })

  // Hour markers for the timeline (0, 6, 12, 18, 24)
  const hourMarkers = [0, 3, 6, 9, 12, 15, 18, 21, 24]

  return (
    <div className="space-y-6">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => shiftDate(-1)}
          className="no-drag rounded-lg border border-tt-border px-3 py-1.5 text-sm hover:bg-tt-surface"
        >
          <ChevronLeft size={16} className="inline" />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-lg font-medium">{selectedDate}</span>
          {isToday && <span className="rounded bg-tt-accent/25 px-2 py-0.5 text-xs font-medium text-tt-accent">Today</span>}
        </div>
        <button
          onClick={() => shiftDate(1)}
          disabled={isToday}
          className="no-drag rounded-lg border border-tt-border px-3 py-1.5 text-sm hover:bg-tt-surface disabled:opacity-30"
        >
          <ChevronRight size={16} className="inline" />
        </button>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-tt-muted">Total active time</div>
            <div className="mt-1 text-2xl font-semibold">{formatDuration(totalActive)}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-tt-muted">Events</div>
            <div className="mt-1 text-2xl font-semibold">{activeEvents.length}</div>
          </div>
        </div>
      </div>

      {/* Visual timeline bar */}
      {!loading && activeEvents.length > 0 && (
        <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
          <h2 className="mb-3 text-sm font-medium text-tt-muted">Timeline</h2>

          {/* Timeline bar + tooltip overlay */}
          <div className="relative">
            {/* Timeline bar */}
            <div className="relative h-12 w-full overflow-hidden rounded bg-tt-bg">
              {eventBars.map((bar, idx) => (
                <div
                  key={idx}
                  className="absolute inset-y-0 flex items-center justify-center overflow-hidden transition-opacity cursor-help"
                  style={{
                    left: `${bar.leftPct}%`,
                    width: `${Math.max(bar.widthPct, 0.3)}%`,
                    backgroundColor: bar.color,
                    opacity: tooltip?.appName === bar.event.appName && tooltip?.tsStart === bar.event.tsStart ? 1 : 0.75,
                  }}
                  title={`${bar.event.appName} — ${formatTime(bar.event.tsStart)} to ${formatTime(bar.event.tsEnd)} (${formatDuration(bar.event.duration)})${bar.event.windowTitle ? '\n' + bar.event.windowTitle : ''}${bar.event.url ? '\n' + bar.event.url : ''}`}
                  onMouseEnter={() =>
                    setTooltip({
                      appName: bar.event.appName,
                      color: bar.color,
                      tsStart: bar.event.tsStart,
                      tsEnd: bar.event.tsEnd,
                      duration: bar.event.duration,
                      windowTitle: bar.event.windowTitle,
                      url: bar.event.url ?? null,
                      leftPct: bar.leftPct + bar.widthPct / 2
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                >
                  {bar.widthPct > 4 && (
                    <span className="truncate px-1 text-xs font-medium text-tt-bg">
                      {bar.event.appName}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Floating tooltip — absolute, doesn't affect layout */}
            {tooltip && (
              <div
                className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-tt-border bg-tt-bg p-3 text-sm shadow-2xl"
                style={{
                  left: `${Math.min(Math.max(tooltip.leftPct, 20), 80)}%`,
                  top: 'calc(100% + 4px)',
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: tooltip.color }}
                  />
                  <span className="font-medium">{tooltip.appName}</span>
                </div>
                <div className="mt-1 text-xs text-tt-muted">
                  {formatTime(tooltip.tsStart)} — {formatTime(tooltip.tsEnd)}
                  <span className="ml-2">({formatDuration(tooltip.duration)})</span>
                </div>
                {tooltip.windowTitle && (
                  <div className="mt-1 truncate text-xs text-tt-muted" title={tooltip.windowTitle}>
                    {tooltip.windowTitle}
                  </div>
                )}
                {tooltip.url && tooltip.url !== tooltip.windowTitle && (
                  <div className="mt-0.5 truncate text-xs text-tt-muted" title={tooltip.url}>
                    {tooltip.url}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hour markers */}
          <div className="relative mt-1 h-5">
            {hourMarkers.map((h) => (
              <div
                key={h}
                className="absolute text-xs text-tt-muted"
                style={{ left: `${(h / 24) * 100}%`, transform: 'translateX(-50%)' }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event list */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-tt-muted">
          Events ({events.length})
        </h2>
        {loading ? (
          <div className="rounded-lg border border-tt-border bg-tt-surface p-8 text-center text-tt-muted">
            Loading...
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-lg border border-tt-border bg-tt-surface p-8 text-center text-tt-muted">
            No events recorded for this day.
          </div>
        ) : (
          <div className="space-y-1">
            {events.map((e, idx) => (
              <div
                key={e.id ?? idx}
                title={`${e.isAfk ? 'AFK' : e.appName} — ${formatTime(e.tsStart)} to ${formatTime(e.tsEnd)} (${formatDuration(e.duration)})${e.windowTitle ? '\n' + e.windowTitle : ''}${e.url ? '\n' + e.url : ''}`}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  e.isAfk
                    ? 'border-tt-border/50 bg-tt-surface/50 opacity-50'
                    : 'border-tt-border bg-tt-surface'
                }`}
              >
                {/* Color dot */}
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: e.isAfk ? '#414868' : colorForApp(e.appName) }}
                />

                {/* Time range */}
                <div className="w-28 shrink-0 text-xs text-tt-muted">
                  {formatTime(e.tsStart)} — {formatTime(e.tsEnd)}
                </div>
                {/* App name */}

                {/* App name */}
                <div className="w-40 shrink-0 truncate text-sm font-medium">
                  {e.isAfk ? '😴 AFK' : e.appName}
                </div>

                {/* Window title */}
                <div className="flex-1 truncate text-sm text-tt-text/70">
                  {e.windowTitle || (e.url ?? '')}
                </div>

                {/* Duration */}
                <div className="w-20 shrink-0 text-right text-sm text-tt-muted">
                  {formatDuration(e.duration)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
