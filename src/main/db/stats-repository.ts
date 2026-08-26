/**
 * Stats repository — все агрегирующие запросы для статистики.
 *
 * Ответственность:
 * - getDailyStats / getTopApps / getHeatmap
 * - getTagStats / getWorkStats / getTaskStats
 *
 * Зависит от app_tags (для tag/work stats) через SQL JOIN,
 * не зависит от TagRepository напрямую.
 */
import type Database from 'better-sqlite3'
import type {
  DailyStat,
  DaySummary,
  HeatmapCell,
  TagStat,
  TagType,
  WorkAppStat,
  TaskStat,
  TagTargetType
} from '../../shared/types'
import {
  localDayBounds,
  formatLocalDate,
  extractDomainFromUrl,
  type RawSummaryRow
} from './helpers'
import { TagRepository } from './tag-repository'

export class StatsRepository {
  private tagRepo: TagRepository

  constructor(private db: Database.Database) {
    this.tagRepo = new TagRepository(db)
  }

  /**
   * Возвращает статистику за N последних дней.
   *
   * Оптимизация: вместо 2 запросов на каждый день (2N total) делает
   * 2 запроса за весь диапазон и группирует по дню в JS.
   */
  getDailyStats(days: number): DailyStat[] {
    const today = new Date()
    const fromDate = new Date(today)
    fromDate.setDate(fromDate.getDate() - (days - 1))
    const toStr = formatLocalDate(today)
    const { start, end } = localDayBounds(toStr)

    // 1. Per-day totals (one query for all days)
    const totalRows = this.db
      .prepare(`
        SELECT date(ts_start) AS day, COALESCE(SUM(duration), 0) AS totalActive
        FROM events
        WHERE ts_start >= ? AND ts_start <= ? AND is_afk = 0
        GROUP BY date(ts_start)
      `)
      .all(start, end) as { day: string; totalActive: number }[]
    const totalByDay = new Map(totalRows.map((r) => [r.day, r.totalActive]))

    // 2. Per-day × per-tag breakdown (one query for all events, group in JS)
    const eventRows = this.db
      .prepare(`
        SELECT app_name, url, duration, ts_start
        FROM events
        WHERE ts_start >= ? AND ts_start <= ? AND is_afk = 0
      `)
      .all(start, end) as { app_name: string; url: string | null; duration: number; ts_start: string }[]

    // Pre-load all tags for fast lookup
    const tags = this.tagRepo.getAllAppTags()
    const appTagMap = new Map<string, TagType>()
    const domainTagMap = new Map<string, TagType>()
    for (const t of tags) {
      if (t.targetType === 'app') appTagMap.set(t.targetKey, t.tag)
      else domainTagMap.set(t.targetKey, t.tag)
    }

    // Group events by day + tag
    const tagByDay = new Map<string, Record<string, number>>()
    for (const e of eventRows) {
      const day = e.ts_start.substring(0, 10)
      let dayMap = tagByDay.get(day)
      if (!dayMap) {
        dayMap = { work: 0, neutral: 0, distracting: 0, untagged: 0 }
        tagByDay.set(day, dayMap)
      }

      let tag: TagType | 'untagged' = 'untagged'
      const appTag = appTagMap.get(e.app_name)
      if (appTag) {
        tag = appTag
      } else if (e.url) {
        const domain = extractDomainFromUrl(e.url)
        if (domain) {
          const domainTag = domainTagMap.get(domain)
          if (domainTag) tag = domainTag
        }
      }
      dayMap[tag] = (dayMap[tag] ?? 0) + e.duration
    }

    // Build result for each day in range
    const result: DailyStat[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = formatLocalDate(d)
      const dayMap = tagByDay.get(dateStr) ?? { work: 0, neutral: 0, distracting: 0, untagged: 0 }
      result.push({
        date: dateStr,
        totalActive: totalByDay.get(dateStr) ?? 0,
        byTag: [
          { tag: 'work', seconds: dayMap.work },
          { tag: 'neutral', seconds: dayMap.neutral },
          { tag: 'distracting', seconds: dayMap.distracting },
          { tag: 'untagged', seconds: dayMap.untagged }
        ]
      })
    }
    return result
  }

  /**
   * Возвращает топ приложений за период.
   */
  getTopApps(fromDate: string, toDate: string, limit: number = 10): DaySummary[] {
    const { start } = localDayBounds(fromDate)
    const { end } = localDayBounds(toDate)
    const rows = this.db
      .prepare(`
        SELECT
          e.app_name        AS appName,
          SUM(e.duration)   AS totalTime,
          e.category_id     AS categoryId,
          c.name            AS categoryName
        FROM events e
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE e.ts_start >= ? AND e.ts_start <= ? AND e.is_afk = 0
        GROUP BY e.app_name
        ORDER BY totalTime DESC
        LIMIT ?
      `)
      .all(start, end, limit) as RawSummaryRow[]

    const total = rows.reduce((sum, r) => sum + r.totalTime, 0)
    return rows.map(r => ({
      appName: r.appName,
      totalTime: r.totalTime,
      percentage: total > 0 ? (r.totalTime / total) * 100 : 0,
      categoryId: r.categoryId ?? undefined,
      categoryName: r.categoryName ?? undefined
    }))
  }

  /**
   * Heatmap активности: 7 дней недели × 24 часа.
   */
  getHeatmap(fromDate: string, toDate: string): HeatmapCell[] {
    const { start } = localDayBounds(fromDate)
    const { end: endBound } = localDayBounds(toDate)

    const rows = this.db
      .prepare(`
        SELECT ts_start, duration
        FROM events
        WHERE ts_start >= ? AND ts_start <= ? AND is_afk = 0
      `)
      .all(start, endBound) as { ts_start: string; duration: number }[]

    const grid: Record<string, number> = {}

    for (const row of rows) {
      const d = new Date(row.ts_start)
      const dayOfWeek = d.getDay()
      const hour = d.getHours()
      const key = `${dayOfWeek}-${hour}`
      grid[key] = (grid[key] ?? 0) + row.duration
    }

    const cells: HeatmapCell[] = []
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`
        cells.push({
          dayOfWeek: day,
          hour,
          seconds: grid[key] ?? 0
        })
      }
    }

    return cells
  }

  /**
   * Возвращает распределение времени по тегам за период.
   * Один SQL-запрос с LEFT JOIN к app_tags + extractDomainFromUrl().
   */
  getTagStats(fromDate: string, toDate: string): TagStat[] {
    const { start } = localDayBounds(fromDate)
    const { end: endBound } = localDayBounds(toDate)

    const rows = this.db
      .prepare(`
        SELECT
          COALESCE(
            at.tag,
            dt.tag,
            'untagged'
          ) AS tag,
          SUM(e.duration) AS seconds
        FROM events e
        LEFT JOIN app_tags at
          ON at.target_type = 'app' AND at.target_key = e.app_name
        LEFT JOIN app_tags dt
          ON dt.target_type = 'domain'
          AND dt.target_key = extractDomainFromUrl(e.url)
        WHERE e.ts_start >= ? AND e.ts_start <= ? AND e.is_afk = 0
        GROUP BY tag
      `)
      .all(start, endBound) as { tag: string; seconds: number }[]

    const result: Record<string, number> = {
      work: 0,
      neutral: 0,
      distracting: 0,
      untagged: 0
    }
    for (const row of rows) {
      if (row.tag in result) {
        result[row.tag] = row.seconds
      } else {
        result.untagged += row.seconds
      }
    }

    return [
      { tag: 'work', seconds: result.work },
      { tag: 'neutral', seconds: result.neutral },
      { tag: 'distracting', seconds: result.distracting },
      { tag: 'untagged', seconds: result.untagged }
    ]
  }

  /**
   * Возвращает статистику по приложениям/доменам с тегом 'work'.
   */
  getWorkStats(fromDate: string, toDate: string): WorkAppStat[] {
    const { start } = localDayBounds(fromDate)
    const { end: endBound } = localDayBounds(toDate)

    const rows = this.db
      .prepare(`
        SELECT app_name, url, duration
        FROM events
        WHERE ts_start >= ? AND ts_start <= ? AND is_afk = 0
      `)
      .all(start, endBound) as { app_name: string; url: string | null; duration: number }[]

    const tags = this.tagRepo.getAllAppTags()
    const appWorkTags = new Set<string>()
    const domainWorkTags = new Set<string>()
    for (const t of tags) {
      if (t.tag !== 'work') continue
      if (t.targetType === 'app') appWorkTags.add(t.targetKey)
      else domainWorkTags.add(t.targetKey)
    }

    const totals = new Map<string, { key: string; type: TagTargetType; seconds: number }>()

    for (const row of rows) {
      let workKey: string | null = null
      let workType: TagTargetType | null = null

      if (appWorkTags.has(row.app_name)) {
        workKey = row.app_name
        workType = 'app'
      } else if (row.url) {
        const domain = extractDomainFromUrl(row.url)
        if (domain && domainWorkTags.has(domain)) {
          workKey = domain
          workType = 'domain'
        }
      }

      if (workKey && workType) {
        const existing = totals.get(workKey)
        if (existing) {
          existing.seconds += row.duration
        } else {
          totals.set(workKey, { key: workKey, type: workType, seconds: row.duration })
        }
      }
    }

    const result = Array.from(totals.values()).sort((a, b) => b.seconds - a.seconds)
    const grandTotal = result.reduce((s, r) => s + r.seconds, 0)

    return result.map((r) => ({
      targetKey: r.key,
      targetType: r.type,
      seconds: r.seconds,
      percentage: grandTotal > 0 ? (r.seconds / grandTotal) * 100 : 0
    }))
  }

  /**
   * Возвращает разбивку времени по Jira-ключам задач.
   */
  getTaskStats(fromDate: string, toDate: string): TaskStat[] {
    const { start } = localDayBounds(fromDate)
    const { end: endBound } = localDayBounds(toDate)

    const rows = this.db
      .prepare(`
        SELECT task_key, app_name, SUM(duration) AS total_seconds
        FROM events
        WHERE ts_start >= ? AND ts_start <= ? AND is_afk = 0 AND task_key IS NOT NULL
        GROUP BY task_key, app_name
        ORDER BY total_seconds DESC
      `)
      .all(start, endBound) as { task_key: string; app_name: string; total_seconds: number }[]

    const taskMap = new Map<string, { seconds: number; apps: Set<string> }>()
    for (const row of rows) {
      let entry = taskMap.get(row.task_key)
      if (!entry) {
        entry = { seconds: 0, apps: new Set<string>() }
        taskMap.set(row.task_key, entry)
      }
      entry.seconds += row.total_seconds
      entry.apps.add(row.app_name)
    }

    const result = Array.from(taskMap.entries())
      .map(([key, val]) => ({
        taskKey: key,
        seconds: val.seconds,
        apps: Array.from(val.apps).sort()
      }))
      .sort((a, b) => b.seconds - a.seconds)

    const grandTotal = result.reduce((s, r) => s + r.seconds, 0)
    return result.map((r) => ({
      ...r,
      percentage: grandTotal > 0 ? (r.seconds / grandTotal) * 100 : 0
    }))
  }
}
