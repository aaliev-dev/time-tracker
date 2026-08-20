import { useState, useEffect, useCallback } from 'react'
import { Clock, Activity, BarChart3, Settings as SettingsIcon } from 'lucide-react'
import type { CurrentActivity, DaySummary } from '../../main/types'
import { formatDuration } from './lib/format'

type View = 'timeline' | 'stats' | 'settings'

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('timeline')
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity | null>(null)
  const [summary, setSummary] = useState<DaySummary[]>([])
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])

  // Listen for real-time activity changes from main process
  useEffect(() => {
    // Get initial activity
    window.api.tracking.getCurrent().then(setCurrentActivity)

    // Subscribe to activity-changed events
    const unsubscribe = window.api.tracking.onActivityChanged((activity) => {
      setCurrentActivity(activity as CurrentActivity)
    })

    return unsubscribe
  }, [])

  // Load summary when date changes
  const loadSummary = useCallback(async () => {
    const result = await window.api.activities.getSummary(selectedDate)
    setSummary(result)
  }, [selectedDate])

  useEffect(() => {
    loadSummary()
    // Refresh summary every 5 seconds
    const interval = setInterval(loadSummary, 5000)
    return () => clearInterval(interval)
  }, [loadSummary])

  return (
    <div className="flex h-screen bg-tt-bg text-tt-text">
      {/* Sidebar */}
      <nav className="flex w-16 flex-col items-center gap-4 border-r border-tt-border bg-tt-surface py-6">
        <button
          className={`rounded-lg p-3 transition-colors ${view === 'timeline' ? 'bg-tt-accent/20 text-tt-accent' : 'text-tt-muted hover:text-tt-text'}`}
          onClick={() => setView('timeline')}
          title="Timeline"
        >
          <Clock size={22} />
        </button>
        <button
          className={`rounded-lg p-3 transition-colors ${view === 'stats' ? 'bg-tt-accent/20 text-tt-accent' : 'text-tt-muted hover:text-tt-text'}`}
          onClick={() => setView('stats')}
          title="Statistics"
        >
          <BarChart3 size={22} />
        </button>
        <button
          className={`rounded-lg p-3 transition-colors ${view === 'settings' ? 'bg-tt-accent/20 text-tt-accent' : 'text-tt-muted hover:text-tt-text'}`}
          onClick={() => setView('settings')}
          title="Settings"
        >
          <SettingsIcon size={22} />
        </button>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <header className="flex items-center justify-between border-b border-tt-border px-6 py-4">
          <h1 className="text-lg font-semibold">
            {view === 'timeline' ? 'Timeline' : view === 'stats' ? 'Statistics' : 'Settings'}
          </h1>
          {/* Current activity indicator */}
          <div className="flex items-center gap-2 text-sm">
            <Activity
              size={14}
              className={
                currentActivity?.isPaused
                  ? 'text-tt-yellow'
                  : currentActivity?.isAfk
                    ? 'text-tt-muted'
                    : 'text-tt-green'
              }
            />
            <span className="text-tt-muted">
              {currentActivity?.isPaused
                ? '⏸ Paused'
                : currentActivity?.isAfk
                  ? '😴 AFK'
                  : `Now: ${currentActivity?.appName ?? '—'}`}
            </span>
          </div>
        </header>

        <div className="p-6">
          {view === 'timeline' && (
            <DaySummaryView
              summary={summary}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              currentActivity={currentActivity}
            />
          )}
          {view === 'stats' && <PlaceholderView title="Statistics" description="Charts and trends — Phase 5" />}
          {view === 'settings' && <PlaceholderView title="Settings" description="Settings — Phase 7" />}
        </div>
      </main>
    </div>
  )
}

// ─── Day Summary View ──────────────────────────────────────────

function DaySummaryView({
  summary,
  selectedDate,
  onDateChange,
  currentActivity
}: {
  summary: DaySummary[]
  selectedDate: string
  onDateChange: (date: string) => void
  currentActivity: CurrentActivity | null
}): JSX.Element {
  const totalActive = summary.reduce((sum, s) => sum + s.totalTime, 0)

  // Date navigation
  const shiftDate = (days: number): void => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + days)
    onDateChange(d.toISOString().split('T')[0])
  }

  const today = new Date().toISOString().split('T')[0]
  const isToday = selectedDate === today

  return (
    <div className="space-y-6">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => shiftDate(-1)}
          className="rounded-lg border border-tt-border px-3 py-1.5 text-sm hover:bg-tt-surface"
        >
          ← Previous
        </button>
        <div className="flex items-center gap-3">
          <span className="text-lg font-medium">{selectedDate}</span>
          {isToday && <span className="rounded bg-tt-accent/20 px-2 py-0.5 text-xs text-tt-accent">Today</span>}
        </div>
        <button
          onClick={() => shiftDate(1)}
          disabled={isToday}
          className="rounded-lg border border-tt-border px-3 py-1.5 text-sm hover:bg-tt-surface disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      {/* Total active time */}
      <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
        <div className="text-sm text-tt-muted">Total active time</div>
        <div className="mt-1 text-3xl font-semibold text-tt-text">{formatDuration(totalActive)}</div>
      </div>

      {/* Current activity (live) */}
      {isToday && currentActivity && !currentActivity.isAfk && !currentActivity.isPaused && (
        <div className="rounded-lg border border-tt-green/30 bg-tt-green/5 p-4">
          <div className="flex items-center gap-2 text-sm text-tt-green">
            <span className="h-2 w-2 animate-pulse rounded-full bg-tt-green" />
            Currently tracking
          </div>
          <div className="mt-2">
            <span className="text-xl font-medium">{currentActivity.appName}</span>
            {currentActivity.windowTitle && (
              <div className="mt-0.5 truncate text-sm text-tt-muted">{currentActivity.windowTitle}</div>
            )}
          </div>
        </div>
      )}

      {/* App list */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-tt-muted">
          Applications ({summary.length})
        </h2>
        {summary.length === 0 ? (
          <div className="rounded-lg border border-tt-border bg-tt-surface p-8 text-center text-tt-muted">
            No activity recorded yet for this day.
          </div>
        ) : (
          <div className="space-y-2">
            {summary.map((item, idx) => (
              <AppRow key={`${item.appName}-${idx}`} item={item} maxTime={summary[0]?.totalTime ?? 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Single App Row ────────────────────────────────────────────

function AppRow({ item, maxTime }: { item: DaySummary; maxTime: number }): JSX.Element {
  const barWidth = (item.totalTime / maxTime) * 100

  return (
    <div className="flex items-center gap-3 rounded-lg border border-tt-border bg-tt-surface p-3">
      {/* Bar */}
      <div className="relative h-8 flex-1 overflow-hidden rounded">
        <div
          className="absolute inset-y-0 left-0 rounded bg-tt-accent/20"
          style={{ width: `${barWidth}%` }}
        />
        <div className="relative flex h-full items-center justify-between px-3">
          <span className="text-sm font-medium">{item.appName}</span>
        </div>
      </div>
      {/* Time */}
      <div className="w-20 text-right text-sm text-tt-muted">
        {formatDuration(item.totalTime)}
      </div>
      {/* Percentage */}
      <div className="w-12 text-right text-xs text-tt-muted">
        {item.percentage.toFixed(0)}%
      </div>
    </div>
  )
}

// ─── Placeholder ────────────────────────────────────────────────

function PlaceholderView({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h2 className="mb-2 text-xl font-medium text-tt-muted">{title}</h2>
      <p className="text-sm text-tt-muted">{description}</p>
    </div>
  )
}
