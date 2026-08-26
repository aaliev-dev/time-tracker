/**
 * Event repository — CRUD для событий (events table).
 *
 * Ответственность:
 * - insertEvent / closeEvent / getEventsByDay / getEventsByRange
 * - getDaySummary / getDaySummaryDetailed
 * - getAfkTimeForDay
 *
 * Не зависит от categories/rules/tags — только events table + LEFT JOIN categories.
 */
import type Database from 'better-sqlite3'
import type { ActivityEvent, DaySummary, DetailedDaySummary } from '../../shared/types'
import {
  rowToEvent,
  localDayBounds,
  extractTaskKey,
  type RawEventRow,
  type RawSummaryRow,
  type RawDetailedRow
} from './helpers'

export class EventRepository {
  constructor(private db: Database.Database) {}

  /**
   * Вставка нового события. Идемпотентна: если запись с тем же ts_start
   * уже существует — обновляет её (ON CONFLICT DO UPDATE).
   * Автоматически категоризует через rules (вызывает callback).
   */
  insertEvent(
    event: Omit<ActivityEvent, 'id'>,
    categorize?: (appName: string, windowTitle: string, appBundleId?: string, url?: string | null) => number | null
  ): number {
    const categoryId = event.categoryId ?? categorize?.(
      event.appName,
      event.windowTitle,
      event.appBundleId,
      event.url ?? undefined
    ) ?? null

    const taskKey = event.taskKey ?? extractTaskKey(event.windowTitle) ?? extractTaskKey(event.url ?? '')

    const stmt = this.db.prepare(`
      INSERT INTO events (ts_start, ts_end, duration, app_name, app_bundle, window_title, url, category_id, task_key, is_afk, is_private)
      VALUES (@tsStart, @tsEnd, @duration, @appName, @appBundleId, @windowTitle, @url, @categoryId, @taskKey, @isAfk, @isPrivate)
    `)
    const result = stmt.run({
      tsStart: event.tsStart,
      tsEnd: event.tsEnd,
      duration: event.duration,
      appName: event.appName,
      appBundleId: event.appBundleId ?? null,
      windowTitle: event.windowTitle,
      url: event.url ?? null,
      categoryId: categoryId ?? null,
      taskKey: taskKey ?? null,
      isAfk: event.isAfk ? 1 : 0,
      isPrivate: event.isPrivate ? 1 : 0
    })
    return Number(result.lastInsertRowid)
  }

  /**
   * Закрывает событие: устанавливает ts_end и duration.
   * Вызывается при смене активного app/title или при AFK.
   */
  closeEvent(id: number, tsEnd: string, duration: number): void {
    this.db
      .prepare('UPDATE events SET ts_end = ?, duration = ? WHERE id = ?')
      .run(tsEnd, duration, id)
  }

  /**
   * Возвращает все события за конкретный день (локальный timezone).
   */
  getEventsByDay(date: string): ActivityEvent[] {
    const { start, end } = localDayBounds(date)
    const rows = this.db
      .prepare('SELECT * FROM events WHERE ts_start >= ? AND ts_start <= ? ORDER BY ts_start ASC')
      .all(start, end) as RawEventRow[]
    return rows.map(rowToEvent)
  }

  /**
   * Возвращает события за диапазон дат (локальный timezone).
   */
  getEventsByRange(fromDate: string, toDate: string): ActivityEvent[] {
    const { start } = localDayBounds(fromDate)
    const { end } = localDayBounds(toDate)
    const rows = this.db
      .prepare('SELECT * FROM events WHERE ts_start >= ? AND ts_start <= ? ORDER BY ts_start ASC')
      .all(start, end) as RawEventRow[]
    return rows.map(rowToEvent)
  }

  /**
   * Возвращает сводку за день: appName → totalTime, с процентами.
   */
  getDaySummary(date: string): DaySummary[] {
    const { start, end } = localDayBounds(date)
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
      `)
      .all(start, end) as RawSummaryRow[]

    const total = rows.reduce((sum, r) => sum + r.totalTime, 0)
    return rows.map((r) => ({
      appName: r.appName,
      totalTime: r.totalTime,
      percentage: total > 0 ? (r.totalTime / total) * 100 : 0,
      categoryId: r.categoryId ?? undefined,
      categoryName: r.categoryName ?? undefined
    }))
  }

  /**
   * Детальная сводка за день: appName с разбивкой по window_title.
   */
  getDaySummaryDetailed(date: string): DetailedDaySummary[] {
    const { start, end } = localDayBounds(date)
    const rows = this.db
      .prepare(`
        SELECT
          e.app_name        AS appName,
          e.app_bundle      AS appBundleId,
          e.window_title    AS windowTitle,
          e.url             AS url,
          SUM(e.duration)   AS totalTime,
          e.category_id     AS categoryId,
          c.name            AS categoryName
        FROM events e
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE e.ts_start >= ? AND e.ts_start <= ? AND e.is_afk = 0
        GROUP BY e.app_name, e.window_title, e.url
        ORDER BY e.app_name, totalTime DESC
      `)
      .all(start, end) as RawDetailedRow[]

    const appMap = new Map<string, DetailedDaySummary>()
    for (const row of rows) {
      let app = appMap.get(row.appName)
      if (!app) {
        app = {
          appName: row.appName,
          appBundleId: row.appBundleId,
          totalTime: 0,
          percentage: 0,
          categoryId: row.categoryId ?? undefined,
          categoryName: row.categoryName ?? undefined,
          windows: []
        }
        appMap.set(row.appName, app)
      }
      app.totalTime += row.totalTime
      app.windows.push({
        windowTitle: row.windowTitle,
        url: row.url,
        totalTime: row.totalTime
      })
    }

    const result = Array.from(appMap.values())
    const total = result.reduce((sum, a) => sum + a.totalTime, 0)
    result.forEach((a) => (a.percentage = total > 0 ? (a.totalTime / total) * 100 : 0))
    result.sort((a, b) => b.totalTime - a.totalTime)
    return result
  }

  /**
   * Возвращает суммарное время AFK (бездействия) за день.
   */
  getAfkTimeForDay(date: string): number {
    const { start, end } = localDayBounds(date)
    const row = this.db
      .prepare(`
        SELECT COALESCE(SUM(duration), 0) AS totalAfk
        FROM events
        WHERE ts_start >= ? AND ts_start <= ? AND is_afk = 1
      `)
      .get(start, end) as { totalAfk: number }
    return row.totalAfk ?? 0
  }
}
