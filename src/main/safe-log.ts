/**
 * Safe logger — не падает с EIO, когда stdout pipe закрыт.
 *
 * Проблема: при `electron-vite dev` процесс наследует stdout от терминала.
 * Если терминал закрылся (или VS Code убил pipe), любой console.log
 * бросает EIO → uncaught exception → crash или duplicate window.
 *
 * Решение: оборачиваем console методы в try/catch.
 */

type ConsoleMethod = 'log' | 'warn' | 'error' | 'info'

function safeConsole(method: ConsoleMethod, prefix: string, ...args: unknown[]): void {
  try {
    console[method](prefix, ...args)
  } catch {
    // EIO, ERR_STREAM_DESTROYED, etc. — игнорируем
  }
}

export const log = {
  info: (...args: unknown[]): void => safeConsole('log', '', ...args),
  warn: (...args: unknown[]): void => safeConsole('warn', '', ...args),
  error: (...args: unknown[]): void => safeConsole('error', '', ...args),
  debug: (...args: unknown[]): void => safeConsole('log', '', ...args)
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
  })
}
