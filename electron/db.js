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

  // Dated activity: one row per progress change and/or status change, written
  // by updateEntry. Powers the edit panel's history ("Nov 3 · pages 112 → 148")
  // and Up Next's "most recently touched" ordering. `status` is the new status
  // when it changed in that update, else null; `delta` is the progress change.
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id   INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      at         TEXT NOT NULL DEFAULT (datetime('now')),
      progress   INTEGER,
      delta      INTEGER NOT NULL DEFAULT 0,
      status     TEXT
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS activity_entry ON activity(entry_id, at)')

  // Small TTL cache for remote lookups (episode lists) — keeps Up Next and the
  // episode grid from refetching on every open, and serves stale data offline.
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_cache (
      key        TEXT PRIMARY KEY,
      json       TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    )
  `)

  // Custom lists (8.1): user-ordered collections of library entries that can
  // mix categories ("Comfort rewatches", "Before the sequel"), independent of
  // status. An entry can sit in any number of lists, once per list.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lists (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS list_items (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id   INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      entry_id  INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      position  INTEGER NOT NULL DEFAULT 0,
      note      TEXT,
      added_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(list_id, entry_id)
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS list_items_entry ON list_items(entry_id)')

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

  // Local AI: one embedding vector per entry. `model` records which backend
  // produced the vector (real model vs lexical fallback) so the index is
  // rebuilt rather than mixed when the backend changes; `text_hash` lets
  // indexing skip entries whose embed-text hasn't changed.
  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      entry_id   INTEGER PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
      model      TEXT NOT NULL,
      dim        INTEGER NOT NULL,
      vector     BLOB NOT NULL,
      text_hash  TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
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
         (SELECT COUNT(*) FROM logs l WHERE l.entry_id = e.id) AS log_count,
         COALESCE((SELECT MAX(a.at) FROM activity a WHERE a.entry_id = e.id), e.created_at) AS last_activity
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

function updateEntry({ id, title, status, rating, notes, series_id, date_read, progress, progress_total, genres, year }) {
  // Preserve progress/genres/year when a caller omits them (e.g. drag-to-series only touches series_id).
  const cur = db.prepare('SELECT status, progress, progress_total, genres, year FROM entries WHERE id = ?').get(id) || {}
  const nextProgress = progress       === undefined ? (cur.progress ?? 0)          : (progress ?? 0)
  const nextTotal    = progress_total === undefined ? (cur.progress_total ?? null) : (progress_total ?? null)
  const nextGenres   = genres         === undefined ? (cur.genres ?? null)         : normalizeGenres(genres)
  const nextYear     = year           === undefined ? (cur.year ?? null)
                        : (year != null && year !== '' ? Number(year) : null)
  db.prepare(`
    UPDATE entries SET title = ?, status = ?, rating = ?, notes = ?, series_id = ?, date_read = ?,
      progress = ?, progress_total = ?, genres = ?, year = ?
    WHERE id = ?
  `).run(title, status, rating ?? null, notes ?? '', series_id ?? null, date_read ?? null,
         nextProgress, nextTotal, nextGenres, nextYear, id)

  // Record dated activity when progress or status actually moved.
  const prevProgress = cur.progress ?? 0
  const statusChanged = cur.status != null && status != null && status !== cur.status
  if (nextProgress !== prevProgress || statusChanged) {
    db.prepare('INSERT INTO activity (entry_id, progress, delta, status) VALUES (?, ?, ?, ?)')
      .run(id, nextProgress, nextProgress - prevProgress, statusChanged ? status : null)
  }
  return db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id)
}

// Newest first. `at` is UTC ("YYYY-MM-DD HH:MM:SS"), as SQLite's datetime('now').
function getActivity(entryId) {
  return db.prepare(
    'SELECT id, entry_id, at, progress, delta, status FROM activity WHERE entry_id = ? ORDER BY at DESC, id DESC'
  ).all(entryId)
}

// ── Remote lookup cache ──────────────────────────────────────────

// Returns { value, fresh } or null. Stale values are still returned (fresh:
// false) so callers can fall back to them when the network is unavailable.
function cacheGet(key, maxAgeMs) {
  const row = db.prepare('SELECT json, fetched_at FROM media_cache WHERE key = ?').get(key)
  if (!row) return null
  try {
    return { value: JSON.parse(row.json), fresh: Date.now() - row.fetched_at < maxAgeMs }
  } catch {
    return null
  }
}

function cacheSet(key, value) {
  db.prepare('INSERT OR REPLACE INTO media_cache (key, json, fetched_at) VALUES (?, ?, ?)')
    .run(key, JSON.stringify(value), Date.now())
}

function deleteEntry(id) {
  // Cascade logs explicitly — the ON DELETE CASCADE FK only fires when
  // PRAGMA foreign_keys is on, which we don't rely on elsewhere.
  db.prepare('DELETE FROM logs WHERE entry_id = ?').run(id)
  db.prepare('DELETE FROM activity WHERE entry_id = ?').run(id)
  db.prepare('DELETE FROM list_items WHERE entry_id = ?').run(id)
  db.prepare('DELETE FROM embeddings WHERE entry_id = ?').run(id)
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

// Case-insensitive find-or-create, so "the expanse" lands in an existing "The Expanse".
function findOrCreateSeries(category, name) {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return null
  const existing = db.prepare(
    'SELECT id, name, category FROM series WHERE category = ? AND LOWER(name) = LOWER(?)'
  ).get(category, trimmed)
  return existing ?? addSeries(category, trimmed)
}

// "Add series…": insert a whole series in one transaction. Each item carries
// its own status. Duplicates are skipped, not fatal — the caller gets a
// per-item result so it can report "7 added, 2 already in library".
// Either seriesId (an existing series) or seriesName (find-or-create) groups them.
function addEntriesBatch({ category, seriesId = null, seriesName = '', source = null, entries = [] }) {
  const run = db.transaction(() => {
    const series = seriesId != null
      ? db.prepare('SELECT id, name, category FROM series WHERE id = ?').get(seriesId) ?? null
      : findOrCreateSeries(category, seriesName)

    const results = entries.map(item => {
      const entry = addEntry({
        category,
        title:          item.title,
        status:         item.status,
        rating:         item.rating ?? null,
        notes:          item.notes ?? '',
        cover_url:      item.cover_url ?? null,
        series_id:      series?.id ?? null,
        date_read:      item.date_read ?? null,
        source:         item.source ?? source,
        source_id:      item.source_id ?? null,
        progress:       item.progress ?? 0,
        progress_total: item.progress_total ?? null,
        description:    item.description ?? null,
        genres:         item.genres ?? null,
        year:           item.year ?? null,
        allowDuplicate: !!item.allowDuplicate,
      })
      if (entry?.error === 'DUPLICATE') {
        return { status: 'duplicate', title: item.title, existing: entry.existing }
      }
      return { status: 'added', entry }
    })
    return { series, results }
  })
  return run()
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

// ── Custom lists ─────────────────────────────────────────────────

const LIST_COVERS = 4

// Every list with its size, how many items are completed, and the first few
// covers (in list order) for the index page's mosaic.
function getLists() {
  const lists = db.prepare(`
    SELECT l.id, l.name, l.description, l.created_at, l.updated_at,
           COUNT(li.id) AS item_count,
           SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
    FROM lists l
    LEFT JOIN list_items li ON li.list_id = l.id
    LEFT JOIN entries e ON e.id = li.entry_id
    GROUP BY l.id
    ORDER BY l.id
  `).all()
  const covers = db.prepare(`
    SELECT e.cover_url FROM list_items li JOIN entries e ON e.id = li.entry_id
    WHERE li.list_id = ? AND e.cover_url IS NOT NULL AND e.cover_url != ''
    ORDER BY li.position, li.id LIMIT ${LIST_COVERS}
  `)
  return lists.map(l => ({
    ...l,
    completed_count: l.completed_count ?? 0,
    covers: covers.all(l.id).map(r => r.cover_url),
  }))
}

function getList(id) {
  return getLists().find(l => l.id === id) ?? null
}

function createList({ name, description = null }) {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return { error: 'NAME_REQUIRED' }
  const result = db.prepare('INSERT INTO lists (name, description) VALUES (?, ?)')
    .run(trimmed, description?.trim() || null)
  return getList(Number(result.lastInsertRowid))
}

function updateList({ id, name, description }) {
  const cur = db.prepare('SELECT name, description FROM lists WHERE id = ?').get(id)
  if (!cur) return { error: 'NOT_FOUND' }
  const nextName = name === undefined ? cur.name : (name ?? '').trim()
  if (!nextName) return { error: 'NAME_REQUIRED' }
  const nextDesc = description === undefined ? cur.description : (description?.trim() || null)
  db.prepare(`UPDATE lists SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(nextName, nextDesc, id)
  return getList(id)
}

function deleteList(id) {
  db.prepare('DELETE FROM list_items WHERE list_id = ?').run(id)
  db.prepare('DELETE FROM lists WHERE id = ?').run(id)
  return { success: true }
}

function touchList(id) {
  db.prepare(`UPDATE lists SET updated_at = datetime('now') WHERE id = ?`).run(id)
}

// Full entries in list order, each carrying its list-specific note.
function getListItems(listId) {
  return db.prepare(`
    SELECT q.*, li.note AS list_note
    FROM list_items li
    JOIN (${ENTRY_SELECT}) q ON q.id = li.entry_id
    WHERE li.list_id = ?
    ORDER BY li.position, li.id
  `).all(listId)
}

// Appends in the order given, skipping entries already on the list.
function addToList(listId, entryIds = []) {
  const run = db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM lists WHERE id = ?').get(listId)) return { error: 'NOT_FOUND' }
    const has    = db.prepare('SELECT 1 FROM list_items WHERE list_id = ? AND entry_id = ?')
    const exists = db.prepare('SELECT 1 FROM entries WHERE id = ?')
    const insert = db.prepare('INSERT INTO list_items (list_id, entry_id, position) VALUES (?, ?, ?)')
    let next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM list_items WHERE list_id = ?').get(listId).n
    let added = 0, skipped = 0
    for (const entryId of entryIds) {
      if (has.get(listId, entryId) || !exists.get(entryId)) { skipped++; continue }
      insert.run(listId, entryId, next++)
      added++
    }
    if (added) touchList(listId)
    return { added, skipped }
  })
  return run()
}

function removeFromList(listId, entryId) {
  db.prepare('DELETE FROM list_items WHERE list_id = ? AND entry_id = ?').run(listId, entryId)
  touchList(listId)
  return { success: true }
}

// `entryIds` is the new full order. Ids not on the list are ignored; items
// the caller left out keep their relative order after the given ones.
function reorderList(listId, entryIds = []) {
  const run = db.transaction(() => {
    const current = db.prepare('SELECT entry_id FROM list_items WHERE list_id = ? ORDER BY position, id')
      .all(listId).map(r => r.entry_id)
    const onList = new Set(current)
    const given  = entryIds.filter(id => onList.has(id))
    const givenSet = new Set(given)
    const order  = [...given, ...current.filter(id => !givenSet.has(id))]
    const set = db.prepare('UPDATE list_items SET position = ? WHERE list_id = ? AND entry_id = ?')
    order.forEach((entryId, i) => set.run(i, listId, entryId))
    touchList(listId)
    return { success: true }
  })
  return run()
}

function setListItemNote(listId, entryId, note) {
  db.prepare('UPDATE list_items SET note = ? WHERE list_id = ? AND entry_id = ?')
    .run(note?.trim() || null, listId, entryId)
  return { success: true }
}

// Ids of the lists an entry belongs to, for the edit panel's list chips.
function getEntryListIds(entryId) {
  return db.prepare('SELECT list_id FROM list_items WHERE entry_id = ? ORDER BY list_id').all(entryId).map(r => r.list_id)
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

// Dated releases for the calendar (8.2). Unlike the inbox this keeps ones
// already added to the library — an upcoming title you've planned is exactly
// what belongs on a calendar — and links them to that entry when it exists.
function getCalendarReleases() {
  return db.prepare(`
    SELECT r.id, r.category, r.source, r.source_id, r.origin_entry_id, r.origin_title,
           r.title, r.cover_url, r.release_date, r.relation, r.status,
           (SELECT e.id FROM entries e
             WHERE e.category = r.category AND e.source = r.source AND e.source_id = r.source_id
             LIMIT 1) AS entry_id
    FROM releases r
    WHERE r.status != 'dismissed' AND r.release_date IS NOT NULL AND r.release_date != ''
    ORDER BY r.release_date
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

// ── Local AI embedding index ─────────────────────────────────────

// Everything the indexer needs to diff: which entries are indexed, under
// which model, and against which text hash. Vectors stay as raw Buffers.
function getEmbeddingIndex() {
  return db.prepare('SELECT entry_id, model, dim, vector, text_hash FROM embeddings').all()
}

function upsertEmbedding({ entry_id, model, dim, vector, text_hash }) {
  db.prepare(`
    INSERT OR REPLACE INTO embeddings (entry_id, model, dim, vector, text_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(entry_id, model, dim, vector, text_hash)
}

// Wipe vectors from any other backend — cheaper than mixing incomparable spaces.
function deleteEmbeddingsForOtherModels(model) {
  db.prepare('DELETE FROM embeddings WHERE model != ?').run(model)
}

// Remove vectors whose entry has been deleted outside deleteEntry (e.g. restore).
function pruneOrphanEmbeddings() {
  db.prepare('DELETE FROM embeddings WHERE entry_id NOT IN (SELECT id FROM entries)').run()
}

function clearEmbeddings() {
  db.prepare('DELETE FROM embeddings').run()
}

function countEmbeddings() {
  return db.prepare('SELECT COUNT(*) AS n FROM embeddings').get().n
}

// Minimal single-column update used by "apply series suggestion" — updateEntry
// requires every editable field, which the AI panel doesn't have loaded.
function setEntrySeries(id, series_id) {
  db.prepare('UPDATE entries SET series_id = ? WHERE id = ?').run(series_id ?? null, id)
  return db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id)
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
    activity:   db.prepare('SELECT id, entry_id, at, progress, delta, status FROM activity ORDER BY entry_id, at, id').all(),
    lists:      db.prepare('SELECT id, name, description, created_at FROM lists ORDER BY id').all(),
    listItems:  db.prepare('SELECT list_id, entry_id, position, note FROM list_items ORDER BY list_id, position, id').all(),
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
  // Imports that carry a catalogue id (AniList) also dedupe on it, since the
  // same show can be titled differently (English vs romaji) across sources.
  const findDupBySource = db.prepare('SELECT id FROM entries WHERE category = ? AND source = ? AND source_id = ?')
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
  const insertActivity = db.prepare(
    'INSERT INTO activity (entry_id, at, progress, delta, status) VALUES (?, ?, ?, ?, ?)'
  )

  const seriesBefore = db.prepare('SELECT COUNT(*) AS n FROM series').get().n
  let imported = 0, skipped = 0, logsImported = 0
  const idMap = new Map() // export-time entry id -> newly inserted entry id
  // Lists also follow entries that were skipped as duplicates, to the copy
  // already in the library, so re-importing an export keeps list membership.
  const memberMap = new Map()
  let listsImported = 0

  const run = db.transaction(() => {
    // Seed the series table first so even empty series carry over.
    for (const s of (Array.isArray(data.series) ? data.series : [])) {
      if (s && s.category && s.name) insertSeries.run(s.category, s.name)
    }

    for (const e of data.entries) {
      if (!e || !e.category || !e.title) { skipped++; continue }
      if (mode === 'merge') {
        const sourceDup = e.source && e.source_id != null && e.source_id !== ''
          && findDupBySource.get(e.category, e.source, String(e.source_id))
        const dup = sourceDup || findDup.get(e.category, e.title)
        if (dup) {
          if (e.id != null) memberMap.set(e.id, dup.id)
          skipped++
          continue
        }
      }

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
      if (e.id != null) {
        idMap.set(e.id, result.lastInsertRowid)
        memberMap.set(e.id, result.lastInsertRowid)
      }
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

    // Activity history (7.2) — same remap-or-drop rule as logs; absent in older exports.
    for (const a of (Array.isArray(data.activity) ? data.activity : [])) {
      if (!a || a.entry_id == null || !a.at) continue
      const newEntryId = idMap.get(a.entry_id)
      if (newEntryId == null) continue
      insertActivity.run(newEntryId, a.at, a.progress ?? null, a.delta ?? 0, a.status ?? null)
    }

    // Custom lists (8.1): merge into a same-named list, else create it; items
    // append in their exported order, skipping ones already on the list.
    const findList   = db.prepare('SELECT id FROM lists WHERE LOWER(name) = LOWER(?)')
    const insertList = db.prepare('INSERT INTO lists (name, description, created_at) VALUES (?, ?, ?)')
    const listMap = new Map()
    for (const l of (Array.isArray(data.lists) ? data.lists : [])) {
      const name = (l?.name ?? '').trim()
      if (!name || l.id == null) continue
      const existing = findList.get(name)
      if (existing) { listMap.set(l.id, existing.id); continue }
      const res = insertList.run(name, l.description ?? null, l.created_at ?? new Date().toISOString().slice(0, 19).replace('T', ' '))
      listMap.set(l.id, Number(res.lastInsertRowid))
      listsImported++
    }
    const items = (Array.isArray(data.listItems) ? data.listItems : [])
      .filter(i => i && listMap.has(i.list_id) && memberMap.has(i.entry_id))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const has  = db.prepare('SELECT 1 FROM list_items WHERE list_id = ? AND entry_id = ?')
    const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM list_items WHERE list_id = ?')
    const insertItem = db.prepare('INSERT INTO list_items (list_id, entry_id, position, note) VALUES (?, ?, ?, ?)')
    for (const i of items) {
      const listId = listMap.get(i.list_id)
      const entryId = memberMap.get(i.entry_id)
      if (has.get(listId, entryId)) continue
      insertItem.run(listId, entryId, next.get(listId).n, i.note ?? null)
    }
  })
  run()

  const seriesAfter = db.prepare('SELECT COUNT(*) AS n FROM series').get().n
  return { ok: true, imported, skipped, seriesAdded: seriesAfter - seriesBefore, logsImported, listsImported }
}

module.exports = {
  initDb,
  getEntries, addEntry, findDuplicate, updateEntry, deleteEntry,
  getActivity, cacheGet, cacheSet,
  getLogs, getLogsByCategory, addLog, deleteLog,
  getSeries, addSeries, deleteSeries, renameSeries, findOrCreateSeries, addEntriesBatch,
  getEntriesWithSource, getEntriesMissingSource, setEntrySource, setEntrySeries,
  getEmbeddingIndex, upsertEmbedding, deleteEmbeddingsForOtherModels,
  pruneOrphanEmbeddings, clearEmbeddings, countEmbeddings,
  getLists, getList, createList, updateList, deleteList,
  getListItems, addToList, removeFromList, reorderList, setListItemNote, getEntryListIds,
  getReleases, getCalendarReleases, addRelease, getKnownReleaseSourceIds, setReleaseStatus, unseenReleaseCount,
  getDbPath, closeDb, getAllSeries, exportData, importData, validateBackupFile, backupTo,
}
