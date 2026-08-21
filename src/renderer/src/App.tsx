import { useState, useEffect, useCallback, useRef, Component, type ReactNode } from 'react'
import { Clock, Activity, BarChart3, Settings as SettingsIcon, ChevronRight, List } from 'lucide-react'
import type { CurrentActivity, DetailedDaySummary, WindowEntry } from '../../main/types'
import { formatDuration, formatLocalDate } from './lib/format'
import StatsView from './pages/StatsView'
import SettingsView from './pages/SettingsView'
import LogView from './pages/LogView'

// ─── Error Boundary ────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-tt-bg p-8 text-center text-tt-text">
          <h1 className="text-xl font-semibold text-tt-red">Something went wrong</h1>
          <p className="max-w-md text-sm text-tt-muted">{this.state.error}</p>
          <p className="text-xs text-tt-muted">
            window.api is {typeof window !== 'undefined' && 'api' in window ? 'available' : 'NOT available'}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── API guard ─────────────────────────────────────────────────

function hasApi(): boolean {
  return typeof window !== 'undefined' && !!window.api
}

type View = 'timeline' | 'log' | 'stats' | 'settings'

export default function App(): JSX.Element {
  if (!hasApi()) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-tt-bg p-8 text-center text-tt-text">
        <Clock size={48} className="text-tt-accent" />
        <h1 className="text-xl font-semibold">Time Tracker</h1>
        <p className="max-w-md text-sm text-tt-muted">
          Preload script not loaded. If running outside Electron, this is expected.
        </p>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  )
}

function AppInner(): JSX.Element {
  const [view, setView] = useState<View>('timeline')
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity | null>(null)
  const [summary, setSummary] = useState<DetailedDaySummary[]>([])
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()))

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
    const result = await window.api.activities.getSummaryDetailed(selectedDate)
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
      {/* Sidebar — extra top padding for macOS traffic lights */}
      <nav className="drag-region flex w-16 flex-col items-center gap-4 border-r border-tt-border bg-tt-surface pt-12 pb-6">
        <button
          className={`no-drag rounded-lg p-3 transition-colors ${view === 'timeline' ? 'bg-tt-accent/30 text-tt-accent' : 'text-tt-muted hover:text-tt-text'}`}
          onClick={() => setView('timeline')}
          title="Timeline"
        >
          <Clock size={22} />
        </button>
        <button
          className={`no-drag rounded-lg p-3 transition-colors ${view === 'log' ? 'bg-tt-accent/30 text-tt-accent' : 'text-tt-muted hover:text-tt-text'}`}
          onClick={() => setView('log')}
          title="Daily Log"
        >
          <List size={22} />
        </button>
        <button
          className={`no-drag rounded-lg p-3 transition-colors ${view === 'stats' ? 'bg-tt-accent/30 text-tt-accent' : 'text-tt-muted hover:text-tt-text'}`}
          onClick={() => setView('stats')}
          title="Statistics"
        >
          <BarChart3 size={22} />
        </button>
        <button
          className={`no-drag rounded-lg p-3 transition-colors ${view === 'settings' ? 'bg-tt-accent/30 text-tt-accent' : 'text-tt-muted hover:text-tt-text'}`}
          onClick={() => setView('settings')}
          title="Settings"
        >
          <SettingsIcon size={22} />
        </button>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <header className="drag-region flex items-center justify-between border-b border-tt-border px-6 py-4">
          <h1 className="text-lg font-semibold">
            {view === 'timeline' ? 'Timeline' : view === 'log' ? 'Daily Log' : view === 'stats' ? 'Statistics' : 'Settings'}
          </h1>
          {/* Current activity indicator */}
          <div className="no-drag flex items-center gap-2 text-sm">
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
            <span className="max-w-md truncate text-tt-muted">
              {currentActivity?.isPaused
                ? '⏸ Paused'
                : currentActivity?.isAfk
                  ? '😴 AFK'
                  : currentActivity?.windowTitle
                    ? `${currentActivity.appName} — ${currentActivity.windowTitle}`
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
            />
          )}
          {view === 'log' && (
            <LogView
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
            />
          )}
          {view === 'stats' && <StatsView />}
          {view === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
  )
}

// ─── Day Summary View ──────────────────────────────────────────

function DaySummaryView({
  summary,
  selectedDate,
  onDateChange
}: {
  summary: DetailedDaySummary[]
  selectedDate: string
  onDateChange: (date: string) => void
}): JSX.Element {
  const totalActive = summary.reduce((sum, s) => sum + s.totalTime, 0)

  // Date navigation
  const shiftDate = (days: number): void => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + days)
    onDateChange(formatLocalDate(d))
  }

  const today = formatLocalDate(new Date())
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
          {isToday && <span className="rounded bg-tt-accent/25 px-2 py-0.5 text-xs font-medium text-tt-accent">Today</span>}
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

// ─── App icons & browser helpers ────────────────────────────────

/** Браузеры — для них группируем вкладки по домену вместо имени окна */
const BROWSER_APPS = new Set([
  'Chrome', 'Google Chrome', 'Chromium', 'Brave Browser',
  'Safari', 'Firefox', 'Arc', 'Microsoft Edge', 'Edge',
  'Vivaldi', 'Opera', 'Thorium'
])

/** Проверяет, является ли приложение браузером */
function isBrowser(appName: string): boolean {
  return BROWSER_APPS.has(appName)
}

/** Извлекает домен из URL (без www.) */
function extractDomain(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
  // Не валидный URL — попробуем найти домен вручную
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i)
    return match ? match[1] : null
  }
}

/** Группировка вкладок браузера по домену */
interface DomainGroup {
  domain: string
  totalTime: number
  tabs: WindowEntry[]
}

function groupByDomain(windows: WindowEntry[]): DomainGroup[] {
  const domainMap = new Map<string, DomainGroup>()

  for (const win of windows) {
    const domain = extractDomain(win.url) ?? '(no URL)'
    let group = domainMap.get(domain)
    if (!group) {
      group = { domain, totalTime: 0, tabs: [] }
      domainMap.set(domain, group)
    }
    group.totalTime += win.totalTime
    group.tabs.push(win)
  }

  const groups = Array.from(domainMap.values())
  groups.sort((a, b) => b.totalTime - a.totalTime)
  return groups
}

/** Hook: загружает иконку приложения через IPC, кэширует в ref */
const iconCache = new Map<string, string | null>()
function useAppIcon(appName: string, bundleId?: string | null): string | null {
  const [icon, setIcon] = useState<string | null>(() => {
    const key = bundleId || appName
    return iconCache.get(key) ?? null
  })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const key = bundleId || appName
    const cached = iconCache.get(key)
    if (cached !== undefined) {
      setIcon(cached)
      return
    }
    // Загружаем иконку
    window.api.apps.getIcon(appName, bundleId ?? undefined).then((dataUrl) => {
      iconCache.set(key, dataUrl)
      if (mountedRef.current) setIcon(dataUrl)
    })
  }, [appName, bundleId])

  return icon
}

/** Компактная иконка 28×28 или fallback — первая буква в кружке */
function AppIcon({ appName, bundleId }: { appName: string; bundleId?: string | null }): JSX.Element {
  const icon = useAppIcon(appName, bundleId)
  if (icon) {
    return <img src={icon} alt={appName} className="h-7 w-7 shrink-0 rounded" />
  }
  // Fallback — кружок с первой буквой
  const initial = appName.charAt(0).toUpperCase()
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-tt-accent/30 text-xs font-bold text-tt-accent">
      {initial}
    </div>
  )
}

// ─── Single App Row ────────────────────────────────────────────

function AppRow({ item, maxTime }: { item: DetailedDaySummary; maxTime: number }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const barWidth = (item.totalTime / maxTime) * 100
  const browser = isBrowser(item.appName)
  const hasDetail = browser
    ? groupByDomain(item.windows).length > 1
    : item.windows.length > 1

  return (
    <div className="rounded-lg border border-tt-border bg-tt-surface">
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`flex w-full items-center gap-2 p-3 ${hasDetail ? 'cursor-pointer hover:bg-tt-bg/50' : 'cursor-default'}`}
      >
        {/* Chevron or spacer */}
        <div className="w-4 shrink-0">
          {hasDetail && (
            <ChevronRight
              size={16}
              className={`text-tt-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          )}
        </div>
        {/* App icon */}
        <AppIcon appName={item.appName} bundleId={item.appBundleId} />
        {/* Bar */}
        <div className="relative h-8 flex-1 overflow-hidden rounded">
          <div
            className="absolute inset-y-0 left-0 rounded bg-tt-accent/35"
            style={{ width: `${barWidth}%` }}
          />
          <div className="relative flex h-full items-center px-3">
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
      </button>

      {/* Expanded: browser → domains with tabs; other apps → windows */}
      {expanded && hasDetail && (
        browser ? (
          <BrowserDetail windows={item.windows} />
        ) : (
          <div className="border-t border-tt-border px-3 pb-2 pt-1">
            {item.windows.map((win, idx) => (
              <div key={idx} className="flex items-center gap-2 py-1.5 pl-12">
                <span className="flex-1 truncate text-xs text-tt-text/70">{win.windowTitle || '(empty)'}</span>
                <span className="w-20 text-right text-xs text-tt-text/70">{formatDuration(win.totalTime)}</span>
                <span className="w-12" />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

/** Browser detail: domains with drill-down to individual tabs */
function BrowserDetail({ windows }: { windows: WindowEntry[] }): JSX.Element {
  const groups = groupByDomain(windows)
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)

  return (
    <div className="border-t border-tt-border px-3 pb-2 pt-1">
      {groups.map((group) => {
        const showTabs = expandedDomain === group.domain
        const multiTabs = group.tabs.length > 1

        return (
          <div key={group.domain} className="py-1 pl-12">
            <button
              onClick={() => multiTabs && setExpandedDomain(showTabs ? null : group.domain)}
              className={`flex w-full items-center gap-1.5 ${multiTabs ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {multiTabs && (
                <ChevronRight
                  size={12}
                  className={`text-tt-muted transition-transform ${showTabs ? 'rotate-90' : ''}`}
                />
              )}
              {!multiTabs && <div className="w-3" />}
              <span className="flex-1 truncate text-xs font-medium text-tt-text/80">{group.domain}</span>
              <span className="w-20 text-right text-xs text-tt-muted">{formatDuration(group.totalTime)}</span>
              <div className="w-12" />
            </button>

            {showTabs && multiTabs && (
              <div className="mt-0.5 ml-4 space-y-0.5 border-l border-tt-border/50 pl-3">
                {group.tabs.map((tab, idx) => (
                  <div key={idx} className="flex items-center gap-1 py-0.5">
                    <span className="flex-1 truncate text-[11px] text-tt-muted">
                      {tab.windowTitle || tab.url || '(empty)'}
                    </span>
                    <span className="w-20 text-right text-[11px] text-tt-muted">{formatDuration(tab.totalTime)}</span>
                    <div className="w-12" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


