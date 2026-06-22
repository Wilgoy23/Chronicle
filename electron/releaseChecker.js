const db = require('./db')
const api = require('./api')

// How recently-released an item can be and still count as "news".
const RECENT_DAYS = 400
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const REQUEST_GAP_MS = 350

const SOURCE_BY_CATEGORY = { book: 'hardcover', anime: 'anilist', movie: 'tmdb', game: 'rawg' }

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const norm  = (s) => (s ?? '').trim().toLowerCase()

function keysFor(category, settings) {
  return {
    tmdbKey:        settings.tmdbKey,
    rawgKey:        settings.rawgKey,
    hardcoverToken: settings.hardcoverToken,
  }
}

function searchFor(category, query, settings) {
  const k = keysFor(category, settings)
  if (category === 'book')  return api.searchBooks(query, k.hardcoverToken)
  if (category === 'anime') return api.searchAnime(query)
  if (category === 'movie') return api.searchMovies(query, k.tmdbKey)
  if (category === 'game')  return api.searchGames(query, k.rawgKey)
  return Promise.resolve([])
}

function lookupFor(category, sourceId, settings) {
  const k = keysFor(category, settings)
  if (category === 'book')  return api.getBookSeries(sourceId, k.hardcoverToken)
  if (category === 'anime') return api.getAnimeRelations(sourceId)
  if (category === 'movie') return api.getMovieCollection(sourceId, k.tmdbKey)
  if (category === 'game')  return api.getGameSeries(sourceId, k.rawgKey)
  return Promise.resolve([])
}

// Surface upcoming items and recent installments; drop deep back-catalog.
function isNoteworthy(c) {
  if (c.unreleased) return true
  if (!c.release_date) return false
  const t = Date.parse(c.release_date)
  if (Number.isNaN(t)) return false
  return t >= Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
}

function notifPrefs(settings) {
  const n = settings.notifications ?? {}
  return {
    enabled:    n.enabled !== false,
    categories: n.categories ?? { book: true, anime: true, movie: true, game: true },
    lastCheck:  n.lastCheck ?? null,
    linkedExisting: !!n.linkedExisting,
  }
}

// Best-effort: recover source_id for entries added before linkage existed.
async function linkExisting(settings) {
  const prefs = notifPrefs(settings)
  const entries = db.getEntriesMissingSource()
  for (const entry of entries) {
    if (prefs.categories[entry.category] === false) continue
    try {
      const results = await searchFor(entry.category, entry.title, settings)
      await sleep(REQUEST_GAP_MS)
      if (!Array.isArray(results) || results.length === 0) continue
      const exact = results.find(r => norm(r.title) === norm(entry.title))
      const match = exact ?? results[0]
      if (match?.id != null) {
        db.setEntrySource(entry.id, SOURCE_BY_CATEGORY[entry.category] ?? entry.category, match.id)
      }
    } catch { /* tolerate misses */ }
  }
}

async function checkForReleases(settings) {
  const prefs = notifPrefs(settings)
  const entries = db.getEntriesWithSource()

  // Everything we already have or already detected — never re-surface.
  const known = db.getKnownReleaseSourceIds()
  const inLibrary = new Set()
  const titlesInLibrary = new Set()
  for (const e of db.getEntries()) {
    if (e.source && e.source_id) inLibrary.add(`${e.source}:${e.source_id}`)
    titlesInLibrary.add(norm(e.title))
  }

  const fresh = []
  for (const entry of entries) {
    if (prefs.categories[entry.category] === false) continue
    let candidates
    try {
      candidates = await lookupFor(entry.category, entry.source_id, settings)
      await sleep(REQUEST_GAP_MS)
    } catch { continue }
    if (!Array.isArray(candidates)) continue // {error} or null

    for (const c of candidates) {
      if (!isNoteworthy(c)) continue
      const key = `${entry.source}:${c.source_id}`
      if (inLibrary.has(key)) continue
      if (titlesInLibrary.has(norm(c.title))) continue
      if (known.has(key)) continue

      const rec = db.addRelease({
        category:        entry.category,
        source:          entry.source,
        source_id:       c.source_id,
        origin_entry_id: entry.id,
        origin_title:    entry.title,
        title:           c.title,
        cover_url:       c.cover_url,
        release_date:    c.release_date,
        relation:        c.relation,
      })
      if (rec) {
        fresh.push(rec)
        known.add(key) // guard against the same candidate from sibling entries this run
      }
    }
  }
  return fresh
}

// Orchestrates a full scan; honors the once-per-day throttle unless forced.
async function runReleaseScan(readSettings, writeSettings, { force = false } = {}) {
  const settings = readSettings()
  const prefs = notifPrefs(settings)
  if (!prefs.enabled) return []

  if (!force && prefs.lastCheck) {
    const elapsed = Date.now() - Date.parse(prefs.lastCheck)
    if (!Number.isNaN(elapsed) && elapsed < CHECK_INTERVAL_MS) return []
  }

  if (!prefs.linkedExisting) {
    await linkExisting(settings)
  }

  const fresh = await checkForReleases(settings)

  const next = readSettings()
  writeSettings({
    ...next,
    notifications: {
      ...(next.notifications ?? {}),
      enabled:        prefs.enabled,
      categories:     prefs.categories,
      lastCheck:      new Date().toISOString(),
      linkedExisting: true,
    },
  })

  return fresh
}

module.exports = { runReleaseScan, linkExisting, checkForReleases }
