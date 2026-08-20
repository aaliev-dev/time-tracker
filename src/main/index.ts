import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { DatabaseManager } from './database'
import { TrackingEngine } from './tracking-engine'
import { AFKDetector } from './afk-detector'
import { registerIpcHandlers } from './ipc-handlers'
import { formatLocalDate } from './database'
import { installGlobalErrorHandlers, log } from './safe-log'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let db: DatabaseManager | null = null
let tracker: TrackingEngine | null = null
let afkDetector: AFKDetector | null = null
let isQuitting = false

// Set app name before ready — affects macOS menu bar, active-win results, tray
app.setName('CarpeDiem')

// Предотвращаем EIO crash, когда терминал закрылся
installGlobalErrorHandlers()

function createWindow(): void {
  // Guard: не создаём второе окно, если первое живо
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1b26',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Prevent window from closing — hide to tray instead
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // Очистка ссылки при реальном уничтожении окна
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for dev
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  // Load template icon (clock face) for menu bar
  const iconPath = join(__dirname, '../../resources/icons/trayTemplate.png')
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('CarpeDiem')

  updateTrayMenu()
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      if (mainWindow?.isMinimized()) {
        mainWindow?.restore()
      }
    }
  })
}

/** Возвращает "5h 32m" из секунд */
function formatTrayDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}

/** Перестраивает tray-меню с quick summary сегодняшнего дня */
function updateTrayMenu(): void {
  if (!tray || !db || !tracker) return

  const today = formatLocalDate(new Date())
  const summary = db.getDaySummary(today)
  const totalActive = summary.reduce((s, a) => s + a.totalTime, 0)
  const current = tracker.getCurrentActivity()

  // Top 3 apps for quick summary
  const top3 = summary.slice(0, 3)

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: `CarpeDiem — ${formatTrayDuration(totalActive)} today`, enabled: false },
    { type: 'separator' },
    {
      label: current.isPaused
        ? '⏸ Tracking paused'
        : current.isAfk
          ? '💤 Away from keyboard'
          : `▶ ${current.appName}`,
      enabled: false
    },
    current.windowTitle
      ? { label: `   ${current.windowTitle}`, enabled: false }
      : { type: 'separator' },
    { type: 'separator' }
  ]

  if (top3.length > 0) {
    for (const app of top3) {
      template.push({
        label: `${app.appName} — ${formatTrayDuration(app.totalTime)}`,
        enabled: false
      })
    }
    template.push({ type: 'separator' })
  }

  template.push(
    {
      label: 'Open CarpeDiem',
      click: (): void => {
        mainWindow?.show()
        if (mainWindow?.isMinimized()) {
          mainWindow?.restore()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Pause Tracking',
      enabled: !current.isPaused,
      click: (): void => {
        tracker?.pause()
        updateTrayMenu()
      }
    },
    {
      label: 'Resume Tracking',
      enabled: current.isPaused,
      click: (): void => {
        tracker?.resume()
        updateTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: (): void => {
        app.quit()
      }
    }
  )

  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.setToolTip(`CarpeDiem — ${formatTrayDuration(totalActive)} today`)
}

// ─── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  // Initialize database
  db = new DatabaseManager()
  log.info('[Main] Database initialized')

  // Initialize tracking engine
  tracker = new TrackingEngine(db)
  tracker.start()

  // Initialize AFK detector
  afkDetector = new AFKDetector()
  afkDetector.on('afk-start', () => {
    tracker?.onAfkStart()
  })
  afkDetector.on('afk-end', (duration: number) => {
    tracker?.onAfkEnd(duration)
  })
  afkDetector.start()

  // IPC — real handlers
  registerIpcHandlers(db, tracker)

  // Push activity changes to renderer
  tracker.on('activity-changed', () => {
    mainWindow?.webContents.send('tracking:activityChanged', tracker!.getCurrentActivity())
    updateTrayMenu()
  })

  // Apply autostart setting from DB
  const autostart = db.getSetting('autostart')
  if (autostart === 'true') {
    app.setLoginItemSettings({ openAtLogin: true })
  }

  createTray()
  createWindow()

  // Refresh tray menu every 30s (duration grows even without activity change)
  setInterval(() => updateTrayMenu(), 30_000)

  app.on('activate', () => {
    // macOS: clicking dock icon — показываем существующее окно или создаём
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, keep app running in tray when window is closed
  // User can click tray icon to reopen
  // Do NOT call app.quit() — tracking continues in background
})

app.on('before-quit', () => {
  isQuitting = true
  // Закрываем текущее событие перед выходом
  tracker?.stop()
  afkDetector?.stop()
  db?.close()
  log.info('[Main] Cleaned up')
})
