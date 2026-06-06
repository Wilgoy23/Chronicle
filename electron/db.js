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

  // Legacy column migrations (safe to run repeatedly)
  try { db.exec('ALTER TABLE entries ADD COLUMN cover_url TEXT') } catch {}
  try { db.exec('ALTER TABLE entries ADD COLUMN series TEXT') } catch {}
  try { db.exec('ALTER TABLE entries ADD COLUMN date_read TEXT') } catch {}

  // Series table — standalone, first-class records
  db.exec(`
    CREATE TABLE IF NOT EXISTS series (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      category   TEXT NOT NULL,
      name       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(category, name)
    )
  `)

  // FK from entries to series
  try { db.exec('ALTER TABLE entries ADD COLUMN series_id INTEGER REFERENCES series(id) ON DELETE SET NULL') } catch {}

  // One-time migration: promote entries.series text → series table rows + series_id
  const needsMigration = db.prepare(`
    SELECT 1 FROM entries WHERE series IS NOT NULL AND series != '' AND series_id IS NULL LIMIT 1
  `).get()

  if (needsMigration) {
    const insertSeries = db.prepare('INSERT OR IGNORE INTO series (category, name) VALUES (?, ?)')
    const backfill = db.prepare(`
      UPDATE entries
      SET series_id = (SELECT s.id FROM series s WHERE s.category = entries.category AND s.name = entries.series)
      WHERE series IS NOT NULL AND series != '' AND series_id IS NULL
    `)
    const migrate = db.transaction(() => {
      const rows = db.prepare(`
        SELECT DISTINCT category, series FROM entries
        WHERE series IS NOT NULL AND series != ''
      `).all()
      for (const { category, series } of rows) insertSeries.run(category, series)
      backfill.run()
    })
    migrate()
  }
}

// ── Shared SELECT fragment ───────────────────────────────────────
const ENTRY_SELECT = `
  SELECT e.id, e.category, e.title, e.status, e.rating, e.notes, e.cover_url,
         e.date_read, e.created_at, e.series_id, s.name AS series
  FROM entries e
  LEFT JOIN series s ON e.series_id = s.id
`

function getEntries(category) {
  return category
    ? db.prepare(`${ENTRY_SELECT} WHERE e.category = ? ORDER BY e.id DESC`).all(category)
    : db.prepare(`${ENTRY_SELECT} ORDER BY e.id DESC`).all()
}

function addEntry({ category, title, status, rating, notes, cover_url, series_id, date_read }) {
  // Duplicate guard — same title in same category
  const dup = db.prepare(`${ENTRY_SELECT} WHERE e.category = ? AND LOWER(e.title) = LOWER(?)`).get(category, title)
  if (dup) return { error: 'DUPLICATE', existing: dup }

  const result = db.prepare(`
    INSERT INTO entries (category, title, status, rating, notes, cover_url, series_id, date_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    category,
    title,
    status    ?? 'completed',
    rating    ?? null,
    notes     ?? '',
    cover_url ?? null,
    series_id ?? null,
    date_read ?? null,
  )

  return db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(result.lastInsertRowid)
}

function updateEntry({ id, title, status, rating, notes, series_id, date_read }) {
  db.prepare(`
    UPDATE entries SET title = ?, status = ?, rating = ?, notes = ?, series_id = ?, date_read = ?
    WHERE id = ?
  `).run(title, status, rating ?? null, notes ?? '', series_id ?? null, date_read ?? null, id)
  return db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id)
}

function deleteEntry(id) {
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
  return { success: true }
}

// ── Series CRUD ──────────────────────────────────────────────────

function getSeries(category) {
  return db.prepare('SELECT id, name FROM series WHERE category = ? ORDER BY name').all(category)
}

function addSeries(category, name) {
  try {
    const result = db.prepare('INSERT INTO series (category, name) VALUES (?, ?)').run(category, name.trim())
    return db.prepare('SELECT id, name, category FROM series WHERE id = ?').get(result.lastInsertRowid)
  } catch {
    // UNIQUE conflict — return the existing record
    return db.prepare('SELECT id, name, category FROM series WHERE category = ? AND name = ?').get(category, name.trim())
  }
}

function deleteSeries(id) {
  db.prepare('UPDATE entries SET series_id = NULL WHERE series_id = ?').run(id)
  db.prepare('DELETE FROM series WHERE id = ?').run(id)
  return { success: true }
}

function renameSeries(id, name) {
  db.prepare('UPDATE series SET name = ? WHERE id = ?').run(name.trim(), id)
  return db.prepare('SELECT id, name, category FROM series WHERE id = ?').get(id)
}

module.exports = {
  initDb,
  getEntries, addEntry, updateEntry, deleteEntry,
  getSeries, addSeries, deleteSeries, renameSeries,
}
