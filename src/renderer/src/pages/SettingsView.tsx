import { useState, useEffect } from 'react'
import { Power, Clock, Download, ShieldOff, X, FileJson } from 'lucide-react'

export default function SettingsView(): JSX.Element {
  const [autostart, setAutostart] = useState(false)
  const [idleThreshold, setIdleThreshold] = useState(60)
  const [excludedApps, setExcludedApps] = useState<string[]>([])
  const [newApp, setNewApp] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load current settings
    Promise.all([
      window.api.settings.get('autostart'),
      window.api.settings.get('idleThreshold'),
      window.api.settings.get('excludedApps')
    ]).then(([auto, idle, excluded]) => {
      setAutostart(auto === true || auto === 'true')
      setIdleThreshold(typeof idle === 'number' ? idle : parseInt(String(idle ?? '60')) || 60)
      setExcludedApps(Array.isArray(excluded) ? excluded : [])
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
      <h2 className="text-lg font-semibold">Настройки</h2>

      {loading ? (
        <div className="text-tt-muted">Загрузка...</div>
      ) : (
        <>
          {/* General */}
          <div className="space-y-4 rounded-lg border border-tt-border bg-tt-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Power size={16} className="text-tt-accent" />
              Основные
            </h3>

            {/* Autostart */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Запускать при входе</div>
                <div className="text-xs text-tt-muted">
                  Автоматически начинать отслеживание при входе в систему
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
                <div className="text-sm">Порог бездействия</div>
                <div className="text-xs text-tt-muted">
                  Секунд до отметки AFK
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
                  {Math.floor(idleThreshold / 60)}м {idleThreshold % 60}с
                </span>
              </div>
            </div>
          </div>

          {/* Data */}
          <div className="space-y-4 rounded-lg border border-tt-border bg-tt-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Download size={16} className="text-tt-accent" />
              Данные
            </h3>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Экспорт в CSV</div>
                <div className="text-xs text-tt-muted">
                  Экспорт последних 7 дней в папку Downloads
                </div>
              </div>
              <button
                onClick={exportCsv}
                className="rounded-lg border border-tt-border px-4 py-2 text-sm hover:bg-tt-bg"
              >
                Экспорт CSV
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Экспорт в JSON</div>
                <div className="text-xs text-tt-muted">
                  Экспорт последних 7 дней с полными данными
                </div>
              </div>
              <button
                onClick={exportJson}
                className="flex items-center gap-2 rounded-lg border border-tt-border px-4 py-2 text-sm hover:bg-tt-bg"
              >
                <FileJson size={14} />
                Экспорт JSON
              </button>
            </div>
          </div>

          {/* Exclusion list */}
          <div className="space-y-4 rounded-lg border border-tt-border bg-tt-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <ShieldOff size={16} className="text-tt-accent" />
              Список исключений
            </h3>
            <div className="text-xs text-tt-muted">
              Приложения из этого списка не отслеживаются. Введите точное имя приложения, как оно отображается в списке активности.
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
                placeholder="Имя приложения (напр., Slack, Maps)"
                className="flex-1 rounded-lg border border-tt-border bg-tt-bg px-3 py-2 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent focus:outline-none"
              />
              <button
                onClick={addExcludedApp}
                disabled={!newApp.trim()}
                className="rounded-lg border border-tt-border px-4 py-2 text-sm hover:bg-tt-bg disabled:opacity-40"
              >
                Добавить
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
              <div className="text-sm text-tt-muted">Нет исключённых приложений.</div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-tt-border bg-tt-surface p-5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Clock size={16} className="text-tt-accent" />
              О приложении
            </h3>
            <div className="text-sm text-tt-muted">
              CarpeDiem v0.1.0 — локальный, приватный трекер времени для macOS.
              <br />
              Все данные хранятся локально в SQLite. Без сетевых запросов.
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
