import { useState, useEffect, useCallback } from 'react'
import type { WorkAppStat, TaskStat } from '../../../main/types'
import { formatDuration } from '../lib/format'

/**
 * WorkView — вкладка «Работа».
 *
 * Две секции:
 * 1. «По приложениям» — статистика по приложениям/сайтам, отмеченным как 'work'
 * 2. «По задачам» — разбивка по Jira-ключам (ADG-12144 и т.п.), извлечённым
 *    из заголовков окон и URL
 *
 * Дизайн совпадает с StatsView: селектор диапазона (7/14/30 дней),
 * карточки с данными, горизонтальные бары.
 */
export default function WorkView(): JSX.Element {
  const [workStats, setWorkStats] = useState<WorkAppStat[]>([])
  const [taskStats, setTaskStats] = useState<TaskStat[]>([])
  const [range, setRange] = useState(7)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [work, tasks] = await Promise.all([
      window.api.stats.getWork(getFromDate(range), getTodayDate()),
      window.api.stats.getTasks(getFromDate(range), getTodayDate())
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

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-tt-muted">Last</span>
        {[7, 14, 30].map((n) => (
          <button
            key={n}
            onClick={() => setRange(n)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              range === n
                ? 'bg-tt-accent text-tt-bg'
                : 'border border-tt-border text-tt-muted hover:text-tt-text'
            }`}
          >
            {n} days
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-tt-muted">Loading work statistics...</div>
      ) : (
        <>
          {/* ─── По приложениям ─── */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-tt-muted">По приложениям</h2>
              {totalWorkTime > 0 && (
                <span className="text-xs text-tt-muted">
                  Total: {formatDuration(totalWorkTime)}
                </span>
              )}
            </div>

            {workStats.length === 0 ? (
              <div className="rounded-lg border border-tt-border bg-tt-surface p-8 text-center text-sm text-tt-muted">
                Нет приложений и сайтов, отмеченных как «работа».
                <br />
                Откройте Timeline и отметьте приложения тегом «Работа» ( меню ⋮ ).
              </div>
            ) : (
              <div className="space-y-2">
                {workStats.map((stat) => (
                  <WorkAppRow key={`${stat.targetType}:${stat.targetKey}`} stat={stat} maxSeconds={workStats[0]?.seconds ?? 1} />
                ))}
              </div>
            )}
          </section>

          {/* ─── По задачам ─── */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-tt-muted">По задачам</h2>
              {totalTaskTime > 0 && (
                <span className="text-xs text-tt-muted">
                  Total: {formatDuration(totalTaskTime)}
                </span>
              )}
            </div>

            {taskStats.length === 0 ? (
              <div className="rounded-lg border border-tt-border bg-tt-surface p-8 text-center text-sm text-tt-muted">
                Нет данных по задачам.
                <br />
                Задачи определяются по Jira-ключам (формат: ADG-12144) в заголовках окон
                Figma, Jira и браузера.
              </div>
            ) : (
              <div className="space-y-2">
                {taskStats.map((stat) => (
                  <TaskRow key={stat.taskKey} stat={stat} maxSeconds={taskStats[0]?.seconds ?? 1} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// ─── Work app row ───────────────────────────────────────────────

function WorkAppRow({ stat, maxSeconds }: { stat: WorkAppStat; maxSeconds: number }): JSX.Element {
  const barWidth = maxSeconds > 0 ? (stat.seconds / maxSeconds) * 100 : 0
  const isDomain = stat.targetType === 'domain'

  return (
    <div className="flex items-center gap-3 rounded-lg border border-tt-border bg-tt-surface px-4 py-3">
      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tt-accent/15 text-tt-accent">
        {isDomain ? '🌐' : '🖥'}
      </div>

      {/* Name + bar */}
      <div className="flex-1">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm font-medium">{stat.targetKey}</span>
          <div className="flex items-center gap-2 text-xs text-tt-muted">
            <span>{formatDuration(stat.seconds)}</span>
            <span className="w-10 text-right">{stat.percentage.toFixed(0)}%</span>
          </div>
        </div>
        {/* Bar */}
        <div className="h-1.5 overflow-hidden rounded-full bg-tt-bg">
          <div
            className="h-full rounded-full bg-tt-accent/60 transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Task row ──────────────────────────────────────────────────

function TaskRow({ stat, maxSeconds }: { stat: TaskStat; maxSeconds: number }): JSX.Element {
  const barWidth = maxSeconds > 0 ? (stat.seconds / maxSeconds) * 100 : 0

  return (
    <div className="flex items-center gap-3 rounded-lg border border-tt-border bg-tt-surface px-4 py-3">
      {/* Task key badge */}
      <div className="flex h-8 shrink-0 items-center rounded-lg bg-tt-accent/15 px-2 font-mono text-xs font-medium text-tt-accent">
        {stat.taskKey}
      </div>

      {/* Apps + bar */}
      <div className="flex-1">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="truncate text-xs text-tt-muted">
            {stat.apps.join(', ')}
          </span>
          <div className="flex items-center gap-2 text-xs text-tt-muted">
            <span>{formatDuration(stat.seconds)}</span>
            <span className="w-10 text-right">{stat.percentage.toFixed(0)}%</span>
          </div>
        </div>
        {/* Bar */}
        <div className="h-1.5 overflow-hidden rounded-full bg-tt-bg">
          <div
            className="h-full rounded-full bg-tt-accent/50 transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
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
