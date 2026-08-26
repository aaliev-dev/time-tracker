/**
 * DatabaseManager — фасад над репозиториями.
 *
 * Композирует:
 * - EventRepository (events CRUD, day summaries)
 * - CategoryRepository (categories + rules, auto-categorization)
 * - TagRepository (app/domain tags)
 * - StatsRepository (all stats queries)
 * - SettingsRepository (key-value settings)
 *
 * Открывает соединение, запускает миграции, регистрирует SQLite JS-функции.
 *
 * Backward-compatible: все методы старого DatabaseManager доступны
 * как делегирующие методы (db.insertEvent → events.insertEvent и т.д.),
 * чтобы callers (tracking-engine, ipc-handlers, index.ts) не нужно было
 * менять одновременно. Новые callers должны использовать db.events.*
 * напрямую.
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import type {
  ActivityEvent,
  Category,
  CategoryRule,
  DaySummary,
  DailyStat,
  HeatmapCell,
  DetailedDaySummary,
  AppTag,
  TagTargetType,
  TagType,
  TagStat,
  WorkAppStat,
  TaskStat
} from '../shared/types'
import { runMigrations } from './db/migrations'
import { EventRepository } from './db/event-repository'
import { CategoryRepository } from './db/category-repository'
import { TagRepository } from './db/tag-repository'
import { StatsRepository } from './db/stats-repository'
import { SettingsRepository } from './db/settings-repository'
import { extractTaskKey, extractDomainFromUrl, localDayBounds, formatLocalDate } from './db/helpers'

// Re-export shared helpers and types for backward compat
export { extractTaskKey, extractDomainFromUrl, localDayBounds, formatLocalDate }

export class DatabaseManager {
  private db: Database.Database

  // Repository instances — public for new callers (db.events.insertEvent)
  readonly events: EventRepository
  readonly categories: CategoryRepository
  readonly tags: TagRepository
  readonly stats: StatsRepository
  readonly settings: SettingsRepository

  constructor(dbPath?: string) {
    const path = dbPath ?? this.getDefaultDbPath()
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    // Регистрируем JS-функции для SQL (используются в миграциях и stats queries)
    this.db.function('extractTaskKey', (text: string | null): string | null => {
      return extractTaskKey(text)
    })
    this.db.function('extractDomainFromUrl', (url: string | null): string | null => {
      return extractDomainFromUrl(url ?? '')
    })

    // Композируем репозитории
    this.events = new EventRepository(this.db)
    this.categories = new CategoryRepository(this.db)
    this.tags = new TagRepository(this.db)
    this.stats = new StatsRepository(this.db)
    this.settings = new SettingsRepository(this.db)

    runMigrations(this.db)
  }

  private getDefaultDbPath(): string {
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'timetracker.db')
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  close(): void {
    this.db.close()
  }

  // ─── Backward-compatible delegating methods ──────────────────
  // Эти методы делегируют в репозитории, чтобы существующие callers
  // (tracking-engine, ipc-handlers, index.ts) работали без изменений.
  // Новые callers должны использовать db.events.* / db.categories.* и т.д.

  // EventRepository
  insertEvent(event: Omit<ActivityEvent, 'id'>): number {
    return this.events.insertEvent(event, (appName, windowTitle, appBundleId, url) =>
      this.categories.categorizeEvent(appName, windowTitle, appBundleId, url)
    )
  }
  closeEvent(id: number, tsEnd: string, duration: number): void { this.events.closeEvent(id, tsEnd, duration) }
  getEventsByDay(date: string): ActivityEvent[] { return this.events.getEventsByDay(date) }
  getEventsByRange(fromDate: string, toDate: string): ActivityEvent[] { return this.events.getEventsByRange(fromDate, toDate) }
  getDaySummary(date: string): DaySummary[] { return this.events.getDaySummary(date) }
  getDaySummaryDetailed(date: string): DetailedDaySummary[] { return this.events.getDaySummaryDetailed(date) }
  getAfkTimeForDay(date: string): number { return this.events.getAfkTimeForDay(date) }

  // CategoryRepository
  getAllCategories(): Category[] { return this.categories.getAllCategories() }
  getCategoryById(id: number): Category | undefined { return this.categories.getCategoryById(id) }
  getCategoryByName(name: string): Category | undefined { return this.categories.getCategoryByName(name) }
  upsertCategory(category: Partial<Category>): Category { return this.categories.upsertCategory(category) }
  deleteCategory(id: number): void { this.categories.deleteCategory(id) }
  getCategoryRules(): CategoryRule[] { return this.categories.getCategoryRules() }
  upsertRule(rule: Partial<CategoryRule>): CategoryRule { return this.categories.upsertRule(rule) }
  deleteRule(id: number): void { this.categories.deleteRule(id) }
  categorizeEvent(
    appName: string,
    windowTitle: string,
    appBundleId?: string,
    url?: string | null
  ): number | null { return this.categories.categorizeEvent(appName, windowTitle, appBundleId, url) }

  // TagRepository
  getAllAppTags(): AppTag[] { return this.tags.getAllAppTags() }
  setAppTag(targetType: TagTargetType, targetKey: string, tag: TagType): AppTag { return this.tags.setAppTag(targetType, targetKey, tag) }
  deleteAppTag(targetType: TagTargetType, targetKey: string): void { this.tags.deleteAppTag(targetType, targetKey) }

  // StatsRepository
  getDailyStats(days: number): DailyStat[] { return this.stats.getDailyStats(days) }
  getTopApps(fromDate: string, toDate: string, limit?: number): DaySummary[] { return this.stats.getTopApps(fromDate, toDate, limit) }
  getHeatmap(fromDate: string, toDate: string): HeatmapCell[] { return this.stats.getHeatmap(fromDate, toDate) }
  getTagStats(fromDate: string, toDate: string): TagStat[] { return this.stats.getTagStats(fromDate, toDate) }
  getWorkStats(fromDate: string, toDate: string): WorkAppStat[] { return this.stats.getWorkStats(fromDate, toDate) }
  getTaskStats(fromDate: string, toDate: string): TaskStat[] { return this.stats.getTaskStats(fromDate, toDate) }

  // SettingsRepository
  getSetting(key: string): string | null { return this.settings.getSetting(key) }
  setSetting(key: string, value: string): void { this.settings.setSetting(key, value) }
}
