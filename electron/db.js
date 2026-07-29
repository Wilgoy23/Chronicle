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
  // Genres / tags — comma-separated string (API genres on add, user-editable)
  try { db.exec('ALTER TABLE entries ADD COLUMN genres TEXT') } catch {}
  // Release year — used by smarter duplicate detection so same-title remakes coexist
  try { db.exec('ALTER TABLE entries ADD COLUMN year INTEGER') } catch {}

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

  // Re-watch / re-read logs — additional occurrences beyond the entry's own
  // first record (entries.date_read/rating is treated as occurrence #1).
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id   INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      date       TEXT,
      rating     INTEGER,
      notes      TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

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
         e.progress, e.progress_total, e.description, e.genres, e.year, s.name AS series,
         (SELECT COUNT(*) FROM logs l WHERE l.entry_id = e.id) AS log_count
  FROM entries e
  LEFT JOIN series s ON e.series_id = s.id
`

function getEntries(category) {
  return category
    ? db.prepare(`${ENTRY_SELECT} WHERE e.category = ? ORDER BY e.id DESC`).all(category)
    : db.prepare(`${ENTRY_SELECT} ORDER BY e.id DESC`).all()
}

// Trim/dedupe a comma-separated genre/tag string; return null when empty.
function normalizeGenres(genres) {
  if (genres == null) return null
  const seen = new Set()
  const out = []
  for (const raw of String(genres).split(',')) {
    const g = raw.trim()
    if (!g) continue
    const key = g.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(g)
  }
  return out.length ? out.join(', ') : null
}

// Smarter duplicate detection (5.7). Tiered precedence, all category-scoped:
//   1. exact external identity (source + source_id) — the strongest signal, so a
//      remake with a *different* source_id is correctly treated as a new title;
//   2. else title + year — lets same-title remakes from different years coexist;
//   3. else title only — the original behaviour for manual entries with no year.
// Returns the existing row, or null. Note: tmdb backs both movies and tv, so the
// category scope is what keeps a movie id from colliding with a same-numbered tv id.
function findDuplicate({ category, title, source, source_id, year }) {
  if (source && source_id != null && source_id !== '') {
    return db.prepare(
      `${ENTRY_SELECT} WHERE e.category = ? AND e.source = ? AND e.source_id = ?`
    ).get(category, source, String(source_id)) || null
  }
  if (year != null && year !== '') {
    return db.prepare(
      `${ENTRY_SELECT} WHERE e.category = ? AND LOWER(e.title) = LOWER(?) AND e.year = ?`
    ).get(category, title, Number(year)) || null
  }
  return db.prepare(
    `${ENTRY_SELECT} WHERE e.category = ? AND LOWER(e.title) = LOWER(?)`
  ).get(category, title) || null
}

function addEntry({ category, title, status, rating, notes, cover_url, series_id, date_read, source, source_id, progress, progress_total, description, genres, year, allowDuplicate }) {
  // allowDuplicate is the "Add anyway" escape hatch from the duplicate warning.
  if (!allowDuplicate) {
    const dup = findDuplicate({ category, title, source, source_id, year })
    if (dup) return { error: 'DUPLICATE', existing: dup }
  }

  const result = db.prepare(`
    INSERT INTO entries (category, title, status, rating, notes, cover_url, series_id, date_read, source, source_id, progress, progress_total, description, genres, year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    normalizeGenres(genres),
    year != null && year !== '' ? Number(year) : null,
  )

  return db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(result.lastInsertRowid)
}

function updateEntry({ id, title, status, rating, notes, series_id, date_read, progress, progress_total, genres }) {
  // Preserve progress/genres when a caller omits them (e.g. drag-to-series only touches series_id).
  const cur = db.prepare('SELECT progress, progress_total, genres FROM entries WHERE id = ?').get(id) || {}
  const nextProgress = progress       === undefined ? (cur.progress ?? 0)          : (progress ?? 0)
  const nextTotal    = progress_total === undefined ? (cur.progress_total ?? null) : (progress_total ?? null)
  const nextGenres   = genres         === undefined ? (cur.genres ?? null)         : normalizeGenres(genres)
  db.prepare(`
    UPDATE entries SET title = ?, status = ?, rating = ?, notes = ?, series_id = ?, date_read = ?,
      progress = ?, progress_total = ?, genres = ?
    WHERE id = ?
  `).run(title, status, rating ?? null, notes ?? '', series_id ?? null, date_read ?? null,
         nextProgress, nextTotal, nextGenres, id)
  return db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id)
}

function deleteEntry(id) {
  // Cascade logs explicitly — the ON DELETE CASCADE FK only fires when
  // PRAGMA foreign_keys is on, which we don't rely on elsewhere.
  db.prepare('DELETE FROM logs WHERE entry_id = ?').run(id)
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
  return { success: true }
}

// ── Re-watch / re-read logs ──────────────────────────────────────

function getLogs(entryId) {
  return db.prepare('SELECT id, entry_id, date, rating, notes FROM logs WHERE entry_id = ? ORDER BY date DESC, id DESC').all(entryId)
}

// All logs for entries in a category, for the timeline's per-occurrence view.
function getLogsByCategory(category) {
  return db.prepare(`
    SELECT l.id, l.entry_id, l.date, l.rating, l.notes
    FROM logs l JOIN entries e ON l.entry_id = e.id
    WHERE e.category = ?
    ORDER BY l.date DESC, l.id DESC
  `).all(category)
}

function addLog({ entry_id, date, rating, notes }) {
  const result = db.prepare(
    'INSERT INTO logs (entry_id, date, rating, notes) VALUES (?, ?, ?, ?)'
  ).run(entry_id, date || null, rating ?? null, notes ?? '')
  return db.prepare('SELECT id, entry_id, date, rating, notes FROM logs WHERE id = ?').get(result.lastInsertRowid)
}

function deleteLog(id) {
  db.prepare('DELETE FROM logs WHERE id = ?').run(id)
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

// A full, portable snapshot of the library (all entries + series + re-watch/
// re-read logs, every column). Logs are keyed by their *export-time* entry_id;
// importData remaps that to the freshly-inserted entry's new id.
function exportData() {
  return {
    format:     'chronicle-export',
    version:    1,
    exportedAt: new Date().toISOString(),
    entries:    db.prepare(`${ENTRY_SELECT} ORDER BY e.id`).all(),
    series:     getAllSeries(),
    logs:       db.prepare('SELECT id, entry_id, date, rating, notes FROM logs ORDER BY entry_id, id').all(),
  }
}

// Ingest a Chronicle export (from exportData). Series are matched/created by
// (category, name) in the *target* DB, so ids remap cleanly into any install.
// mode 'merge' (default) skips entries whose title already exists in the same
// category; original created_at / date_read are preserved. Logs (re-watch/
// re-read history) are re-keyed from their export-time entry_id to the newly
// inserted entry's id — skipped entries (dupes) simply drop their logs, same
// as the entry itself was never imported. Returns counts.
function importData(data, { mode = 'merge' } = {}) {
  if (!data || data.format !== 'chronicle-export' || !Array.isArray(data.entries)) {
    return { ok: false, error: 'That file is not a Chronicle JSON export.' }
  }

  const insertSeries = db.prepare('INSERT OR IGNORE INTO series (category, name) VALUES (?, ?)')
  const findSeries   = db.prepare('SELECT id FROM series WHERE category = ? AND name = ?')
  const findDup      = db.prepare('SELECT id FROM entries WHERE category = ? AND LOWER(title) = LOWER(?)')
  const insertEntry  = db.prepare(`
    INSERT INTO entries
      (category, title, status, rating, notes, cover_url, series_id, date_read,
       source, source_id, progress, progress_total, description, genres, year, created_at)
    VALUES
      (@category, @title, @status, @rating, @notes, @cover_url, @series_id, @date_read,
       @source, @source_id, @progress, @progress_total, @description, @genres, @year, @created_at)
  `)
  const insertLog = db.prepare(
    'INSERT INTO logs (entry_id, date, rating, notes) VALUES (?, ?, ?, ?)'
  )

  const seriesBefore = db.prepare('SELECT COUNT(*) AS n FROM series').get().n
  let imported = 0, skipped = 0, logsImported = 0
  const idMap = new Map() // export-time entry id -> newly inserted entry id

  const run = db.transaction(() => {
    // Seed the series table first so even empty series carry over.
    for (const s of (Array.isArray(data.series) ? data.series : [])) {
      if (s && s.category && s.name) insertSeries.run(s.category, s.name)
    }

    for (const e of data.entries) {
      if (!e || !e.category || !e.title) { skipped++; continue }
      if (mode === 'merge' && findDup.get(e.category, e.title)) { skipped++; continue }

      // Resolve the series by name within the entry's category.
      let series_id = null
      if (e.series) {
        insertSeries.run(e.category, e.series)
        series_id = findSeries.get(e.category, e.series)?.id ?? null
      }

      const result = insertEntry.run({
        category:       e.category,
        title:          e.title,
        status:         e.status ?? 'completed',
        rating:         e.rating ?? null,
        notes:          e.notes ?? '',
        cover_url:      e.cover_url ?? null,
        series_id,
        date_read:      e.date_read ?? null,
        source:         e.source ?? null,
        source_id:      e.source_id != null ? String(e.source_id) : null,
        progress:       e.progress ?? 0,
        progress_total: e.progress_total ?? null,
        description:    e.description ?? null,
        genres:         normalizeGenres(e.genres),
        year:           e.year != null && e.year !== '' ? Number(e.year) : null,
        created_at:     e.created_at ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
      })
      if (e.id != null) idMap.set(e.id, result.lastInsertRowid)
      imported++
    }

    // Older exports (pre-6.1) have no `logs` key — treat that as "no logs," not an error.
    for (const l of (Array.isArray(data.logs) ? data.logs : [])) {
      if (!l || l.entry_id == null) continue
      const newEntryId = idMap.get(l.entry_id)
      if (newEntryId == null) continue // parent entry wasn't imported (dupe-skipped)
      insertLog.run(newEntryId, l.date ?? null, l.rating ?? null, l.notes ?? '')
      logsImported++
    }
  })
  run()

  const seriesAfter = db.prepare('SELECT COUNT(*) AS n FROM series').get().n
  return { ok: true, imported, skipped, seriesAdded: seriesAfter - seriesBefore, logsImported }
}

module.exports = {
  initDb,
  getEntries, addEntry, findDuplicate, updateEntry, deleteEntry,
  getLogs, getLogsByCategory, addLog, deleteLog,
  getSeries, addSeries, deleteSeries, renameSeries,
  getEntriesWithSource, getEntriesMissingSource, setEntrySource,
  getReleases, addRelease, getKnownReleaseSourceIds, setReleaseStatus, unseenReleaseCount,
  getDbPath, closeDb, getAllSeries, exportData, importData, validateBackupFile, backupTo,
}
