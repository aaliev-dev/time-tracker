/**
 * Safe logger — не падает с EIO, когда stdout pipe закрыт.
 *
 * Проблема: при `electron-vite dev` процесс наследует stdout от терминала.
 * Если терминал закрылся (или VS Code убил pipe), любой console.log
 * бросает EIO → uncaught exception → crash или duplicate window.
 *
 * Решение: оборачиваем console методы в try/catch + дублируем в файл.
 *
 * File logging:
 * В packaged-режиме stdout идёт в никуда (нет терминала).
 * Логи пишутся в `~/Library/Logs/{AppName}/main.log` — доступны
 * после краша для диагностики (откуда взялись gaps в трекинге и т.д.).
 */

import { app } from 'electron'
import { createWriteStream, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { WriteStream } from 'fs'

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
type ConsoleMethod = 'log' | 'warn' | 'error' | 'info'

let fileStream: WriteStream | null = null
let initAttempted = false

/**
 * Lazily creates a write stream to ~/Library/Logs/{AppName}/main.log.
 * Returns null if app isn't ready yet or if the file system is inaccessible.
 * Retries until app.isReady() — initAttempted resets on failure.
 */
function getFileStream(): WriteStream | null {
  if (fileStream) return fileStream
  if (initAttempted) return null
  initAttempted = true

  try {
    if (!app.isReady()) {
      initAttempted = false // allow retry on next log call
      return null
    }
    const logsDir = app.getPath('logs') // ~/Library/Logs/{AppName}/ on macOS
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true })
    }
    const logFile = join(logsDir, 'main.log')
    fileStream = createWriteStream(logFile, { flags: 'a' })
    fileStream.on('error', () => {
      fileStream = null
      initAttempted = false // allow retry
    })
    fileStream.write(`\n--- App started ${new Date().toISOString()} ---\n`)
    return fileStream
  } catch {
    return null
  }
}

/** Stringify args for file logging (console gets raw objects for devtools inspection). */
function formatArgs(args: unknown[]): string {
  return args.map((a) => {
    if (typeof a === 'string') return a
    if (a instanceof Error) return a.stack || a.message
    try {
      return JSON.stringify(a)
    } catch {
      return String(a)
    }
  }).join(' ')
}

function writeLog(level: LogLevel, method: ConsoleMethod, ...args: unknown[]): void {
  // Console — same format as before (dev mode shows raw objects in devtools)
  try {
    console[method](...args)
  } catch {
    // EIO, ERR_STREAM_DESTROYED, etc. — игнорируем
  }

  // File — structured with timestamp (critical for packaged mode diagnostics)
  try {
    const stream = getFileStream()
    if (stream) {
      const ts = new Date().toISOString()
      const msg = formatArgs(args)
      stream.write(`[${ts}] [${level}] ${msg}\n`)
    }
  } catch {
    // File write error — nothing we can do
  }
}

export const log = {
  info: (...args: unknown[]): void => writeLog('INFO', 'log', ...args),
  warn: (...args: unknown[]): void => writeLog('WARN', 'warn', ...args),
  error: (...args: unknown[]): void => writeLog('ERROR', 'error', ...args),
  debug: (...args: unknown[]): void => writeLog('DEBUG', 'log', ...args)
}

/**
 * Устанавливает глобальные обработчики для предотвращения EIO crash.
 * Вызывать один раз в начале app lifecycle.
 */
export function installGlobalErrorHandlers(): void {
  // EIO на console.log — ловим здесь, не падаем
  process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
    // EIO = broken pipe (терминал закрылся) — безопасно игнорируем
    if (err.code === 'EIO' || err.code === 'ERR_STREAM_DESTROYED') {
      return
    }
    // Всё остальное — логируем (через safe logger), но не крашим
    try {
      console.error('[Main] Uncaught exception:', err)
    } catch {
      // stdout уже мёртв — ничего не поделаешь
    }
    // Also write to file (if available) for crash diagnostics
    try {
      const stream = getFileStream()
      if (stream) {
        stream.write(`[${new Date().toISOString()}] [FATAL] Uncaught exception: ${err.stack || err.message}\n`)
      }
    } catch {
      // nothing
    }
  })
}
