const { app, BrowserWindow, ipcMain, Menu } = require('electron')
const path   = require('path')
const fs     = require('fs')
const { initDb }           = require('./db')
const { registerHandlers } = require('./ipc')

Menu.setApplicationMenu(null)

// Allow E2E tests to redirect userData to a temp directory
if (process.env.CHRONICLE_USER_DATA) {
  app.setPath('userData', process.env.CHRONICLE_USER_DATA)
}

const isDev = !app.isPackaged && process.env.CHRONICLE_TEST !== '1'

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) } catch { return {} }
}

function writeSettings(data) {
  fs.writeFileSync(settingsPath(), JSON.stringify(data, null, 2), 'utf8')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  initDb(path.join(app.getPath('userData'), 'data.db'))

  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = { ...readSettings(), ...patch }
    writeSettings(next)
    return next
  })

  registerHandlers(readSettings)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
