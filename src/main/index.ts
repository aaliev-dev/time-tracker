import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from './types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

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
  // Simple 16x16 template icon for menu bar
  const icon = nativeImage.createEmpty()
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
        // TODO: implement pause
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

// IPC handlers — stubs for now, will be implemented in Phase 1
function registerIpcHandlers(): void {
  const { ipcMain } = require('electron')
  ipcMain.handle(IPC_CHANNELS.TRACKING_GET_CURRENT, () => {
    return null // TODO: return current activity
  })
  ipcMain.handle(IPC_CHANNELS.ACTIVITIES_GET_DAY, () => {
    return [] // TODO: return day's activities
  })
  ipcMain.handle(IPC_CHANNELS.ACTIVITIES_GET_SUMMARY, () => {
    return [] // TODO: return summary
  })
}

app.whenReady().then(() => {
  createTray()
  createWindow()
  registerIpcHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, keep app running in tray when window is closed
  // User can click tray icon to reopen
})
