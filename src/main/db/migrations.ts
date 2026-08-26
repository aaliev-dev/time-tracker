/**
 * Migration runner — отслеживает применённые миграции через schema_migrations.
 *
 * Архитектура:
 * - Каждая миграция выполняется в транзакции вместе с записью в schema_migrations
 *   — атомарность: провал → миграция не помечена как применённая.
 * - Для существующих БД (обновлённых со старого кода): если таблица events уже
 *   существует, все текущие миграции помечаются как применённые.
 */
import type Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { log } from '../safe-log'

/**
 * Запускает все неприменённые миграции из директории migrations/.
 */
export function runMigrations(db: Database.Database): void {
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

  initMigrationsTable(db)
  applyMigrations(db, migrationsDir, files)
}

/**
 * Создаёт таблицу schema_migrations для отслеживания применённых миграций.
 * Без этого миграции 001–006 выполнялись при КАЖДОМ запуске (благодаря
 * IF NOT EXISTS это было safe для schema, но data-migrations типа 005
 * с DELETE/UPDATE — рискованно при повторном выполнении).
 */
function initMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

/**
 * Применяет только новые (ещё не выполненные) миграции.
 *
 * Для существующих БД (обновлённых со старого кода без schema_migrations):
 * если таблица events уже существует — все миграции из директории
 * помечаются как уже применённые (старый runner выполнял их с IF NOT EXISTS
 * при каждом запуске). После этого новые миграции отслеживаются штатно.
 */
function applyMigrations(db: Database.Database, dir: string, files: string[]): void {
  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations')
    .all() as { version: string }[]

  // First run with new system: detect existing DB (events table exists)
  if (appliedRows.length === 0) {
    const hasEventsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
      .get()

    if (hasEventsTable) {
      // Existing DB upgraded from old code — mark all current migrations as applied
      const tx = db.transaction(() => {
        for (const file of files) {
          db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file)
        }
      })
      tx()
      log.info('[Database] Existing DB detected — marked', files.length, 'migrations as already applied')
      return
    }
  }

  const applied = new Set(appliedRows.map((r) => r.version))

  for (const file of files) {
    if (applied.has(file)) continue

    log.info('[Database] Applying migration:', file)
    const sql = readFileSync(join(dir, file), 'utf-8')

    // Atomic: migrate + record in single transaction
    const tx = db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file)
    })
    tx()

    log.info('[Database] Migration applied:', file)
  }
}
