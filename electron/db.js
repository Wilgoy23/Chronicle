const Database = require('better-sqlite3')

let db

function initDb(dbPath) {
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
  try { db.exec('ALTER TABLE entries ADD COLUMN cover_url TEXT') } catch {}
  try { db.exec('ALTER TABLE entries ADD COLUMN series TEXT') } catch {}
  try { db.exec('ALTER TABLE entries ADD COLUMN date_read TEXT') } catch {}
}

function getEntries(category) {
  if (category) {
    return db.prepare('SELECT * FROM entries WHERE category = ? ORDER BY id DESC').all(category)
  }
  return db.prepare('SELECT * FROM entries ORDER BY id DESC').all()
}

function addEntry({ category, title, status, rating, notes, cover_url, series, date_read }) {
  const result = db.prepare(
    'INSERT INTO entries (category, title, status, rating, notes, cover_url, series, date_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    category,
    title,
    status ?? 'completed',
    rating ?? null,
    notes ?? '',
    cover_url ?? null,
    series ?? null,
    date_read ?? null
  )
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid)
}

function getSeries(category) {
  return db
    .prepare(
      `SELECT DISTINCT series FROM entries
       WHERE category = ? AND series IS NOT NULL AND series != ''
       ORDER BY series`
    )
    .all(category)
    .map(r => r.series)
}

function updateEntry({ id, title, status, rating, notes, series, date_read }) {
  db.prepare(
    'UPDATE entries SET title = ?, status = ?, rating = ?, notes = ?, series = ?, date_read = ? WHERE id = ?'
  ).run(title, status, rating ?? null, notes ?? '', series ?? null, date_read ?? null, id)
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(id)
}

function deleteEntry(id) {
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
  return { success: true }
}

module.exports = { initDb, getEntries, addEntry, getSeries, updateEntry, deleteEntry }
