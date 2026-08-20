import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { ActivityEvent, Category, DaySummary } from './types'

/**
 * Database — обёртка над better-sqlite3.
 *
 * Архитектурные решения:
 * - Синхронный API (better-sqlite3 синхронный по дизайну). В main process
 *   Electron это безопасно — main process не блокирует UI renderer'а.
 * - Миграции применяются при инициализации, версионные (001_initial.sql, ...).
 * - Все запросы — prepared statements (не пересоздаются при каждом вызове).
 */
export class DatabaseManager {
  private db: Database.Database

  constructor(dbPath?: string) {
    const path = dbPath ?? this.getDefaultDbPath()
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL') // WAL — быстрее для частых записей
    this.db.pragma('foreign_keys = ON')
    this.runMigrations()
  }

  private getDefaultDbPath(): string {
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'timetracker.db')
  }

  // ─── Migrations ──────────────────────────────────────────────

  private runMigrations(): void {
    // В dev режиме __dirname = out/main/, миграции в src/main/migrations/
    // В prod (packaged) — миграции в resources/migrations/
    const candidates = [
      join(__dirname, '../../src/main/migrations'),  // dev: out/main/ → src/main/migrations/
      join(app.getAppPath(), 'src/main/migrations'),  // alt dev path
      join(process.resourcesPath ?? '', 'migrations') // prod: packaged resources
    ]

    let migrationsDir: string | null = null
    let files: string[] = []

    for (const dir of candidates) {
      try {
        const found = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
        if (found.length > 0) {
          migrationsDir = dir
          files = found
          break
        }
      } catch {
        // directory doesn't exist, try next
      }
    }

    if (!migrationsDir) {
      throw new Error('Migrations directory not found. Checked: ' + candidates.join(', '))
    }

    this.applyMigrationsFromDir(migrationsDir, files)
  }

  private applyMigrationsFromDir(dir: string, files: string[]): void {
    for (const file of files) {
      const sql = readFileSync(join(dir, file), 'utf-8')
      this.db.exec(sql)
    }
  }

  // ─── Events CRUD ─────────────────────────────────────────────

  /**
   * Вставка нового события. Идемпотентна: если запись с тем же ts_start
   * уже существует — обновляет её (ON CONFLICT DO UPDATE).
   */
  insertEvent(event: Omit<ActivityEvent, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO events (ts_start, ts_end, duration, app_name, app_bundle, window_title, url, category_id, is_afk, is_private)
      VALUES (@tsStart, @tsEnd, @duration, @appName, @appBundleId, @windowTitle, @url, @categoryId, @isAfk, @isPrivate)
    `)
    const result = stmt.run({
      tsStart: event.tsStart,
      tsEnd: event.tsEnd,
      duration: event.duration,
      appName: event.appName,
      appBundleId: event.appBundleId ?? null,
      windowTitle: event.windowTitle,
      url: event.url ?? null,
      categoryId: event.categoryId ?? null,
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
   * Возвращает все события за конкретный день (от 00:00 до 23:59:59).
   */
  getEventsByDay(date: string): ActivityEvent[] {
    const dayStart = `${date}T00:00:00.000Z`
    const dayEnd = `${date}T23:59:59.999Z`
    const rows = this.db
      .prepare<
        unknown[]
      >(`SELECT * FROM events WHERE ts_start >= ? AND ts_start <= ? ORDER BY ts_start ASC`)
      .all(dayStart, dayEnd) as RawEventRow[]
    return rows.map(rowToEvent)
  }

  /**
   * Возвращает события за диапазон дат.
   */
  getEventsByRange(from: string, to: string): ActivityEvent[] {
    const rows = this.db
      .prepare<
        unknown[]
      >(`SELECT * FROM events WHERE ts_start >= ? AND ts_start <= ? ORDER BY ts_start ASC`)
      .all(from, to) as RawEventRow[]
    return rows.map(rowToEvent)
  }

  /**
   * Возвращает сводку за день: appName → totalTime, с процентами.
   */
  getDaySummary(date: string): DaySummary[] {
    const dayStart = `${date}T00:00:00.000Z`
    const dayEnd = `${date}T23:59:59.999Z`
    const rows = this.db
      .prepare<
        unknown[]
      >(`
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
      .all(dayStart, dayEnd) as RawSummaryRow[]

    const total = rows.reduce((sum, r) => sum + r.totalTime, 0)
    return rows.map((r) => ({
      appName: r.appName,
      totalTime: r.totalTime,
      percentage: total > 0 ? (r.totalTime / total) * 100 : 0,
      categoryId: r.categoryId ?? undefined,
      categoryName: r.categoryName ?? undefined
    }))
  }

  // ─── Categories ──────────────────────────────────────────────

  getAllCategories(): Category[] {
    const rows = this.db
      .prepare<
        unknown[]
      >(`SELECT * FROM categories ORDER BY sort_order ASC`)
      .all() as RawCategoryRow[]
    return rows.map(rowToCategory)
  }

  upsertCategory(category: Partial<Category>): Category {
    if (category.id) {
      const stmt = this.db.prepare(`
        UPDATE categories
        SET name = COALESCE(@name, name),
            color = COALESCE(@color, color),
            productivity = COALESCE(@productivity, productivity),
            sort_order = COALESCE(@sortOrder, sort_order)
        WHERE id = @id
      `)
      stmt.run({
        id: category.id,
        name: category.name ?? null,
        color: category.color ?? null,
        productivity: category.productivity ?? null,
        sortOrder: category.sortOrder ?? null
      })
      return this.getCategoryById(category.id)!
    }

    const stmt = this.db.prepare(`
      INSERT INTO categories (name, color, productivity, sort_order)
      VALUES (@name, @color, @productivity, @sortOrder)
    `)
    const result = stmt.run({
      name: category.name!,
      color: category.color ?? '#e0af68',
      productivity: category.productivity ?? 0,
      sortOrder: category.sortOrder ?? 0
    })
    return this.getCategoryById(Number(result.lastInsertRowid))!
  }

  deleteCategory(id: number): void {
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  }

  private getCategoryById(id: number): Category | undefined {
    const row = this.db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .get(id) as RawCategoryRow | undefined
    return row ? rowToCategory(row) : undefined
  }

  // ─── Settings ────────────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  close(): void {
    this.db.close()
  }
}

// ─── Row mappers (DB → TypeScript) ─────────────────────────────

interface RawEventRow {
  id: number
  ts_start: string
  ts_end: string
  duration: number
  app_name: string
  app_bundle: string | null
  window_title: string
  url: string | null
  category_id: number | null
  is_afk: number
  is_private: number
}

function rowToEvent(row: RawEventRow): ActivityEvent {
  return {
    id: row.id,
    tsStart: row.ts_start,
    tsEnd: row.ts_end,
    duration: row.duration,
    appName: row.app_name,
    appBundleId: row.app_bundle ?? undefined,
    windowTitle: row.window_title,
    url: row.url,
    categoryId: row.category_id,
    isAfk: row.is_afk === 1,
    isPrivate: row.is_private === 1
  }
}

interface RawCategoryRow {
  id: number
  name: string
  color: string
  productivity: number
  sort_order: number
}

function rowToCategory(row: RawCategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    productivity: row.productivity,
    sortOrder: row.sort_order
  }
}

interface RawSummaryRow {
  appName: string
  totalTime: number
  categoryId: number | null
  categoryName: string | null
}
