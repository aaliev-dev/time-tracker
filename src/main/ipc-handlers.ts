import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { DatabaseManager } from './database'
import type { TrackingEngine } from './tracking-engine'
import { IPC_CHANNELS, type Category } from './types'

/**
 * Регистрирует все IPC handlers.
 * Renderer вызывает через window.api → ipcRenderer.invoke → ipcMain.handle.
 *
 * Важно: данные приходят из renderer (недоверенный контекст),
 * поэтому валидируем на стороне main.
 */
export function registerIpcHandlers(db: DatabaseManager, tracker: TrackingEngine): void {
  // ─── Tracking ────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.TRACKING_GET_CURRENT, () => {
    return tracker.getCurrentActivity()
  })

  ipcMain.handle(IPC_CHANNELS.TRACKING_PAUSE, () => {
    tracker.pause()
  })

  ipcMain.handle(IPC_CHANNELS.TRACKING_RESUME, () => {
    tracker.resume()
  })

  // ─── Activities ───────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.ACTIVITIES_GET_DAY, (_event, date: string) => {
    validateDate(date)
    return db.getEventsByDay(date)
  })

  ipcMain.handle(IPC_CHANNELS.ACTIVITIES_GET_RANGE, (_event, from: string, to: string) => {
    validateDate(from)
    validateDate(to)
    return db.getEventsByRange(from, to)
  })

  ipcMain.handle(IPC_CHANNELS.ACTIVITIES_GET_SUMMARY, (_event, date: string) => {
    validateDate(date)
    return db.getDaySummary(date)
  })

  // ─── Categories ───────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.CATEGORIES_GET_ALL, () => {
    return db.getAllCategories()
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES_UPSERT, (_event, category: Partial<Category>) => {
    return db.upsertCategory(category)
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORIES_DELETE, (_event, id: number) => {
    db.deleteCategory(id)
  })

  // ─── Settings ─────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, key: string) => {
    const value = db.getSetting(key)
    // Пытаемся распарсить JSON, если есть — возвращаем объект, иначе строку
    if (value === null) return null
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    (_event, key: string, value: unknown) => {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value)
      db.setSetting(key, serialized)
    }
  )

  // ─── Export ────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.EXPORT_CSV, async (_event, from: string, to: string) => {
    validateDate(from)
    validateDate(to)
    const events = db.getEventsByRange(from, to)

    // CSV заголовок
    const header =
      'ts_start,ts_end,duration_sec,app_name,window_title,url,is_afk,is_private\n'
    const rows = events.map((e) =>
      [
        e.tsStart,
        e.tsEnd,
        e.duration.toString(),
        csvEscape(e.appName),
        csvEscape(e.windowTitle),
        csvEscape(e.url ?? ''),
        e.isAfk ? '1' : '0',
        e.isPrivate ? '1' : '0'
      ].join(',')
    )

    const csv = header + rows.join('\n')

    // Сохраняем в Downloads
    const downloadsDir = join(homedir(), 'Downloads')
    const fileName = `timetracker_export_${from}_${to}.csv`
    const filePath = join(downloadsDir, fileName)
    writeFileSync(filePath, csv, 'utf-8')

    // Показываем диалог сохранения для подтверждения
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      dialog.showMessageBox(focusedWindow, {
        type: 'info',
        title: 'Export Complete',
        message: `Exported ${events.length} events`,
        detail: `Saved to: ${filePath}`
      })
    }

    return filePath
  })

  // ─── Stats (stubs — Phase 5) ────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.STATS_GET_DAILY, (_event, _days: number) => {
    // TODO: implement in Phase 5
    return []
  })

  ipcMain.handle(
    IPC_CHANNELS.STATS_GET_TOP_APPS,
    (_event, _from: string, _to: string, _limit?: number) => {
      // TODO: implement in Phase 5
      return []
    }
  )

  ipcMain.handle(IPC_CHANNELS.STATS_GET_HEATMAP, (_event, _from: string, _to: string) => {
    // TODO: implement in Phase 5
    return []
  })
}

// ─── Validation helpers ────────────────────────────────────────

function validateDate(dateStr: string): void {
  // Простой валидатор: YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD.`)
  }
}

function csvEscape(value: string): string {
  // Если содержит запятую, кавычку или перевод строки — оборачиваем в кавычки
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
