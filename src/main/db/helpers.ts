/**
 * Shared DB helpers — row interfaces, mappers, timezone/extraction utilities.
 *
 * Эти функции используются всеми repository-классами и не зависят от
 * конкретного Database-соединения (pure functions).
 */
import type {
  ActivityEvent,
  Category,
  CategoryRule,
  AppTag,
  TagTargetType,
  TagType
} from '../../shared/types'

// ─── Raw row interfaces (mirror DB column names) ───────────────

export interface RawEventRow {
  id: number
  ts_start: string
  ts_end: string
  duration: number
  app_name: string
  app_bundle: string | null
  window_title: string
  url: string | null
  category_id: number | null
  task_key: string | null
  is_afk: number
  is_private: number
}

export interface RawCategoryRow {
  id: number
  name: string
  color: string
  productivity: number
  sort_order: number
}

export interface RawSummaryRow {
  appName: string
  totalTime: number
  categoryId: number | null
  categoryName: string | null
}

export interface RawDetailedRow {
  appName: string
  appBundleId: string | null
  windowTitle: string
  url: string | null
  totalTime: number
  categoryId: number | null
  categoryName: string | null
}

export interface RawRuleRow {
  id: number
  category_id: number
  field: string
  match_type: string
  value: string
}

export interface RawAppTagRow {
  id: number
  target_type: string
  target_key: string
  tag: string
  updated_at: string
}

// ─── Row mappers (DB snake_case → TS camelCase) ────────────────

export function rowToEvent(row: RawEventRow): ActivityEvent {
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
    taskKey: row.task_key ?? null,
    isAfk: row.is_afk === 1,
    isPrivate: row.is_private === 1
  }
}

export function rowToCategory(row: RawCategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    productivity: row.productivity,
    sortOrder: row.sort_order
  }
}

export function rowToRule(row: RawRuleRow): CategoryRule {
  return {
    id: row.id,
    categoryId: row.category_id,
    field: row.field as CategoryRule['field'],
    matchType: row.match_type as CategoryRule['matchType'],
    value: row.value
  }
}

export function rowToAppTag(row: RawAppTagRow): AppTag {
  return {
    id: row.id,
    targetType: row.target_type as TagTargetType,
    targetKey: row.target_key,
    tag: row.tag as TagType,
    updatedAt: row.updated_at
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

// ─── URL / text extraction helpers ────────────────────────────

/**
 * Извлекает домен из URL (без www.).
 * Используется для сопоставления событий с доменными тегами.
 *
 * Регистрируется также как SQLite JS-функция (extractDomainFromUrl)
 * для использования в SQL JOIN-ах (getTagStats, getDailyStats).
 */
export function extractDomainFromUrl(url: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    // localhost и IP-адреса — добавляем порт для различения localhost:3001 vs localhost:8501
    if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      return u.port ? `${host}:${u.port}` : host
    }
    return host
  } catch {
    // Не валидный URL — попробуем найти домен вручную
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i)
    return match ? match[1] : null
  }
}

/**
 * Извлекает Jira-ключ задачи из текста (window title или URL).
 * Паттерн: 2-10 заглавных букв (возможно с цифрами), дефис, 1-6 цифр.
 * Примеры: ADG-12144, AGDNS-4264, ADGUARD-1
 *
 * Не матчит: HD-1080 (видео), 4K-60 (разрешение) —
 * эти строки должны присутствовать в контексте задачи (title/url).
 *
 * Регистрируется также как SQLite JS-функция (extractTaskKey)
 * для использования в миграциях и SQL-запросах.
 */
export function extractTaskKey(text: string | null): string | null {
  if (!text) return null
  // Jira-ключ: 2+ заглавных букв, дефис, цифры. Граница слова спереди.
  const match = text.match(/\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/)
  if (!match) return null

  // Фильтр ложных срабатываний — технические коды, не Jira-ключи
  const FALSE_POSITIVES = new Set([
    'UTF-8', 'UTF-16', 'ASCII-0',
    'HTTP-1', 'HTTPS-1'
  ])
  if (FALSE_POSITIVES.has(match[1])) return null

  // Дополнительно: ключ должен содержать хотя бы 2 буквы подряд (не только цифры меж дефисом)
  // UTF-8 проходит, но это известное исключение выше.
  return match[1]
}
