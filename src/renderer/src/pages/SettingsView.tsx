import { useState, useEffect } from 'react'
import { Power, Clock, Download } from 'lucide-react'

export default function SettingsView(): JSX.Element {
  const [autostart, setAutostart] = useState(false)
  const [idleThreshold, setIdleThreshold] = useState(180)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load current settings
    Promise.all([
      window.api.settings.get('autostart'),
      window.api.settings.get('idleThreshold')
    ]).then(([auto, idle]) => {
      setAutostart(auto === true || auto === 'true')
      setIdleThreshold(typeof idle === 'number' ? idle : parseInt(String(idle ?? '180')) || 180)
      setLoading(false)
    })
  }, [])

  const toggleAutostart = async (): Promise<void> => {
    const newValue = !autostart
    setAutostart(newValue)
    await window.api.settings.set('autostart', newValue)
  }

  const saveIdleThreshold = async (value: number): Promise<void> => {
    setIdleThreshold(value)
    await window.api.settings.set('idleThreshold', value)
  }

  const exportCsv = async (): Promise<void> => {
    const today = getTodayDate()
    const weekAgo = getDateOffset(-7)
    await window.api.export.csv(weekAgo, today)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {loading ? (
        <div className="text-tt-muted">Loading...</div>
      ) : (
        <>
          {/* General */}
          <div className="space-y-4 rounded-lg border border-tt-border bg-tt-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Power size={16} className="text-tt-accent" />
              General
            </h3>

            {/* Autostart */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Launch at login</div>
                <div className="text-xs text-tt-muted">
                  Start tracking automatically when you log in
                </div>
              </div>
              <button
                onClick={toggleAutostart}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  autostart ? 'bg-tt-accent' : 'bg-tt-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    autostart ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Idle threshold */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Idle threshold</div>
                <div className="text-xs text-tt-muted">
                  Seconds before marking as AFK
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="60"
                  max="600"
                  step="30"
                  value={idleThreshold}
                  onChange={(e) => setIdleThreshold(parseInt(e.target.value))}
                  onMouseUp={(e) => saveIdleThreshold(parseInt((e.target as HTMLInputElement).value))}
                  className="w-32"
                />
                <span className="w-16 text-sm text-tt-muted">
                  {Math.floor(idleThreshold / 60)}m {idleThreshold % 60}s
                </span>
              </div>
            </div>
          </div>

          {/* Data */}
          <div className="space-y-4 rounded-lg border border-tt-border bg-tt-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Download size={16} className="text-tt-accent" />
              Data
            </h3>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Export to CSV</div>
                <div className="text-xs text-tt-muted">
                  Export last 7 days to Downloads folder
                </div>
              </div>
              <button
                onClick={exportCsv}
                className="rounded-lg border border-tt-border px-4 py-2 text-sm hover:bg-tt-bg"
              >
                Export
              </button>
            </div>
          </div>

          {/* About */}
          <div className="space-y-3 rounded-lg border border-tt-border bg-tt-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Clock size={16} className="text-tt-accent" />
              About
            </h3>
            <div className="text-sm text-tt-muted">
              Time Tracker v0.1.0 — local, private time tracking for macOS.
              <br />
              All data is stored locally in SQLite. No network requests.
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function getTodayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDateOffset(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
