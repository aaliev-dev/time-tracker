import { app } from 'electron'
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { log } from './safe-log'

/**
 * AppIcons — получение иконок приложений macOS для отображения в Timeline.
 *
 * Принцип:
 * 1. По bundleId (если есть) — mdfind находит путь к .app
 * 2. Fallback — проверяем стандартные пути: /Applications, /System/Applications
 * 3. Извлечение имени иконки из Info.plist через plutil -convert json
 * 4. Конвертация .icns → PNG 32×32 через sips (с альфа-каналом)
 * 5. Кэш в Map
 *
 * Почему не app.getFileIcon() напрямую:
 * В packaged (unsigned) Electron приложении app.getFileIcon() возвращает
 * одну и ту же generic-иконку для всех приложений (подтверждено через CDP:
 * все 16 иконок идентичны, ~1634 байт). sips читает .icns напрямую из бандла
 * приложения и гарантированно возвращает уникальные иконки.
 *
 * Почему не nativeImage.createFromPath():
 * В packaged Electron nativeImage может не поддерживать формат .icns или
 * возвращать пустое изображение. sips — системная утилита macOS (ImageIO),
 * надёжно работающая с .icns во всех условиях.
 *
 * Полные пути к утилитам (/usr/bin/*) — packaged app может иметь пустой PATH.
 */

// Полные пути к системным утилитам — не зависят от PATH
const SIPS = '/usr/bin/sips'
const PLUTIL = '/usr/bin/plutil'
const MDFIND = '/usr/bin/mdfind'

const iconCache = new Map<string, string | null>()

/**
 * Находит путь к .app по bundleId через mdfind (Spotlight).
 * Если bundleId нет или не найден — пробует стандартные пути по имени.
 */
function resolveAppPath(appName: string, bundleId?: string): string | null {
  // 1. Попытка через bundleId + mdfind
  if (bundleId) {
    try {
      const result = execFileSync(
        MDFIND,
        [`kMDItemCFBundleIdentifier == '${bundleId}'`],
        { encoding: 'utf-8', timeout: 2000 }
      ).trim()
      const lines = result.split('\n').filter((l) => l.trim() && l.endsWith('.app'))
      if (lines.length > 0 && existsSync(lines[0])) {
        return lines[0]
      }
    } catch {
      // mdfind не нашёл или timed out
    }
  }

  // 2. Fallback: стандартные пути по имени приложения
  const candidates = [
    `/Applications/${appName}.app`,
    `/System/Applications/${appName}.app`,
    `/System/Applications/Utilities/${appName}.app`,
    `/System/Library/CoreServices/${appName}.app`,
    join(app.getPath('home'), 'Applications', `${appName}.app`)
  ]

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  return null
}

/**
 * Извлекает имя иконки (CFBundleIconFile) из Info.plist.
 * Использует plutil -convert json (надёжно для binary и XML plist).
 * Fallback на regex-экстракцию и сканирование Resources/.
 */
function getIconFileName(appPath: string): string | null {
  const plistPath = join(appPath, 'Contents', 'Info.plist')
  if (!existsSync(plistPath)) return null

  // Метод 1: plutil → JSON (работает для binary и XML plist)
  try {
    const json = execFileSync(PLUTIL, ['-convert', 'json', '-o', '-', plistPath], {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const plist = JSON.parse(json)
    const iconFile = plist['CFBundleIconFile']
    if (typeof iconFile === 'string' && iconFile.trim()) {
      return iconFile.trim()
    }
  } catch {
    // plutil не сработал — пробуем fallback ниже
  }

  // Метод 2: regex-экстракция из сырых байтов plist
  try {
    const buf = readFileSync(plistPath)
    const content = buf.toString('latin1')

    // XML формат: <key>CFBundleIconFile</key><string>icon_name</string>
    const xmlMatch = content.match(/CFBundleIconFile<\/key>\s*<string>([^<]+)/i)
    if (xmlMatch) {
      return xmlMatch[1].trim()
    }

    // Binary plist: ключ и значение хранятся как строки рядом
    const binMatch = content.match(/CFBundleIconFile[\s\S]{0,30}([A-Za-z0-9_.-]{2,})/)
    if (binMatch) {
      return binMatch[1].trim()
    }
  } catch {
    // Игнорируем ошибки чтения
  }

  // Метод 3 (fallback): ищем любой .icns в Resources
  const resourcesDir = join(appPath, 'Contents', 'Resources')
  if (existsSync(resourcesDir)) {
    try {
      const files = readdirSync(resourcesDir)
      const icnsFile = files.find((f) => f.endsWith('.icns'))
      if (icnsFile) {
        return icnsFile
      }
    } catch {
      // Игнорируем
    }
  }

  return null
}

/**
 * Конвертирует .icns → PNG 32×32 через sips, возвращает data URL.
 * sips сохраняет alpha channel — прозрачный фон иконок остаётся прозрачным.
 * Возвращает null, если конвертация не удалась.
 */
function iconViaSips(icnsPath: string): string | null {
  let tempDir: string | null = null
  try {
    tempDir = mkdtempSync(join(tmpdir(), 'cd-icon-'))
    const pngPath = join(tempDir, 'icon.png')

    execFileSync(
      SIPS,
      ['-s', 'format', 'png', '-z', '32', '32', icnsPath, '--out', pngPath],
      { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
    )

    if (!existsSync(pngPath)) return null

    const buf = readFileSync(pngPath)
    // Реальная иконка минимум ~500 байт
    if (buf.length < 100) return null

    const base64 = buf.toString('base64')
    return `data:image/png;base64,${base64}`
  } catch {
    return null
  } finally {
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // Игнорируем ошибки очистки
      }
    }
  }
}

/**
 * Возвращает data URL иконки приложения (PNG 32×32 с прозрачностью, base64).
 * Кэшируется по ключу bundleId||appName.
 * Возвращает null, если иконка недоступна (в renderer покажется fallback — первая буква).
 *
 * PNG вместо JPEG: macOS app icons имеют прозрачный фон (alpha channel).
 * JPEG не поддерживает прозрачность → transparent pixels станут чёрными и
 * иконки будут невидимы на тёмном фоне (#16161e).
 */
export async function getAppIcon(appName: string, bundleId?: string): Promise<string | null> {
  const cacheKey = bundleId || appName
  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey) ?? null
  }

  const appPath = resolveAppPath(appName, bundleId)
  if (!appPath) {
    log.debug(`[AppIcons] Path not found: ${appName} (${bundleId ?? 'no bundleId'})`)
    iconCache.set(cacheKey, null)
    return null
  }

  try {
    // Метод 1: sips конвертация .icns → PNG (primary)
    const iconFileName = getIconFileName(appPath)
    if (iconFileName) {
      // Имя может быть «app.icns» или «app» — нормализуем
      const baseName = iconFileName.replace(/\.icns$/i, '')
      const resourcesDir = join(appPath, 'Contents', 'Resources')
      const candidates = [
        join(resourcesDir, `${baseName}.icns`),
        join(resourcesDir, iconFileName)
      ]
      for (const icnsPath of candidates) {
        if (existsSync(icnsPath)) {
          const dataUrl = iconViaSips(icnsPath)
          if (dataUrl) {
            iconCache.set(cacheKey, dataUrl)
            return dataUrl
          }
        }
      }
    }

    // Метод 2: Fallback на app.getFileIcon() (generic, но хоть что-то)
    const icon = await app.getFileIcon(appPath, { size: 'normal' })
    if (icon.isEmpty()) {
      iconCache.set(cacheKey, null)
      return null
    }
    const resized = icon.resize({ width: 32, height: 32 })
    const base64 = resized.toPNG().toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`
    iconCache.set(cacheKey, dataUrl)
    return dataUrl
  } catch (err) {
    log.debug(`[AppIcons] Failed: ${appName}:`, err)
    iconCache.set(cacheKey, null)
    return null
  }
}
