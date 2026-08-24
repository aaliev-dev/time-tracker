import { powerMonitor } from 'electron'
import { EventEmitter } from 'events'
import { log } from './safe-log'

/**
 * AFKDetector — определяет когда пользователь "away from keyboard".
 *
 * Источники сигналов:
 * 1. powerMonitor.getSystemIdleTime() — системный idle (сек без input событий
 *    клавиатуры/мыши). Polling каждые 5 сек (дешевле, чем 1/сек).
 * 2. powerMonitor 'suspend' / 'resume' — Mac уснул / проснулся.
 * 3. powerMonitor 'lock-screen' / 'unlock-screen' — экран заблокирован.
 *
 * Порог по умолчанию: 60 секунд (1 минута) бездействия → AFK.
 * Порог можно переопределить через настройку 'idleThreshold' в БД.
 * При возврате: вычисляем точное время отсутствия для записи в БД.
 */
export class AFKDetector extends EventEmitter {
  private idleThresholdSec: number = 60 // 1 минута по умолчанию
  private pollIntervalMs: number = 5000 // check каждые 5 сек
  private intervalId: NodeJS.Timeout | null = null

  private isAfk: boolean = false
  private afkStartedAt: number | null = null // Date.now() когда начался AFK

  /** Callback: returns true if AFK should be suppressed (e.g., Google Meet call) */
  private exemptCallback?: () => boolean

  constructor(idleThresholdSec?: number) {
    super()
    if (idleThresholdSec) {
      this.idleThresholdSec = idleThresholdSec
    }

    this.setupPowerMonitor()
  }

  /** Set callback that returns true when AFK should be suppressed (e.g. during a meeting) */
  setExemptCallback(fn: () => boolean): void {
    this.exemptCallback = fn
  }

  /** Обновить порог idle (вызывается при изменении настройки в DB) */
  setIdleThreshold(seconds: number): void {
    this.idleThresholdSec = seconds
    log.info('[AFKDetector] Threshold updated:', seconds, 'sec')
  }

  getIdleThreshold(): number {
    return this.idleThresholdSec
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    if (this.intervalId) return
    log.info('[AFKDetector] Starting, threshold:', this.idleThresholdSec, 'sec')
    this.intervalId = setInterval(() => this.checkIdle(), this.pollIntervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    log.info('[AFKDetector] Stopped')
  }

  // ─── Power monitor events (sleep/wake/lock) ─────────────────

  private setupPowerMonitor(): void {
    powerMonitor.on('suspend', () => {
      log.info('[AFKDetector] System suspended')
      this.startAfk()
    })

    powerMonitor.on('resume', () => {
      log.info('[AFKDetector] System resumed')
      this.endAfk()
    })

    powerMonitor.on('lock-screen', () => {
      log.info('[AFKDetector] Screen locked')
      this.startAfk()
    })

    powerMonitor.on('unlock-screen', () => {
      log.info('[AFKDetector] Screen unlocked')
      this.endAfk()
    })
  }

  // ─── Idle polling ────────────────────────────────────────────

  private checkIdle(): void {
    // Exempt apps (e.g., Google Meet) — never go AFK during a call
    if (this.exemptCallback?.()) {
      if (this.isAfk) this.endAfk()
      return
    }

    const idleSec = powerMonitor.getSystemIdleTime()

    if (idleSec >= this.idleThresholdSec) {
      // Idle превысил порог → AFK
      if (!this.isAfk) {
        this.startAfk()
      }
    } else {
      // Пользователь активен
      if (this.isAfk) {
        this.endAfk()
      }
    }
  }

  // ─── AFK state management ────────────────────────────────────

  private startAfk(): void {
    if (this.isAfk) return
    this.isAfk = true
    this.afkStartedAt = Date.now()
    this.emit('afk-start')
  }

  private endAfk(): void {
    if (!this.isAfk || this.afkStartedAt === null) return
    const afkDuration = Math.round((Date.now() - this.afkStartedAt) / 1000)
    this.isAfk = false
    this.afkStartedAt = null
    this.emit('afk-end', afkDuration)
  }

  getIsAfk(): boolean {
    return this.isAfk
  }
}
