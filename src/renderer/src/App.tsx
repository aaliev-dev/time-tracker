import { useState, useEffect } from 'react'
import { Clock, Activity, BarChart3, Settings as SettingsIcon } from 'lucide-react'

type View = 'timeline' | 'stats' | 'settings'

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('timeline')
  const [currentApp, setCurrentApp] = useState<string>('—')

  useEffect(() => {
    // Poll current activity every 2 seconds
    const interval = setInterval(async () => {
      const result = await window.api.tracking.getCurrent()
      if (result?.appName) {
        setCurrentApp(result.appName)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

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
          <div className="flex items-center gap-2 text-sm text-tt-muted">
            <Activity size={14} className="text-tt-green" />
            <span>Now: {currentApp}</span>
          </div>
        </header>

        <div className="p-6">
          {view === 'timeline' && <PlaceholderView title="Timeline" description="Day timeline will appear here" />}
          {view === 'stats' && <PlaceholderView title="Statistics" description="Charts and trends will appear here" />}
          {view === 'settings' && <PlaceholderView title="Settings" description="Settings will appear here" />}
        </div>
      </main>
    </div>
  )
}

function PlaceholderView({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h2 className="mb-2 text-xl font-medium text-tt-muted">{title}</h2>
      <p className="text-sm text-tt-muted">{description}</p>
      <p className="mt-4 text-xs text-tt-border">Phase 1 — coming soon</p>
    </div>
  )
}
