const { app, BrowserWindow, ipcMain, Menu, Notification, dialog } = require('electron')
const path   = require('path')
const fs     = require('fs')
const zlib   = require('zlib')
const {
  initDb, getReleases, setReleaseStatus, unseenReleaseCount,
  exportData, importData, getDbPath, closeDb, validateBackupFile, backupTo,
} = require('./db')
const { registerHandlers } = require('./ipc')
const { registerAiHandlers, markLibraryDirty, shutdownAi } = require('./ai/aiService')
const { runReleaseScan }   = require('./releaseChecker')
const { toCsv }            = require('./csv')
const { mapGoodreads }     = require('./importers/goodreads')
const { mapMal }           = require('./importers/mal')
const { mapLetterboxd }    = require('./importers/letterboxd')

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

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
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
    // Build/refresh the local AI embedding index in the background.
    markLibraryDirty()
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

  ipcMain.handle('data:exportJson', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export library as JSON',
      defaultPath: `chronicle-${dateStamp()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      const data = exportData()
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
      return { ok: true, path: filePath, count: data.entries.length }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('data:exportCsv', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export entries as CSV',
      defaultPath: `chronicle-${dateStamp()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      const { entries } = exportData()
      fs.writeFileSync(filePath, toCsv(entries), 'utf8')
      return { ok: true, path: filePath, count: entries.length }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('data:importJson', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Chronicle JSON',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    try {
      const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'))
      const result = importData(data)
      if (result.ok && result.imported) markLibraryDirty()
      return result
    } catch (err) {
      return { ok: false, error: err instanceof SyntaxError ? 'That file is not valid JSON.' : String(err) }
    }
  })

  ipcMain.handle('data:importGoodreads', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Goodreads CSV export',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    try {
      const data = mapGoodreads(fs.readFileSync(filePaths[0], 'utf8'))
      const result = importData(data)
      if (result.ok && result.imported) markLibraryDirty()
      return result
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('data:importMal', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import MyAnimeList export',
      // MAL's own export downloads gzipped (animelist_<user>.xml.gz); many
      // browsers auto-extract it to plain .xml on save, so both are accepted.
      filters: [{ name: 'MyAnimeList export', extensions: ['xml', 'gz'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    try {
      const raw = fs.readFileSync(filePaths[0])
      const isGzip = raw[0] === 0x1f && raw[1] === 0x8b
      const xml = (isGzip ? zlib.gunzipSync(raw) : raw).toString('utf8')
      const result = importData(mapMal(xml))
      if (result.ok && result.imported) markLibraryDirty()
      return result
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('data:importLetterboxd', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Letterboxd diary.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    try {
      const data = mapLetterboxd(fs.readFileSync(filePaths[0], 'utf8'))
      const result = importData(data)
      if (result.ok && result.imported) markLibraryDirty()
      return result
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('data:backup', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Back up database',
      defaultPath: `chronicle-backup-${dateStamp()}.db`,
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      await backupTo(filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('data:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore from backup',
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    const chosen = filePaths[0]

    if (!validateBackupFile(chosen)) {
      return { ok: false, error: 'That file is not a valid Chronicle database.' }
    }

    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Replace library'],
      defaultId: 0,
      cancelId: 0,
      title: 'Restore from backup',
      message: 'Replace your current library with this backup?',
      detail: 'Your current entries will be overwritten. This cannot be undone.',
    })
    if (confirm.response !== 1) return { ok: false, canceled: true }

    const dbPath = getDbPath()
    const safety = `${dbPath}.pre-restore`
    try {
      closeDb()
      fs.copyFileSync(dbPath, safety)   // safety copy of the current library
      fs.copyFileSync(chosen, dbPath)   // overwrite with the chosen backup
      initDb(dbPath)                    // reopen + run migrations on the restored file
      try { fs.unlinkSync(safety) } catch {}
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload()
      markLibraryDirty()                // restored library needs a fresh AI index diff
      return { ok: true }
    } catch (err) {
      // Roll back to the safety copy if anything failed mid-restore.
      try { fs.copyFileSync(safety, dbPath); fs.unlinkSync(safety) } catch {}
      try { initDb(dbPath) } catch {}
      return { ok: false, error: String(err) }
    }
  })

  registerHandlers(readSettings)
  registerAiHandlers({
    readSettings,
    modelCacheDir: path.join(app.getPath('userData'), 'ai-models'),
    send: (channel, payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
    },
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// The embedding model runs in a utilityProcess; stop it explicitly so a slow
// reindex can't keep a child alive after the window it serves has gone.
app.on('before-quit', () => shutdownAi())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
