// src/main/title-parser.ts
//
// Парсит заголовки окон активных приложений на macOS.
// Назначение: извлечь структурированную информацию из сырого windowTitle,
// который active-win возвращает как строку.
//
// Паттерны заголовков на macOS:
//   VS Code:   "filename.ts — ProjectName"
//   Chrome:    "Page Title - Google Chrome"  (URL в win.url)
//   Safari:    "Page Title"  (URL в win.url)
//   Figma:     "FileName – Figma"  (en-dash)
//   Terminal:  "dir — -zsh"
//
// Подход: per-app парсеры. Регулярные выражения НЕ используются (кроме domain),
// т.к. заголовки варьируются и лучше матчить по окончанию/разделителю.

export interface WindowInfo {
  /** Чистый заголовок для отображения (browser suffix убран) */
  displayTitle: string
  /** Имя проекта (VS Code, Xcode) */
  project?: string
  /** Домен сайта (browsers) — из URL */
  domain?: string
  /** Это браузер? */
  isBrowser: boolean
  /** Сырой URL если есть */
  url?: string
}

// ─── Browser detection ─────────────────────────────────────────

const BROWSER_NAMES = new Set([
  'Google Chrome', 'Chrome', 'Chromium', 'Safari', 'Firefox',
  'Microsoft Edge', 'Arc', 'Brave Browser', 'Opera', 'Vivaldi',
])

const BROWSER_BUNDLES = new Set([
  'com.google.Chrome', 'com.apple.Safari', 'org.mozilla.firefox',
  'com.microsoft.edgemac', 'company.thebrowser.Browser',
  'com.brave.Browser', 'com.operasoftware.Opera', 'com.vivaldi.Vivaldi',
])

function isBrowser(appName: string, bundleId?: string): boolean {
  return BROWSER_NAMES.has(appName) || (!!bundleId && BROWSER_BUNDLES.has(bundleId))
}

// ─── URL / domain helpers ──────────────────────────────────────

function extractDomain(url: string): string | undefined {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    // localhost и IP-адреса — добавляем порт для различения localhost:3001 vs localhost:8501
    if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      return u.port ? `${host}:${u.port}` : host
    }
    return host
  } catch {
    return undefined
  }
}

// ─── Browser title cleaning ────────────────────────────────────

// Суффиксы которые браузеры добавляют к заголовку окна.
// Важно: длинные суффиксы проверяем ПЕРВЫМИ (vs " - Edge" matчит " - Google Chrome").
const BROWSER_SUFFIXES = [
  ' - Google Chrome', ' - Chromium',
  ' — Safari', ' - Safari',
  ' - Mozilla Firefox', ' - Firefox',
  ' - Microsoft Edge',
  ' - Arc', ' - Brave', ' - Opera', ' - Vivaldi',
]

function stripBrowserSuffix(title: string): string {
  for (const suffix of BROWSER_SUFFIXES) {
    if (title.endsWith(suffix)) {
      return title.slice(0, -suffix.length).trim()
    }
  }
  return title
}

// ─── VS Code / Cursor / Windsurf / VSCodium ────────────────────

const CODE_APP_NAMES = ['Code', 'Cursor', 'Windsurf', 'VSCodium']
const CODE_NOISE = /^(Visual Studio Code|Code - Insiders|Cursor|VSCodium|Windsurf)$/i

function parseCodeTitle(title: string): { document: string; project?: string } {
  // VS Code: "filename — ProjectName"
  // Разделяем по em-dash (— U+2014) или en-dash (– U+2013), НЕ по обычному "-"
  // (имена файлов содержат дефисы)
  const parts = title.split(/[—–]\s*/).map((s) => s.trim())
  const clean = parts.filter((p) => !CODE_NOISE.test(p))

  if (clean.length >= 2) {
    return { document: clean[0], project: clean[1] }
  }
  if (clean.length === 1) {
    return { document: clean[0] }
  }
  return { document: title }
}

// ─── Figma ─────────────────────────────────────────────────────

const FIGMA_SUFFIXES = [' – Figma', ' - Figma', ' — Figma']

function parseFigmaTitle(title: string): string {
  for (const suffix of FIGMA_SUFFIXES) {
    if (title.endsWith(suffix)) {
      return title.slice(0, -suffix.length).trim()
    }
  }
  return title
}

// ─── Main entry point ──────────────────────────────────────────

export function parseWindowInfo(
  appName: string,
  windowTitle: string,
  appBundleId?: string,
  url?: string | null
): WindowInfo {
  const browser = isBrowser(appName, appBundleId)

  if (browser) {
    return {
      displayTitle: stripBrowserSuffix(windowTitle),
      domain: url ? extractDomain(url) : undefined,
      url: url ?? undefined,
      isBrowser: true,
    }
  }

  // VS Code / Cursor / Windsurf
  if (CODE_APP_NAMES.some((n) => appName.includes(n)) ||
      appBundleId?.startsWith('com.todesktop') ||
      appBundleId === 'com.microsoft.VSCode' ||
      appBundleId === 'com.todesktop.230313mzl4w4u92') {
    const { document, project } = parseCodeTitle(windowTitle)
    return { displayTitle: document, project, isBrowser: false }
  }

  // Figma
  if (appName === 'Figma' || appBundleId?.includes('figma')) {
    return { displayTitle: parseFigmaTitle(windowTitle), isBrowser: false }
  }

  // Default: return title as-is
  return { displayTitle: windowTitle, isBrowser: false }
}

// ─── Domain grouping for browsers ──────────────────────────────

/**
 * Группирует browser events по домену.
 * Если URL недоступен, пытается извлечь домен из заголовка.
 */
export function groupByDomain(
  entries: { windowTitle: string; url: string | null; totalTime: number }[]
): { domain: string; totalTime: number; titles: { title: string; totalTime: number }[] }[] {
  const groups = new Map<string, { totalTime: number; titles: { title: string; totalTime: number }[] }>()

  for (const entry of entries) {
    let domain: string

    if (entry.url) {
      domain = extractDomain(entry.url) ?? 'unknown'
    } else {
      // Fallback: не можем извлечь домен без URL
      domain = 'unknown'
    }

    const existing = groups.get(domain) ?? { totalTime: 0, titles: [] }
    existing.totalTime += entry.totalTime
    existing.titles.push({ title: entry.windowTitle, totalTime: entry.totalTime })
    groups.set(domain, existing)
  }

  return Array.from(groups.entries())
    .map(([domain, data]) => ({ domain, ...data }))
    .sort((a, b) => b.totalTime - a.totalTime)
}
