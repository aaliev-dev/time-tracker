import activeWin from 'active-win'
import { EventEmitter } from 'events'
import { app } from 'electron'
import type { DatabaseManager } from './database'
import type { CurrentActivity } from './types'

/** Имена процесса трекера (dev='Electron', prod='CarpeDiem') — чтобы не трекать себя */
const SELF_APP_NAMES = new Set(['Electron', app.getName()])

/**
 * TrackingEngine — опрашивает active-win каждые 1 сек и записывает события в БД.
 *
 * Алгоритм:
 * 1. Каждую секунду получает active window (appName, title, bundleId)
 * 2. Если app/title изменился → закрывает текущее событие (duration = now - start),
 *    создаёт новое
 * 3. Если AFK (определяется AFKDetector) → закрывает текущее, пишет AFK событие
 * 4. Pause/resume — пользователь может приостановить трекинг
 *
 * Производительность:
 * - 1 poll/sec → минимальная нагрузка
 * - Запись в БД только при смене активности, не при каждом тике
 * - EventEmitter уведомляет renderer о смене активности (через IPC)
 */
export class TrackingEngine extends EventEmitter {
  private db: DatabaseManager
  private intervalId: NodeJS.Timeout | null = null
  private pollIntervalMs: number = 1000

  private currentEventId: number | null = null
  private currentTsStart: string | null = null
  private currentAppName: string = ''
  private currentWindowTitle: string = ''
  private currentUrl: string | null = null
  private isPaused: boolean = false
  private isSelfFocused: boolean = false
  private isAfk: boolean = false

  constructor(db: DatabaseManager) {
    super()
    this.db = db
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    if (this.intervalId) return
    console.log('[TrackingEngine] Starting polling every', this.pollIntervalMs, 'ms')
    this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.closeCurrentEvent()
    console.log('[TrackingEngine] Stopped')
  }

  pause(): void {
    this.isPaused = true
    this.closeCurrentEvent()
    this.emitActivityChanged()
    console.log('[TrackingEngine] Paused')
  }

  resume(): void {
    this.isPaused = false
    this.emitActivityChanged()
    console.log('[TrackingEngine] Resumed')
  }

  // ─── AFK handling ────────────────────────────────────────────

  /**
   * Вызывается AFKDetector при переходе в idle/sleep.
   * Закрывает текущее событие и пишет AFK событие.
   */
  onAfkStart(): void {
    if (this.isAfk) return
    this.isAfk = true
    this.closeCurrentEvent()
    this.emitActivityChanged()
    console.log('[TrackingEngine] AFK started')
  }

  /**
   * Вызывается AFKDetector при возврате из idle/sleep.
   * Пишет AFK событие с duration = время отсутствия.
   */
  onAfkEnd(afkDuration: number): void {
    if (!this.isAfk) return
    this.isAfk = false

    // Записываем AFK событие
    const now = new Date()
    const tsEnd = now.toISOString()
    const tsStart = new Date(now.getTime() - afkDuration * 1000).toISOString()

    this.db.insertEvent({
      tsStart,
      tsEnd,
      duration: afkDuration,
      appName: 'AFK',
      appBundleId: undefined,
      windowTitle: 'Away from keyboard',
      url: null,
      categoryId: null,
      isAfk: true,
      isPrivate: false
    })

    this.emitActivityChanged()
    console.log(`[TrackingEngine] AFK ended (was away ${afkDuration}s)`)
  }

  // ─── Core polling ────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (this.isPaused || this.isAfk) return

    let win: Awaited<ReturnType<typeof activeWin>>
    try {
      win = await activeWin()
    } catch (err) {
      console.error('[TrackingEngine] activeWin error:', err)
      return
    }

    if (!win) {
      // Нет активного окна — возможно screen locked или нет дисплея
      return
    }

    const appName = win.owner.name
    const windowTitle = win.title
    const appBundleId = 'bundleId' in win.owner ? (win.owner as { bundleId?: string }).bundleId : undefined
    const url = 'url' in win ? (win as { url?: string }).url ?? null : null

    // Skip self-tracking — don't record events for the tracker's own window
    if (SELF_APP_NAMES.has(appName)) {
      if (!this.isSelfFocused) {
        // Close current real event to record accurate duration
        this.closeCurrentEvent()
        this.isSelfFocused = true
        this.emitActivityChanged()
        console.log('[TrackingEngine] Self-focused — keeping last activity as current')
      }
      return
    }

    // Coming back from self-focus → force new event even if same app
    const wasSelfFocused = this.isSelfFocused
    this.isSelfFocused = false

    const changed =
      appName !== this.currentAppName ||
      windowTitle !== this.currentWindowTitle ||
      wasSelfFocused

    if (changed) {
      this.closeCurrentEvent()
      this.startNewEvent(appName, windowTitle, appBundleId, url)
      this.emitActivityChanged()
    }
  }

  private startNewEvent(
    appName: string,
    windowTitle: string,
    appBundleId: string | undefined,
    url: string | null
  ): void {
    const now = new Date().toISOString()
    this.currentTsStart = now
    this.currentAppName = appName
    this.currentWindowTitle = windowTitle
    this.currentUrl = url

    this.currentEventId = this.db.insertEvent({
      tsStart: now,
      tsEnd: now, // ts_end обновится при close
      duration: 0,
      appName,
      appBundleId,
      windowTitle,
      url,
      categoryId: null,
      isAfk: false,
      isPrivate: false
    })
  }

  private closeCurrentEvent(): void {
    if (this.currentEventId === null || this.currentTsStart === null) return

    const now = new Date()
    const tsEnd = now.toISOString()
    const duration = Math.round((now.getTime() - new Date(this.currentTsStart).getTime()) / 1000)

    this.db.closeEvent(this.currentEventId, tsEnd, duration)

    this.currentEventId = null
    this.currentTsStart = null
    this.currentAppName = ''
    this.currentWindowTitle = ''
  }

  // ─── Queries ────────────────────────────────────────────────

  getCurrentActivity(): CurrentActivity {
    // When self-focused, still show the last real activity
    return {
      appName: this.currentAppName || 'Idle',
      windowTitle: this.currentWindowTitle,
      url: this.currentUrl,
      tsStart: this.currentTsStart ?? new Date().toISOString(),
      isAfk: this.isAfk,
      isPaused: this.isPaused
    }
  }

  // ─── Events → IPC ────────────────────────────────────────────

  private emitActivityChanged(): void {
    this.emit('activity-changed', this.getCurrentActivity())
  }
}
