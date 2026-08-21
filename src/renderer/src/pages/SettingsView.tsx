import { useState, useEffect } from 'react'
import { Power, Clock, Download, ShieldOff, X, Tag, FileJson } from 'lucide-react'
import type { Category, CategoryRule } from '../../../main/types'

export default function SettingsView(): JSX.Element {
  const [autostart, setAutostart] = useState(false)
  const [idleThreshold, setIdleThreshold] = useState(60)
  const [excludedApps, setExcludedApps] = useState<string[]>([])
  const [newApp, setNewApp] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load current settings
    Promise.all([
      window.api.settings.get('autostart'),
      window.api.settings.get('idleThreshold'),
      window.api.settings.get('excludedApps'),
      window.api.categories.getAll(),
      window.api.rules.getAll()
    ]).then(([auto, idle, excluded, cats, rls]) => {
      setAutostart(auto === true || auto === 'true')
      setIdleThreshold(typeof idle === 'number' ? idle : parseInt(String(idle ?? '60')) || 60)
      setExcludedApps(Array.isArray(excluded) ? excluded : [])
      setCategories(cats as Category[])
      setRules(rls as CategoryRule[])
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

  const saveExcludedApps = async (apps: string[]): Promise<void> => {
    setExcludedApps(apps)
    await window.api.settings.set('excludedApps', apps)
  }

  const addExcludedApp = async (): Promise<void> => {
    const name = newApp.trim()
    if (!name || excludedApps.includes(name)) return
    await saveExcludedApps([...excludedApps, name])
    setNewApp('')
  }

  const removeExcludedApp = async (name: string): Promise<void> => {
    await saveExcludedApps(excludedApps.filter((a) => a !== name))
  }

  const exportCsv = async (): Promise<void> => {
    const today = getTodayDate()
    const weekAgo = getDateOffset(-7)
    await window.api.export.csv(weekAgo, today)
  }

  const exportJson = async (): Promise<void> => {
    const today = getTodayDate()
    const weekAgo = getDateOffset(-7)
    await window.api.export.json(weekAgo, today)
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
                Export CSV
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Export to JSON</div>
                <div className="text-xs text-tt-muted">
                  Export last 7 days with full event data
                </div>
              </div>
              <button
                onClick={exportJson}
                className="flex items-center gap-2 rounded-lg border border-tt-border px-4 py-2 text-sm hover:bg-tt-bg"
              >
                <FileJson size={14} />
                Export JSON
              </button>
            </div>
          </div>

          {/* Exclusion list */}
          <div className="space-y-4 rounded-lg border border-tt-border bg-tt-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <ShieldOff size={16} className="text-tt-accent" />
              Exclusion list
            </h3>
            <div className="text-xs text-tt-muted">
              Apps in this list will not be tracked at all. Enter the exact app name as it appears in the activity list.
            </div>

            {/* Add app input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newApp}
                onChange={(e) => setNewApp(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addExcludedApp()
                }}
                placeholder="App name (e.g., Slack, Maps)"
                className="flex-1 rounded-lg border border-tt-border bg-tt-bg px-3 py-2 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent focus:outline-none"
              />
              <button
                onClick={addExcludedApp}
                disabled={!newApp.trim()}
                className="rounded-lg border border-tt-border px-4 py-2 text-sm hover:bg-tt-bg disabled:opacity-40"
              >
                Add
              </button>
            </div>

            {/* List of excluded apps */}
            {excludedApps.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {excludedApps.map((app) => (
                  <div
                    key={app}
                    className="flex items-center gap-2 rounded-lg border border-tt-border bg-tt-bg px-3 py-1.5 text-sm"
                  >
                    <span>{app}</span>
                    <button
                      onClick={() => removeExcludedApp(app)}
                      className="text-tt-muted hover:text-tt-text"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-tt-muted">No excluded apps.</div>
            )}
          </div>

          {/* Categories */}
          <div className="space-y-4 rounded-lg border border-tt-border bg-tt-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Tag size={16} className="text-tt-accent" />
              Categories
            </h3>
            <div className="text-xs text-tt-muted">
              Categories are assigned automatically via rules. Each category has a productivity weight (-2 to +2).
            </div>

            {/* Category list */}
            <div className="space-y-2">
              {categories.map((cat) => {
                const ruleCount = rules.filter((r) => r.categoryId === cat.id).length
                return (
                  <div
                    key={cat.id}
                    className="flex items-center gap-3 rounded-lg border border-tt-border bg-tt-bg px-3 py-2"
                  >
                    <span
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="flex-1 text-sm">{cat.name}</span>
                    <span className="text-xs text-tt-muted">
                      {ruleCount} {ruleCount === 1 ? 'rule' : 'rules'}
                    </span>
                    <span
                      className="rounded px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor:
                          cat.productivity > 0 ? 'rgba(158, 206, 106, 0.15)'
                          : cat.productivity < 0 ? 'rgba(247, 118, 142, 0.15)'
                          : 'rgba(154, 165, 206, 0.15)',
                        color:
                          cat.productivity > 0 ? '#9ece6a'
                          : cat.productivity < 0 ? '#f7768e'
                          : '#9aa5ce'
                      }}
                    >
                      {cat.productivity > 0 ? '+' : ''}{cat.productivity}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Rules list */}
            {rules.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-tt-muted">Auto-categorization rules</div>
                {rules.map((rule) => {
                  const cat = categories.find((c) => c.id === rule.categoryId)
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs"
                    >
                      <span className="text-tt-muted">{rule.field}</span>
                      <span className="text-tt-muted">·</span>
                      <span className="rounded bg-tt-bg px-1.5 py-0.5 text-tt-muted">
                        {rule.matchType}
                      </span>
                      <span className="truncate text-tt-text">"{rule.value}"</span>
                      <span className="text-tt-muted">→</span>
                      <span className="flex items-center gap-1.5">
                        {cat && (
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                        )}
                        <span>{cat?.name ?? 'Unknown'}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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
