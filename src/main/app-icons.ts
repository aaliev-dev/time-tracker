import { app, nativeImage } from 'electron'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { log } from './safe-log'

/**
 * AppIcons — получение иконок приложений macOS для отображения в Timeline.
 *
 * Принцип:
 * 1. По bundleId (если есть) — mdfind находит путь к .app
 * 2. Fallback — проверяем стандартные пути: /Applications, /System/Applications
 * 3. app.getFileIcon() → NativeImage → resize 32×32 → JPEG base64 (компактно для IPC)
 * 4. Кэш в Map (один раз вычисляем, навсегда храним в памяти main process)
 */

const iconCache = new Map<string, string | null>()

/**
 * Находит путь к .app по bundleId через mdfind (Spotlight).
 * Если bundleId нет или не найден — пробует стандартные пути по имени.
 */
function resolveAppPath(appName: string, bundleId?: string): string | null {
  // 1. Попытка через bundleId + mdfind
  if (bundleId) {
    try {
      const result = execSync(
        `mdfind "kMDItemCFBundleIdentifier == '${bundleId}'"`,
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
    join(app.getPath('home'), 'Applications', `${appName}.app`)
  ]

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  return null
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
    log.debug(`[AppIcons] Path not found for: ${appName} (${bundleId ?? 'no bundleId'})`)
    iconCache.set(cacheKey, null)
    return null
  }

  try {
    const icon = await app.getFileIcon(appPath, { size: 'normal' })
    // Проверяем, что иконка не пустая
    if (icon.isEmpty()) {
      iconCache.set(cacheKey, null)
      return null
    }

    const resized = icon.resize({ width: 32, height: 32 })
    // PNG сохраняет alpha channel — прозрачный фон остаётся прозрачным
    const base64 = resized.toPNG().toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`

    iconCache.set(cacheKey, dataUrl)
    log.debug(`[AppIcons] Icon resolved for: ${appName}`)
    return dataUrl
  } catch (err) {
    log.debug(`[AppIcons] Failed to get icon for ${appName}:`, err)
    iconCache.set(cacheKey, null)
    return null
  }
}
