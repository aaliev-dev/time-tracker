import activeWin from 'active-win'
import { EventEmitter } from 'events'
import { app, systemPreferences } from 'electron'
import type { DatabaseManager } from './database'
import type { CurrentActivity } from './types'
import { log } from './safe-log'

/** Имена процесса трекера (dev='Electron', prod='CarpeDiem') — чтобы не трекать себя */
const SELF_APP_NAMES = new Set(['Electron', app.getName()])

/** Проверяет, что URL — это активный Google Meet звонок (не главная страница) */
function isMeetCallUrl(url: string | null): boolean {
  if (!url) return false
  const idx = url.indexOf('meet.google.com/')
  if (idx === -1) return false
  // Есть что-то после последнего / (код встречи)
  const after = url.substring(idx + 'meet.google.com/'.length)
  return after.length > 0
}

/** Ключевые слова private/incognito в заголовке окна → приватный режим */
const PRIVATE_KEYWORDS = ['incognito', 'private browsing', 'private window', 'little arc']

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
  private isPrivateBrowsing: boolean = false
  private isAfk: boolean = false
  private excludedApps: Set<string> = new Set()
  private hasAccessibilityPermission: boolean = false

  // ─── Google Meet background tracking ────────────────────
  // Когда созвон активен (meet.google.com в foreground),
  // пользователь часто переключается на другие приложения,
  // но звонок продолжает идти. Мы отслеживаем параллельный
  // фоновый event для Meet, чтобы время звонка не терялось.
  private meetingActive: boolean = false  // идёт ли сейчас созвон
  private meetingEventId: number | null = null  // ID фонового event
  private meetingEventStart: number = 0  // Date.now() начала фонового event
  private meetingLastSeen: number = 0  // Date.now() последнего наблюдения Meet
  private readonly MEETING_TIMEOUT_MS = 10 * 60 * 1000 // 10 мин без Meet → созвон окончен

  constructor(db: DatabaseManager) {
    super()
    this.db = db
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  /**
   * Проверяет Accessibility permission (check-only, без системного диалога).
   * active-win на macOS использует Accessibility API — без разрешения
   * каждый вызов бинарника может триггерить системный промпт.
   */
  private checkAccessibilityPermission(): boolean {
    if (process.platform !== 'darwin') return true
    const trusted = systemPreferences.isTrustedAccessibilityClient(false)
    if (trusted !== this.hasAccessibilityPermission) {
      this.hasAccessibilityPermission = trusted
      if (trusted) {
        log.info('[TrackingEngine] Accessibility permission granted')
      } else {
        log.warn('[TrackingEngine] Accessibility permission lost — pausing active-win calls')
      }
    }
    return trusted
  }

  start(): void {
    if (this.intervalId) return
    this.loadExcludedApps()

    // Check Accessibility permission BEFORE starting poll loop.
    // Without this, every activeWin() call (1/sec) spawns a native binary
    // that triggers the macOS Accessibility permission dialog — spamming the user.
    if (!this.checkAccessibilityPermission()) {
      log.warn('[TrackingEngine] No Accessibility permission — not starting poll loop')
      return
    }

    log.info('[TrackingEngine] Starting polling every', this.pollIntervalMs, 'ms')
    this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.closeMeetingEvent()
    this.closeCurrentEvent()
    log.info('[TrackingEngine] Stopped')
  }

  pause(): void {
    this.isPaused = true
    this.closeCurrentEvent()
    this.emitActivityChanged()
    log.info('[TrackingEngine] Paused')
  }

  resume(): void {
    this.isPaused = false
    this.emitActivityChanged()
    log.info('[TrackingEngine] Resumed')
  }

  /** Reload excluded apps from settings (called when user updates list) */
  loadExcludedApps(): void {
    const raw = this.db.getSetting('excludedApps')
    try {
      const apps = raw ? JSON.parse(raw) as string[] : []
      this.excludedApps = new Set(apps)
      log.info('[TrackingEngine] Excluded apps:', [...this.excludedApps])
    } catch {
      this.excludedApps = new Set()
    }
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
    log.info('[TrackingEngine] AFK started')
  }

  /**
   * Вызывается AFKDetector при возврате из idle/sleep.
   * Пишет AFK событие с duration = время отсутствия,
   * привязанное к категории "AFK".
   */
  onAfkEnd(afkDuration: number): void {
    if (!this.isAfk) return
    this.isAfk = false

    // Находим categoryId для AFK (категория создаётся миграцией 003)
    const afkCategory = this.db.getCategoryByName('AFK')
    const afkCategoryId = afkCategory?.id ?? null

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
      categoryId: afkCategoryId,
      isAfk: true,
      isPrivate: false
    })

    this.emitActivityChanged()
    log.info(`[TrackingEngine] AFK ended (was away ${afkDuration}s)`)
  }

  /** Идёт ли сейчас Google Meet звонок (foreground или background)? (для AFK suppression) */
  isMeetingActive(): boolean {
    return this.meetingActive
  }

  // ─── Google Meet background tracking ────────────────────────

  private startMeetingEvent(now: number): void {
    const tsNow = new Date(now).toISOString()
    this.meetingEventStart = now
    this.meetingEventId = this.db.insertEvent({
      tsStart: tsNow,
      tsEnd: tsNow, // обновится при закрытии
      duration: 0,
      appName: 'Google Meet',
      appBundleId: undefined,
      windowTitle: 'Meeting (background)',
      url: 'https://meet.google.com',
      categoryId: null,
      isAfk: false,
      isPrivate: false
    })
    log.info('[TrackingEngine] Background meeting event started')
  }

  private closeMeetingEvent(endTime?: number): void {
    if (this.meetingEventId === null) return
    const end = endTime ?? Date.now()
    const tsEnd = new Date(end).toISOString()
    const duration = Math.round((end - this.meetingEventStart) / 1000)
    this.db.closeEvent(this.meetingEventId, tsEnd, duration)
    this.meetingEventId = null
    this.meetingEventStart = 0
    log.info(`[TrackingEngine] Background meeting event closed (duration: ${duration}s)`)
  }

  /**
   * Обработка фонового трекинга Google Meet.
   * Вызывается в poll() после получения activeWin.
   */
  private updateMeetingTracking(url: string | null, now: number): void {
    const isMeet = isMeetCallUrl(url)

    if (isMeet) {
      // Meet в foreground — закрываем фоновый event (если был),
      // foreground event запишется обычным путём.
      if (this.meetingEventId !== null) {
        this.closeMeetingEvent(now)
      }
      this.meetingActive = true
      this.meetingLastSeen = now
    } else if (this.meetingActive) {
      // Meet не в foreground, но созвон может идти
      if (now - this.meetingLastSeen > this.MEETING_TIMEOUT_MS) {
        // Созвон окончен (не видели Meet > 10 мин)
        this.meetingActive = false
        this.closeMeetingEvent(this.meetingLastSeen)
        log.info('[TrackingEngine] Meeting ended (timeout)')
      } else {
        // Созвон продолжается в фоне — запускаем фоновый event если нужно
        if (this.meetingEventId === null) {
          this.startMeetingEvent(now)
        }
      }
    }
  }

  // ─── Core polling ────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (this.isPaused || this.isAfk) return

    // Guard: skip activeWin() if Accessibility permission was revoked.
    // Without this, each call spawns a native binary that re-triggers
    // the macOS permission dialog.
    if (!this.checkAccessibilityPermission()) return

    let win: Awaited<ReturnType<typeof activeWin>>
    try {
      win = await activeWin()
    } catch (err) {
      log.error('[TrackingEngine] activeWin error:', err)
      return
    }

    // Re-check after async — AFK/pause may have started during await activeWin().
    // Without this, poll() creates real events that overlap with AFK events
    // (race condition: isAfk checked at top, but activeWin is async).
    if (this.isPaused || this.isAfk) return

    if (!win) {
      // Нет активного окна — возможно screen locked или нет дисплея
      return
    }

    const appName = win.owner.name
    const windowTitle = win.title
    const appBundleId = 'bundleId' in win.owner ? (win.owner as { bundleId?: string }).bundleId : undefined
    const url = 'url' in win ? (win as { url?: string }).url ?? null : null

    // Google Meet background tracking — update meeting state before normal tracking
    this.updateMeetingTracking(url, Date.now())

    // Skip self-tracking — don't record events for the tracker's own window
    if (SELF_APP_NAMES.has(appName)) {
      if (!this.isSelfFocused) {
        // Close current real event to record accurate duration
        this.closeCurrentEvent()
        this.isSelfFocused = true
        this.emitActivityChanged()
        log.info('[TrackingEngine] Self-focused — keeping last activity as current')
      }
      return
    }

    // Check exclusion list — app user doesn't want tracked
    if (this.excludedApps.has(appName)) {
      if (this.currentEventId !== null) {
        this.closeCurrentEvent()
        this.emitActivityChanged()
      }
      return
    }

    // Coming back from self-focus → force new event even if same app
    const wasSelfFocused = this.isSelfFocused
    this.isSelfFocused = false

    // Private/incognito tab detection — skip tracking (privacy)
    const isPrivate = isPrivateTab(appName, windowTitle)
    if (isPrivate) {
      if (!this.isPrivateBrowsing) {
        this.closeCurrentEvent()
        this.isPrivateBrowsing = true
        this.emitActivityChanged()
        log.info('[TrackingEngine] Private browsing — not tracking')
      }
      return
    }

    // Coming back from private → force new event
    const wasPrivateBrowsing = this.isPrivateBrowsing
    this.isPrivateBrowsing = false

    const changed =
      appName !== this.currentAppName ||
      windowTitle !== this.currentWindowTitle ||
      wasSelfFocused ||
      wasPrivateBrowsing

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
    if (this.isPrivateBrowsing) {
      return {
        appName: 'Private browsing',
        windowTitle: 'Incognito / Private tab',
        url: null,
        tsStart: this.currentTsStart ?? new Date().toISOString(),
        isAfk: this.isAfk,
        isPaused: this.isPaused
      }
    }
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

/**
 * Detects private/incognito browsing by window title keywords.
 * Different browsers use different indicators:
 * - Chrome: "Incognito" in title
 * - Safari: "Private Browsing" in title
 * - Firefox: "Private Browsing" in title
 * - Arc: "Little Arc" (ephemeral/private windows)
 */
function isPrivateTab(_appName: string, windowTitle: string): boolean {
  const titleLower = windowTitle.toLowerCase()
  return PRIVATE_KEYWORDS.some((kw) => titleLower.includes(kw))
}
