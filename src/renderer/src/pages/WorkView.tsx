import { useState, useEffect, useCallback } from 'react'
import type { WorkAppStat, TaskStat } from '../../../main/types'
import { formatDuration } from '../lib/format'

const BAR_COLORS = [
  '#7aa2f7',
  '#9ece6a',
  '#e0af68',
  '#f7768e',
  '#bb9af7',
  '#73daca',
  '#ff9e64',
  '#c0caf5',
  '#db4b4b',
  '#1abc9c'
]

/** «Сегодня» = особый режим: from == to == сегодня */
type RangeMode = 'today' | 7 | 14 | 30

const RANGE_OPTIONS: { value: RangeMode; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 7, label: '7 дней' },
  { value: 14, label: '14 дней' },
  { value: 30, label: '30 дней' }
]

/**
 * WorkView — вкладка «Работа».
 *
 * Две секции, каждая — один горизонтальный bar-chart:
 * 1. «По приложениям» — статистика по приложениям/сайтам, отмеченным как 'work'
 * 2. «По задачам» — разбивка по Jira-ключам (ADG-12144 и т.п.), извлечённым
 *    из заголовков окон и URL. Разные вкладки браузеров и Figma с одним
 *    ключом автоматически объединяются (task_key — ключ группировки в SQL).
 */
export default function WorkView(): JSX.Element {
  const [workStats, setWorkStats] = useState<WorkAppStat[]>([])
  const [taskStats, setTaskStats] = useState<TaskStat[]>([])
  const [range, setRange] = useState<RangeMode>('today')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const today = getTodayDate()
    const from = range === 'today' ? today : getFromDate(range as number)
    const [work, tasks] = await Promise.all([
      window.api.stats.getWork(from, today),
      window.api.stats.getTasks(from, today)
    ])
    setWorkStats(work as WorkAppStat[])
    setTaskStats(tasks as TaskStat[])
    setLoading(false)
  }, [range])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totalWorkTime = workStats.reduce((s, w) => s + w.seconds, 0)
  const totalTaskTime = taskStats.reduce((s, t) => s + t.seconds, 0)

  const workBarData = workStats.map((w) => ({
    name: w.targetKey,
    value: w.seconds
  }))

  const taskBarData = taskStats.map((t) => ({
    name: t.taskKey,
    value: t.seconds,
    apps: t.apps.join(', ')
  }))

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center gap-3">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => setRange(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              range === opt.value
                ? 'bg-tt-accent text-tt-bg'
                : 'border border-tt-border text-tt-muted hover:text-tt-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-tt-muted">Loading work statistics...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* ─── По приложениям ─── */}
          <section className="rounded-lg border border-tt-border bg-tt-surface p-4">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-tt-muted">По приложениям</h2>
              {totalWorkTime > 0 && (
                <span className="text-xs text-tt-muted">
                  Total: {formatDuration(totalWorkTime)}
                </span>
              )}
            </div>

            {workStats.length === 0 ? (
              <div className="py-8 text-center text-sm text-tt-muted">
                Нет приложений и сайтов, отмеченных как «работа».
                <br />
                Откройте Timeline и отметьте приложения тегом «Работа» (меню ⋮).
              </div>
            ) : (
              <HBarChart data={workBarData} total={totalWorkTime} />
            )}
          </section>

          {/* ─── По задачам ─── */}
          <section className="rounded-lg border border-tt-border bg-tt-surface p-4">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-tt-muted">По задачам</h2>
              {totalTaskTime > 0 && (
                <span className="text-xs text-tt-muted">
                  Total: {formatDuration(totalTaskTime)}
                </span>
              )}
            </div>

            {taskStats.length === 0 ? (
              <div className="py-8 text-center text-sm text-tt-muted">
                Нет данных по задачам.
                <br />
                Задачи определяются по Jira-ключам (формат: ADG-12144) в заголовках окон
                Figma, Jira и браузера.
              </div>
            ) : (
              <HBarChart
                data={taskBarData}
                total={totalTaskTime}
                renderLabel={(item) => {
                  const stat = taskStats.find((t) => t.taskKey === item.name)
                  if (!stat) return item.name
                  // Показываем ключ + список приложений (вкладки уже объединены)
                  return `${stat.taskKey} — ${stat.apps.join(', ')}`
                }}
              />
            )}
          </section>
        </div>
      )}
    </div>
  )
}

// ─── Horizontal bar chart ──────────────────────────────────────

interface BarItem {
  name: string
  value: number
  apps?: string
}

function HBarChart({
  data,
  total,
  renderLabel
}: {
  data: BarItem[]
  total: number
  renderLabel?: (item: BarItem) => string
}): JSX.Element {
  if (total === 0 || data.length === 0) {
    return <div className="py-8 text-center text-sm text-tt-muted">No data</div>
  }

  const maxVal = data[0]?.value ?? 1

  return (
    <div className="space-y-2">
      {data.map((item, idx) => {
        const barWidth = maxVal > 0 ? (item.value / maxVal) * 100 : 0
        const label = renderLabel ? renderLabel(item) : item.name
        return (
          <div key={`${item.name}-${idx}`} className="flex items-center gap-3">
            <span
              className="w-32 shrink-0 truncate text-sm"
              title={label}
            >
              {label}
            </span>
            <div className="relative h-6 flex-1 overflow-hidden rounded bg-tt-bg">
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: BAR_COLORS[idx % BAR_COLORS.length]
                }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs text-tt-muted">
              {formatDuration(item.value)}
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-tt-muted">
              {total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────

function getTodayDate(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getFromDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days + 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
