import { useState, useEffect, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import type { DailyStat, DaySummary, HeatmapCell, TagStat, TagType } from '../../../shared/types'
import { formatDuration, formatShort } from '../lib/format'

const PIE_COLORS = [
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

export default function StatsView(): JSX.Element {
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [topApps, setTopApps] = useState<DaySummary[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([])
  const [tagStats, setTagStats] = useState<TagStat[]>([])
  const [range, setRange] = useState(1) // 1 = today
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [daily, top, heat, tags] = await Promise.all([
      window.api.stats.getDaily(range),
      window.api.stats.getTopApps(
        getFromDate(range),
        getTodayDate(),
        10
      ),
      window.api.stats.getHeatmap(getFromDate(range), getTodayDate()),
      window.api.stats.getTagStats(getFromDate(range), getTodayDate())
    ])
    setDailyStats(daily as DailyStat[])
    setTopApps(top as DaySummary[])
    setHeatmap(heat as HeatmapCell[])
    setTagStats(tags as TagStat[])
    setLoading(false)
  }, [range])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Prepare chart data: pivot byTag into stacked format
  const chartData = dailyStats.map((d) => {
    const row: Record<string, string | number> = { date: d.date.slice(5) }
    for (const t of d.byTag) {
      row[t.tag] = t.seconds
    }
    return row
  })

  // Tag colors for stacked bars
  const TAG_BAR_COLORS: Record<string, string> = {
    work: '#9ece6a',
    neutral: '#7aa2f7',
    distracting: '#f7768e',
    untagged: '#414868'
  }
  const allTags: (TagType | 'untagged')[] = ['work', 'neutral', 'distracting', 'untagged']

  // Pie data from topApps
  const pieData = topApps.map((a) => ({
    name: a.appName,
    value: a.totalTime
  }))

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center gap-3">
        {[1, 7, 14, 30].map((n) => (
          <button
            key={n}
            onClick={() => setRange(n)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              range === n
                ? 'bg-tt-accent text-tt-bg'
                : 'border border-tt-border text-tt-muted hover:text-tt-text'
            }`}
          >
            {n === 1 ? 'Сегодня' : `${n} дней`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-tt-muted">Loading statistics...</div>
      ) : dailyStats.length === 0 ? (
        <div className="rounded-lg border border-tt-border bg-tt-surface p-8 text-center text-tt-muted">
          No data yet. Start using the app to see statistics.
        </div>
      ) : (
        <>
          {/* Daily active time bar chart (stacked by tag) */}
          <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
            <h2 className="mb-4 text-sm font-medium text-tt-muted">Daily active time</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" stroke="#9aa5ce" fontSize={12} />
                <YAxis
                  stroke="#9aa5ce"
                  fontSize={12}
                  tickFormatter={(v: number) => formatShort(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1b26',
                    border: '1px solid #414868',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: '#c0caf5' }}
                  formatter={(value: number) => [formatDuration(value), '']}
                />
                {allTags.map((tag) => (
                  <Bar
                    key={tag}
                    dataKey={tag}
                    stackId="a"
                    fill={TAG_BAR_COLORS[tag] ?? '#414868'}
                    radius={[0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top apps — horizontal bars */}
          <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
            <h2 className="mb-4 text-sm font-medium text-tt-muted">Top applications</h2>
            {pieData.length === 0 ? (
              <div className="py-8 text-center text-tt-muted">No data</div>
            ) : (
              <div className="space-y-2">
                {topApps.slice(0, 10).map((app, idx) => {
                  const maxTime = topApps[0]?.totalTime ?? 1
                  const barWidth = maxTime > 0 ? (app.totalTime / maxTime) * 100 : 0
                  return (
                    <div key={app.appName} className="flex items-center gap-3">
                      <span
                        className="w-32 shrink-0 truncate text-sm"
                        title={app.appName}
                      >
                        {app.appName}
                      </span>
                      <div className="relative h-5 flex-1 overflow-hidden rounded bg-tt-bg">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: PIE_COLORS[idx % PIE_COLORS.length]
                          }}
                          title={`${app.appName}\n${formatDuration(app.totalTime)} (${app.percentage.toFixed(0)}%)`}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs text-tt-muted">
                        {formatDuration(app.totalTime)}
                      </span>
                      <span className="w-10 shrink-0 text-right text-xs text-tt-muted">
                        {app.percentage.toFixed(0)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tag distribution chart */}
          <TagDistributionSection tagStats={tagStats} />

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Total tracked"
              value={formatDuration(
                dailyStats.reduce((s, d) => s + d.totalActive, 0)
              )}
            />
            <StatCard
              label="Daily average"
              value={formatDuration(
                dailyStats.reduce((s, d) => s + d.totalActive, 0) /
                  Math.max(dailyStats.length, 1)
              )}
            />
            <StatCard
              label="Most active day"
              value={
                dailyStats.length > 0
                  ? dailyStats.reduce((max, d) =>
                      d.totalActive > max.totalActive ? d : max
                    ).date
                  : '—'
              }
            />
          </div>

          {/* Activity heatmap */}
          <HeatmapSection heatmap={heatmap} />
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
      <div className="text-xs text-tt-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}

// ─── Heatmap ───────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Heatmap color: 0 → transparent, max → blue */
function heatColor(seconds: number, max: number): string {
  if (seconds === 0 || max === 0) return '#1f2335'
  const intensity = seconds / max
  // Interpolate from dark blue to bright blue
  const alpha = 0.15 + intensity * 0.85
  return `rgba(122, 162, 247, ${alpha})`
}

function formatHM(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function HeatmapSection({ heatmap }: { heatmap: HeatmapCell[] }): JSX.Element {
  if (heatmap.length === 0) {
    return <></>
  }

  const max = Math.max(...heatmap.map((c) => c.seconds), 0)

  // Build 7×24 lookup: grid[day][hour] = seconds
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0)
  )
  for (const cell of heatmap) {
    grid[cell.dayOfWeek][cell.hour] = cell.seconds
  }

  return (
    <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-tt-muted">
        Activity heatmap (day × hour)
      </h2>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="mb-1 flex pl-10">
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="flex-1 text-center text-[10px] text-tt-muted"
                style={{ minWidth: '22px' }}
              >
                {h % 3 === 0 ? `${h}` : ''}
              </div>
            ))}
          </div>
          {/* Grid rows */}
          {grid.map((dayRow, day) => (
            <div key={day} className="mb-0.5 flex items-center">
              <div className="w-10 text-right pr-2 text-xs text-tt-muted">
                {DAYS[day]}
              </div>
              {dayRow.map((seconds, hour) => (
                <div
                  key={hour}
                  className="group relative m-0.5 flex-1 rounded-sm transition-transform hover:scale-125"
                  style={{
                    backgroundColor: heatColor(seconds, max),
                    minWidth: '22px',
                    height: '20px'
                  }}
                >
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-tt-bg px-2 py-1 text-xs text-tt-text shadow-lg group-hover:block">
                    {DAYS[day]} {hour}:00 — {formatHM(seconds)}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {/* Legend */}
          <div className="mt-3 flex items-center gap-2 pl-10 text-xs text-tt-muted">
            <span>Less</span>
            {[0, 0.25, 0.5, 0.75, 1].map((i) => (
              <div
                key={i}
                className="h-3 w-5 rounded-sm"
                style={{ backgroundColor: heatColor(i * max, max) }}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tag distribution ───────────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
  work: '#9ece6a',
  neutral: '#7aa2f7',
  distracting: '#f7768e',
  untagged: '#414868'
}

const TAG_LABELS: Record<string, string> = {
  work: 'Работа',
  neutral: 'Нейтральное',
  distracting: 'Отвлечение',
  untagged: 'Без тега'
}

function TagDistributionSection({ tagStats }: { tagStats: TagStat[] }): JSX.Element {
  const total = tagStats.reduce((s, t) => s + t.seconds, 0)
  if (total === 0) return <></>

  const activeTags = tagStats.filter((t) => t.seconds > 0)
  const maxSeconds = activeTags[0]?.seconds ?? 1

  return (
    <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
      <h2 className="mb-4 text-sm font-medium text-tt-muted">Time by tag</h2>
      <div className="space-y-2">
        {activeTags.map((t) => {
          const barWidth = maxSeconds > 0 ? (t.seconds / maxSeconds) * 100 : 0
          const pct = total > 0 ? ((t.seconds / total) * 100).toFixed(0) : '0'
          return (
            <div key={t.tag} className="flex items-center gap-3">
              <span
                className="w-24 shrink-0 truncate text-sm"
                title={TAG_LABELS[t.tag] ?? t.tag}
              >
                {TAG_LABELS[t.tag] ?? t.tag}
              </span>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-tt-bg">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: TAG_COLORS[t.tag] ?? '#414868'
                  }}
                  title={`${TAG_LABELS[t.tag] ?? t.tag}\n${formatDuration(t.seconds)} (${pct}%)`}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-xs text-tt-muted">
                {formatDuration(t.seconds)}
              </span>
              <span className="w-10 shrink-0 text-right text-xs text-tt-muted">
                {total > 0 ? ((t.seconds / total) * 100).toFixed(0) : 0}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

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
