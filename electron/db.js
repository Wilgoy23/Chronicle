const Database = require('better-sqlite3')

let db
let dbFilePath = null

function initDb(dbPath) {
  dbFilePath = dbPath
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
  // External source linkage — needed to look up new releases in a franchise
  try { db.exec('ALTER TABLE entries ADD COLUMN source TEXT') } catch {}
  try { db.exec('ALTER TABLE entries ADD COLUMN source_id TEXT') } catch {}
  // Progress tracking — units are per-category (pages / episodes / hours …)
  try { db.exec('ALTER TABLE entries ADD COLUMN progress INTEGER DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE entries ADD COLUMN progress_total INTEGER') } catch {}
  // API synopsis, kept separate from the user's personal notes
  try { db.exec('ALTER TABLE entries ADD COLUMN description TEXT') } catch {}

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

  // Detected new releases for franchises in the library
  db.exec(`
    CREATE TABLE IF NOT EXISTS releases (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      category        TEXT NOT NULL,
      source          TEXT NOT NULL,
      source_id       TEXT NOT NULL,
      origin_entry_id INTEGER,
      origin_title    TEXT,
      title           TEXT NOT NULL,
      cover_url       TEXT,
      release_date    TEXT,
      relation        TEXT,
      detected_at     TEXT DEFAULT (datetime('now')),
      status          TEXT DEFAULT 'new',
      UNIQUE(source, source_id)
    )
  `)

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
         e.date_read, e.created_at, e.series_id, e.source, e.source_id,
         e.progress, e.progress_total, e.description, s.name AS series
  FROM entries e
  LEFT JOIN series s ON e.series_id = s.id
`

function getEntries(category) {
  return category
    ? db.prepare(`${ENTRY_SELECT} WHERE e.category = ? ORDER BY e.id DESC`).all(category)
    : db.prepare(`${ENTRY_SELECT} ORDER BY e.id DESC`).all()
}

function addEntry({ category, title, status, rating, notes, cover_url, series_id, date_read, source, source_id, progress, progress_total, description }) {
  // Duplicate guard — same title in same category
  const dup = db.prepare(`${ENTRY_SELECT} WHERE e.category = ? AND LOWER(e.title) = LOWER(?)`).get(category, title)
  if (dup) return { error: 'DUPLICATE', existing: dup }

  const result = db.prepare(`
    INSERT INTO entries (category, title, status, rating, notes, cover_url, series_id, date_read, source, source_id, progress, progress_total, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    category,
    title,
    status    ?? 'completed',
    rating    ?? null,
    notes     ?? '',
    cover_url ?? null,
    series_id ?? null,
    date_read ?? null,
    source    ?? null,
    source_id != null ? String(source_id) : null,
    progress  ?? 0,
    progress_total ?? null,
    description ?? null,
  )

  return db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(result.lastInsertRowid)
}

function updateEntry({ id, title, status, rating, notes, series_id, date_read, progress, progress_total }) {
  // Preserve progress when a caller omits it (e.g. drag-to-series only touches series_id).
  const cur = db.prepare('SELECT progress, progress_total FROM entries WHERE id = ?').get(id) || {}
  const nextProgress = progress       === undefined ? (cur.progress ?? 0)          : (progress ?? 0)
  const nextTotal    = progress_total === undefined ? (cur.progress_total ?? null) : (progress_total ?? null)
  db.prepare(`
    UPDATE entries SET title = ?, status = ?, rating = ?, notes = ?, series_id = ?, date_read = ?,
      progress = ?, progress_total = ?
    WHERE id = ?
  `).run(title, status, rating ?? null, notes ?? '', series_id ?? null, date_read ?? null,
         nextProgress, nextTotal, id)
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

// ── Source linkage + releases ────────────────────────────────────

// Entries already linked to an external source — these can be checked for releases.
function getEntriesWithSource() {
  return db.prepare(`${ENTRY_SELECT} WHERE e.source_id IS NOT NULL ORDER BY e.id DESC`).all()
}

// Entries that came from search but predate source linkage — candidates for backfill.
function getEntriesMissingSource() {
  return db.prepare(`${ENTRY_SELECT} WHERE e.source_id IS NULL ORDER BY e.id DESC`).all()
}

function setEntrySource(id, source, source_id) {
  db.prepare('UPDATE entries SET source = ?, source_id = ? WHERE id = ?')
    .run(source, source_id != null ? String(source_id) : null, id)
  return db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id)
}

function getReleases() {
  return db.prepare(`
    SELECT id, category, source, source_id, origin_entry_id, origin_title,
           title, cover_url, release_date, relation, detected_at, status
    FROM releases
    WHERE status IN ('new', 'seen')
    ORDER BY (release_date IS NULL), release_date DESC, detected_at DESC
  `).all()
}

// Returns true only if this release was newly inserted (UNIQUE(source, source_id) guards dupes).
function addRelease(rec) {
  const result = db.prepare(`
    INSERT OR IGNORE INTO releases
      (category, source, source_id, origin_entry_id, origin_title, title, cover_url, release_date, relation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rec.category,
    rec.source,
    String(rec.source_id),
    rec.origin_entry_id ?? null,
    rec.origin_title    ?? null,
    rec.title,
    rec.cover_url    ?? null,
    rec.release_date ?? null,
    rec.relation     ?? null,
  )
  if (result.changes === 0) return null
  return db.prepare('SELECT * FROM releases WHERE id = ?').get(result.lastInsertRowid)
}

// source_ids already recorded as releases — used to skip re-detecting them.
function getKnownReleaseSourceIds() {
  return new Set(db.prepare('SELECT source, source_id FROM releases').all().map(r => `${r.source}:${r.source_id}`))
}

function setReleaseStatus(id, status) {
  db.prepare('UPDATE releases SET status = ? WHERE id = ?').run(status, id)
  return { success: true }
}

function unseenReleaseCount() {
  return db.prepare(`SELECT COUNT(*) AS n FROM releases WHERE status = 'new'`).get().n
}

// ── Export / backup support ──────────────────────────────────────

function getDbPath() {
  return dbFilePath
}

// SQLite online backup — consistent snapshot even if the DB is mid-write.
function backupTo(destPath) {
  return db.backup(destPath)
}

function closeDb() {
  if (db) { db.close(); db = null }
}

// Cheap sanity check before overwriting the live DB: opens read-only and
// confirms the file is a SQLite DB with an `entries` table.
function validateBackupFile(filePath) {
  try {
    const test = new Database(filePath, { readonly: true, fileMustExist: true })
    const row = test.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'").get()
    test.close()
    return !!row
  } catch {
    return false
  }
}

function getAllSeries() {
  return db.prepare('SELECT id, category, name, created_at FROM series ORDER BY category, name').all()
}

// A full, portable snapshot of the library (all entries + series, every column).
function exportData() {
  return {
    format:     'chronicle-export',
    version:    1,
    exportedAt: new Date().toISOString(),
    entries:    db.prepare(`${ENTRY_SELECT} ORDER BY e.id`).all(),
    series:     getAllSeries(),
  }
}

module.exports = {
  initDb,
  getEntries, addEntry, updateEntry, deleteEntry,
  getSeries, addSeries, deleteSeries, renameSeries,
  getEntriesWithSource, getEntriesMissingSource, setEntrySource,
  getReleases, addRelease, getKnownReleaseSourceIds, setReleaseStatus, unseenReleaseCount,
  getDbPath, closeDb, getAllSeries, exportData, validateBackupFile, backupTo,
}
