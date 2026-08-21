import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { ActivityEvent, Category, CategoryRule, DaySummary, DailyStat, ProductivityStat, HeatmapCell, DetailedDaySummary } from './types'

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
   * Автоматически категоризует через rules.
   */
  insertEvent(event: Omit<ActivityEvent, 'id'>): number {
    // Auto-categorize if no explicit category
    const categoryId = event.categoryId ?? this.categorizeEvent(
      event.appName,
      event.windowTitle,
      event.appBundleId,
      event.url ?? undefined
    )
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
      categoryId: categoryId ?? null,
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
      .prepare<
        unknown[]
      >(`SELECT * FROM events WHERE ts_start >= ? AND ts_start <= ? ORDER BY ts_start ASC`)
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
      .prepare<
        unknown[]
      >(`SELECT * FROM events WHERE ts_start >= ? AND ts_start <= ? ORDER BY ts_start ASC`)
      .all(start, end) as RawEventRow[]
    return rows.map(rowToEvent)
  }

  /**
   * Возвращает сводку за день: appName → totalTime, с процентами.
   */
  getDaySummary(date: string): DaySummary[] {
    const { start, end } = localDayBounds(date)
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

  // ─── Stats ───────────────────────────────────────────────────

  /**
   * Возвращает статистику за N последних дней.
   */
  getDailyStats(days: number): DailyStat[] {
    const result: DailyStat[] = []
    const today = new Date()

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = formatLocalDate(d)
      const { start, end } = localDayBounds(dateStr)

      const row = this.db
        .prepare(`
          SELECT COALESCE(SUM(duration), 0) AS totalActive
          FROM events
          WHERE ts_start >= ? AND ts_start <= ? AND is_afk = 0
        `)
        .get(start, end) as { totalActive: number }

      // Per-category query
      const catRows = this.db
        .prepare(`
          SELECT
            COALESCE(c.name, 'Uncategorized')  AS category,
            SUM(e.duration)                      AS seconds
          FROM events e
          LEFT JOIN categories c ON e.category_id = c.id
          WHERE e.ts_start >= ? AND e.ts_start <= ? AND e.is_afk = 0
          GROUP BY COALESCE(c.name, 'Uncategorized')
          ORDER BY seconds DESC
        `)
        .all(start, end) as { category: string; seconds: number }[]

      result.push({
        date: dateStr,
        totalActive: row.totalActive ?? 0,
        byCategory: catRows.map(r => ({ category: r.category, seconds: r.seconds }))
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
   * Productivity score за N последних дней.
   * Score = (Σ(category.productivity × seconds) / Σ(seconds) + 2) / 4 × 100
   * где productivity: -2 (distracting) .. +2 (productive)
   *_uncategorized → productivity = 0 (neutral)
   */
  getProductivityStats(days: number): ProductivityStat[] {
    const result: ProductivityStat[] = []
    const today = new Date()

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = formatLocalDate(d)
      const { start, end } = localDayBounds(dateStr)

      const rows = this.db
        .prepare(`
          SELECT
            COALESCE(c.productivity, 0) AS productivity,
            SUM(e.duration)              AS seconds
          FROM events e
          LEFT JOIN categories c ON e.category_id = c.id
          WHERE e.ts_start >= ? AND e.ts_start <= ? AND e.is_afk = 0
          GROUP BY COALESCE(c.productivity, 0)
        `)
        .all(start, end) as { productivity: number; seconds: number }[]

      const totalActive = rows.reduce((s, r) => s + r.seconds, 0)

      let productiveTime = 0
      let distractingTime = 0
      let neutralTime = 0
      let weightedSum = 0

      for (const r of rows) {
        if (r.productivity > 0) productiveTime += r.seconds
        else if (r.productivity < 0) distractingTime += r.seconds
        else neutralTime += r.seconds
        weightedSum += r.productivity * r.seconds
      }

      // weighted avg: -2..+2 → mapped to 0..100
      const weightedAvg = totalActive > 0 ? weightedSum / totalActive : 0
      const score = Math.round(((weightedAvg + 2) / 4) * 100)

      result.push({
        date: dateStr,
        score,
        totalActive,
        productiveTime,
        distractingTime,
        neutralTime
      })
    }

    return result
  }

  /**
   * Heatmap активности: 7 дней недели × 24 часа.
   * Каждый event разбивается по часу начала (приближение).
   * Возвращает массив ячеек { dayOfWeek(0-6), hour(0-23), seconds }.
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

    // Build full 7×24 grid (return all cells, including zero)
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
   * Детальная сводка за день: appName с разбивкой по window_title.
   * Возвращает приложения с подсписком окон/вкладок.
   */
  getDaySummaryDetailed(date: string): DetailedDaySummary[] {
    const { start, end } = localDayBounds(date)
    const rows = this.db
      .prepare<
        unknown[]
      >(`
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

    // Group by app name
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

  /** Получить категорию по имени (например 'AFK', 'Development') */
  getCategoryByName(name: string): Category | undefined {
    const row = this.db
      .prepare('SELECT * FROM categories WHERE name = ?')
      .get(name) as RawCategoryRow | undefined
    return row ? rowToCategory(row) : undefined
  }

  // ─── Category Rules ──────────────────────────────────────────

  /**
   * Возвращает все правила авто-категоризации.
   */
  getCategoryRules(): CategoryRule[] {
    const rows = this.db
      .prepare('SELECT * FROM category_rules ORDER BY category_id, field')
      .all() as RawRuleRow[]
    return rows.map(rowToRule)
  }

  /**
   * Создаёт или обновляет правило категоризации.
   */
  upsertRule(rule: Partial<CategoryRule>): CategoryRule {
    if (rule.id) {
      this.db
        .prepare(`
          UPDATE category_rules
          SET category_id = COALESCE(@categoryId, category_id),
              field = COALESCE(@field, field),
              match_type = COALESCE(@matchType, match_type),
              value = COALESCE(@value, value)
          WHERE id = @id
        `)
        .run({
          id: rule.id,
          categoryId: rule.categoryId ?? null,
          field: rule.field ?? null,
          matchType: rule.matchType ?? null,
          value: rule.value ?? null
        })
      return this.getRuleById(rule.id)!
    }
    const result = this.db
      .prepare('INSERT INTO category_rules (category_id, field, match_type, value) VALUES (?, ?, ?, ?)')
      .run(rule.categoryId!, rule.field!, rule.matchType!, rule.value!)
    return this.getRuleById(Number(result.lastInsertRowid))!
  }

  deleteRule(id: number): void {
    this.db.prepare('DELETE FROM category_rules WHERE id = ?').run(id)
  }

  private getRuleById(id: number): CategoryRule | undefined {
    const row = this.db
      .prepare('SELECT * FROM category_rules WHERE id = ?')
      .get(id) as RawRuleRow | undefined
    return row ? rowToRule(row) : undefined
  }

  /**
   * Применяет правила к событию и возвращает category_id.
   * Первое совпавшее правило выигрывает (priority by insertion order).
   */
  categorizeEvent(
    appName: string,
    windowTitle: string,
    appBundleId?: string,
    url?: string | null
  ): number | null {
    const rules = this.db
      .prepare('SELECT * FROM category_rules ORDER BY id ASC')
      .all() as RawRuleRow[]

    for (const rule of rules) {
      let fieldValue: string
      switch (rule.field) {
        case 'app_name': fieldValue = appName; break
        case 'window_title': fieldValue = windowTitle; break
        case 'app_bundle': fieldValue = appBundleId ?? ''; break
        case 'url': fieldValue = url ?? ''; break
        default: continue
      }

      if (this.matchRule(rule.match_type, rule.value, fieldValue)) {
        return rule.category_id
      }
    }
    return null
  }

  /**
   * Проверяет совпадение значения по типу match.
   */
  private matchRule(matchType: string, pattern: string, value: string): boolean {
    switch (matchType) {
      case 'equals':
        return value.toLowerCase() === pattern.toLowerCase()
      case 'contains':
        return value.toLowerCase().includes(pattern.toLowerCase())
      case 'startsWith':
        return value.toLowerCase().startsWith(pattern.toLowerCase())
      case 'regex':
        try { return new RegExp(pattern, 'i').test(value) } catch { return false }
      default:
        return false
    }
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

interface RawDetailedRow {
  appName: string
  appBundleId: string | null
  windowTitle: string
  url: string | null
  totalTime: number
  categoryId: number | null
  categoryName: string | null
}

interface RawRuleRow {
  id: number
  category_id: number
  field: string
  match_type: string
  value: string
}

function rowToRule(row: RawRuleRow): CategoryRule {
  return {
    id: row.id,
    categoryId: row.category_id,
    field: row.field as CategoryRule['field'],
    matchType: row.match_type as CategoryRule['matchType'],
    value: row.value
  }
}

// ─── Timezone helpers ───────────────────────────────────────────

/**
 * Возвращает ISO-строки для начала и конца локального дня.
 * date — в формате "YYYY-MM-DD" (локальная дата).
 *
 * Проблема: new Date().toISOString() отдаёт UTC.
 * Если пользователь в UTC+3, 22:00 локально = 19:00 UTC.
 * Если искать "2026-08-20T00:00:00.000Z" — это UTC-полночь,
 * а не локальная. Решение: конструируем Date из локальных компонентов.
 */
export function localDayBounds(date: string): { start: string; end: string } {
  const [year, month, day] = date.split('-').map(Number)
  const start = new Date(year, month - 1, day, 0, 0, 0, 0)
  const end = new Date(year, month - 1, day, 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * Форматирует Date в локальную дату "YYYY-MM-DD" (без UTC-сдвига).
 */
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
