import { useState, useEffect, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import type { DailyStat, DaySummary } from '../../../main/types'
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
  const [range, setRange] = useState(7)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [daily, top] = await Promise.all([
      window.api.stats.getDaily(range),
      window.api.stats.getTopApps(
        getFromDate(range),
        getTodayDate(),
        10
      )
    ])
    setDailyStats(daily as DailyStat[])
    setTopApps(top as DaySummary[])
    setLoading(false)
  }, [range])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Prepare chart data: pivot byCategory into stacked format
  const chartData = dailyStats.map((d) => {
    const row: Record<string, string | number> = { date: d.date.slice(5) }
    for (const cat of d.byCategory) {
      row[cat.category] = cat.seconds
    }
    return row
  })

  // Collect all category names for stacked bars
  const allCategories = Array.from(
    new Set(dailyStats.flatMap((d) => d.byCategory.map((c) => c.category)))
  )

  // Pie data from topApps
  const pieData = topApps.map((a) => ({
    name: a.appName,
    value: a.totalTime
  }))

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
        <div className="py-20 text-center text-tt-muted">Loading statistics...</div>
      ) : dailyStats.length === 0 ? (
        <div className="rounded-lg border border-tt-border bg-tt-surface p-8 text-center text-tt-muted">
          No data yet. Start using the app to see statistics.
        </div>
      ) : (
        <>
          {/* Daily active time bar chart */}
          <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
            <h2 className="mb-4 text-sm font-medium text-tt-muted">Daily active time</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" stroke="#565f89" fontSize={12} />
                <YAxis
                  stroke="#565f89"
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
                {allCategories.length > 0 ? (
                  allCategories.map((cat, idx) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="a"
                      fill={PIE_COLORS[idx % PIE_COLORS.length]}
                      radius={[0, 0, 0, 0]}
                    />
                  ))
                ) : (
                  <Bar dataKey="_" fill="#7aa2f7" />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top apps pie chart */}
          <div className="rounded-lg border border-tt-border bg-tt-surface p-4">
            <h2 className="mb-4 text-sm font-medium text-tt-muted">Top applications</h2>
            {pieData.length === 0 ? (
              <div className="py-8 text-center text-tt-muted">No data</div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={40}
                    >
                      {pieData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1b26',
                        border: '1px solid #414868',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [formatDuration(value), '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {topApps.slice(0, 8).map((app, idx) => (
                    <div key={app.appName} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-3 w-3 rounded-sm"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="flex-1 truncate">{app.appName}</span>
                      <span className="text-tt-muted">{formatDuration(app.totalTime)}</span>
                      <span className="w-10 text-right text-xs text-tt-muted">
                        {app.percentage.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

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
