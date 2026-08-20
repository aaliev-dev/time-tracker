import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { DatabaseManager } from './database'
import { TrackingEngine } from './tracking-engine'
import { AFKDetector } from './afk-detector'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let db: DatabaseManager | null = null
let tracker: TrackingEngine | null = null
let afkDetector: AFKDetector | null = null
let isQuitting = false

function createWindow(): void {
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
      preload: join(__dirname, '../preload/index.js'),
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
  tray.setToolTip('Time Tracker')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Time Tracker',
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
      click: (): void => {
        tracker?.pause()
      }
    },
    {
      label: 'Resume Tracking',
      click: (): void => {
        tracker?.resume()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: (): void => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

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

// ─── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  // Initialize database
  db = new DatabaseManager()
  console.log('[Main] Database initialized')

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
  })

  // Apply autostart setting from DB
  const autostart = db.getSetting('autostart')
  if (autostart === 'true') {
    app.setLoginItemSettings({ openAtLogin: true })
  }

  createTray()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
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
  console.log('[Main] Cleaned up')
})
