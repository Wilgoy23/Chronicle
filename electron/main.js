const { app, BrowserWindow, ipcMain, Menu, Notification } = require('electron')
const path   = require('path')
const fs     = require('fs')
const { initDb, getReleases, setReleaseStatus, unseenReleaseCount } = require('./db')
const { registerHandlers } = require('./ipc')
const { runReleaseScan }   = require('./releaseChecker')

let mainWindow = null

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
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = win

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Scan for new releases shortly after the UI is ready (throttled to once/day).
  win.webContents.once('did-finish-load', () => {
    performScan({ force: false }).catch(err => console.error('[releases] scan failed:', err))
  })
}

// Runs a release scan, fires OS notifications for genuinely-new items,
// and tells the renderer to refresh its inbox/badge.
async function performScan(opts) {
  let fresh = []
  try {
    fresh = await runReleaseScan(readSettings, writeSettings, opts)
  } catch (err) {
    console.error('[releases] scan error:', err)
    return []
  }

  if (fresh.length && Notification.isSupported()) {
    if (fresh.length === 1) {
      const r = fresh[0]
      new Notification({ title: 'New release', body: `${r.title} — ${r.relation ?? 'new in a series you follow'}` }).show()
    } else {
      new Notification({
        title: `${fresh.length} new releases`,
        body: fresh.slice(0, 3).map(r => r.title).join(', ') + (fresh.length > 3 ? '…' : ''),
      }).show()
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('releases:updated')
  }
  return fresh
}

app.whenReady().then(() => {
  initDb(path.join(app.getPath('userData'), 'data.db'))

  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = { ...readSettings(), ...patch }
    writeSettings(next)
    return next
  })

  ipcMain.handle('releases:get',       () => ({ items: getReleases(), unseen: unseenReleaseCount() }))
  ipcMain.handle('releases:setStatus', (_e, id, status) => setReleaseStatus(id, status))
  ipcMain.handle('releases:checkNow',  () => performScan({ force: true }))

  registerHandlers(readSettings)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
