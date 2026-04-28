const { app, BrowserWindow, ipcMain, Menu } = require('electron')
Menu.setApplicationMenu(null)
const path = require('path')
const fs   = require('fs')
const Database = require('better-sqlite3')

const isDev = !app.isPackaged

// --- Database setup ---
const dbPath = path.join(app.getPath('userData'), 'data.db')
let db

function initDb() {
  db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      category   TEXT NOT NULL,
      title      TEXT NOT NULL,
      status     TEXT NOT NULL,
      rating     INTEGER,
      notes      TEXT,
      cover_url  TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  // Migrations for columns added after initial release
  try { db.exec('ALTER TABLE entries ADD COLUMN cover_url TEXT')  } catch { /* already exists */ }
  try { db.exec('ALTER TABLE entries ADD COLUMN series TEXT')     } catch { /* already exists */ }
  try { db.exec('ALTER TABLE entries ADD COLUMN date_read TEXT')  } catch { /* already exists */ }
}

// --- Settings (persisted JSON) ---
const settingsPath = path.join(app.getPath('userData'), 'settings.json')

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch { return {} }
}

function writeSettings(data) {
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8')
}

ipcMain.handle('settings:get', () => readSettings())
ipcMain.handle('settings:set', (_event, patch) => {
  const current = readSettings()
  const next = { ...current, ...patch }
  writeSettings(next)
  return next
})

// --- DB IPC handlers ---
ipcMain.handle('db:getEntries', (_event, category) => {
  if (category) {
    return db.prepare('SELECT * FROM entries WHERE category = ? ORDER BY id DESC').all(category)
  }
  return db.prepare('SELECT * FROM entries ORDER BY id DESC').all()
})

ipcMain.handle('db:addEntry', (_event, { category, title, status, rating, notes, cover_url, series, date_read }) => {
  const result = db.prepare(
    'INSERT INTO entries (category, title, status, rating, notes, cover_url, series, date_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(category, title, status ?? 'completed', rating ?? null, notes ?? '', cover_url ?? null, series ?? null, date_read ?? null)
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid)
})

ipcMain.handle('db:getSeries', (_event, category) => {
  return db.prepare(
    `SELECT DISTINCT series FROM entries
     WHERE category = ? AND series IS NOT NULL AND series != ''
     ORDER BY series`
  ).all(category).map(r => r.series)
})

ipcMain.handle('db:updateEntry', (_event, { id, title, status, rating, notes, series, date_read }) => {
  db.prepare(
    'UPDATE entries SET title = ?, status = ?, rating = ?, notes = ?, series = ?, date_read = ? WHERE id = ?'
  ).run(title, status, rating ?? null, notes ?? '', series ?? null, date_read ?? null, id)
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(id)
})

ipcMain.handle('db:deleteEntry', (_event, id) => {
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
  return { success: true }
})

// --- Hardcover book search (must run in main — their API must not be called from a browser) ---
ipcMain.handle('api:searchBooks', async (_event, query) => {
  const { hardcoverToken: rawToken } = readSettings()
  if (!rawToken) return { error: 'NO_TOKEN' }

  // Strip any accidental "Bearer " prefix the user may have pasted, then re-add it cleanly
  const token = rawToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'NO_TOKEN' }

  const gql = `
    query Search($query: String!) {
      search(query: $query, query_type: "books", per_page: 20, page: 1) {
        results
      }
    }
  `
  const res = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query: gql, variables: { query } }),
  })

  const json = await res.json()
  if (json.errors) return { error: json.errors[0].message }

  // results is a JSON scalar from Typesense
  const raw = json.data?.search?.results
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const hits = parsed?.hits ?? []

  return hits.map(hit => {
    const doc = hit.document ?? hit
    let authors = []
    try {
      const contrib = typeof doc.cached_contributors === 'string'
        ? JSON.parse(doc.cached_contributors)
        : doc.cached_contributors
      authors = (contrib ?? []).map(c => c.author?.name ?? c.name).filter(Boolean)
    } catch { /* ignore */ }

    return {
      id:      doc.id,
      title:   doc.title ?? '',
      author:  authors.join(', '),
      cover:   doc.image?.url ?? doc.image_url ?? '',
      description: doc.description ?? '',
    }
  })
})

// --- AniList anime search (no auth required) ---
ipcMain.handle('api:searchAnime', async (_event, query) => {
  const gql = `
    query ($search: String!) {
      Page(page: 1, perPage: 20) {
        media(search: $search, type: ANIME) {
          id
          title { romaji english }
          coverImage { medium }
          episodes
          status
          averageScore
          description(asHtml: false)
          genres
          seasonYear
        }
      }
    }
  `
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  })

  const json = await res.json()
  if (json.errors) return { error: json.errors[0].message }

  return (json.data?.Page?.media ?? []).map(m => ({
    id:          m.id,
    title:       m.title.english || m.title.romaji,
    titleRomaji: m.title.romaji,
    cover:       m.coverImage?.medium ?? '',
    episodes:    m.episodes,
    status:      m.status,
    score:       m.averageScore ? Math.round(m.averageScore / 10) : null,
    description: m.description?.replace(/<[^>]*>/g, '').slice(0, 300) ?? '',
    genres:      m.genres?.slice(0, 3).join(', ') ?? '',
    year:        m.seasonYear,
  }))
})

// --- Window ---
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
  initDb()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
