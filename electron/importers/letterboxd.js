// Letterboxd "Export Data" CSVs -> the shape importData() (electron/db.js)
// already accepts, so the existing merge/dedupe logic is reused unchanged.
//
// Letterboxd's export is a zip of several CSVs; the user extracts it and picks
// one or more of them. Each file maps differently (`kind`, from the filename):
//   diary.csv     every logged watch: Date, Name, Year, Letterboxd URI, Rating,
//                 Rewatch, Tags, Watched Date → completed. Repeat watches of the
//                 same film collapse into ONE entry (the earliest watch) plus a
//                 re-watch log per later watch, so the ×N badge and per-watch
//                 ratings survive instead of later rows being skipped as dupes.
//   ratings.csv   Date, Name, Year, Letterboxd URI, Rating → completed, rated.
//   watched.csv   Date, Name, Year, Letterboxd URI → completed (Date is when it
//                 was marked watched, not a viewing date, so it's not date_read).
//   watchlist.csv Date, Name, Year, Letterboxd URI → planned.
//   reviews.csv   Date, Name, Year, Letterboxd URI, Rating, Rewatch, Review,
//                 Tags, Watched Date → the Review text lands on the film's entry
//                 from the other files (by name + year), or a new completed one.
//                 A film reviewed twice keeps its latest review.
// Column reference is the documented export format, not yet verified against a
// live download.
const { parseCsv } = require('../csv')

// Letterboxd dates are already "yyyy-MM-dd"; pass through, blank -> null.
function letterboxdDate(raw) {
  const t = (raw || '').trim()
  return t || null
}

// diary | ratings | watched | watchlist | reviews, from an exported file's name.
function letterboxdKind(fileName = '') {
  const base = String(fileName).split(/[\\/]/).pop().toLowerCase()
  for (const k of ['watchlist', 'ratings', 'watched', 'reviews', 'diary']) {
    if (base.startsWith(k)) return k
  }
  return 'diary'
}

// Process order when several files are imported together: richest first, so
// importData's title dedupe keeps the diary version of a film over its
// ratings/watched duplicates.
const KIND_ORDER = ['diary', 'ratings', 'watched', 'watchlist', 'reviews']

function stars(raw) {
  const s = parseFloat(raw)
  return Number.isFinite(s) && s > 0 ? Math.round(s * 2) : null
}

function yearOf(raw) {
  const y = parseInt(String(raw ?? '').trim(), 10)
  return Number.isFinite(y) ? y : undefined
}

function mapDiary(rows, nextId) {
  // Group by film: URI when present, else name + year.
  const groups = new Map()
  for (const row of rows) {
    const title = (row['Name'] || '').trim()
    if (!title) continue
    const key = (row['Letterboxd URI'] || '').trim() || `${title.toLowerCase()}|${(row['Year'] || '').trim()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const entries = []
  const logs = []
  for (const group of groups.values()) {
    const watchDate = (r) => letterboxdDate(r['Watched Date']) ?? letterboxdDate(r['Date'])
    group.sort((a, b) => (watchDate(a) ?? '').localeCompare(watchDate(b) ?? ''))
    const [first, ...later] = group

    const title   = first['Name'].trim()
    const year    = (first['Year'] || '').trim()
    const rewatch = (first['Rewatch'] || '').trim().toLowerCase() === 'yes'
    const tags    = (first['Tags'] || '').trim()
    const noteParts = []
    if (year) noteParts.push(`(${year})`)
    if (rewatch) noteParts.push('Rewatch')
    if (tags) noteParts.push(`Tags: ${tags}`)
    const logDate = letterboxdDate(first['Date'])

    const id = later.length ? nextId() : undefined
    entries.push({
      category:   'movie',
      title,
      status:     'completed',
      rating:     stars(first['Rating']),
      notes:      noteParts.join(' — '),
      date_read:  watchDate(first),
      created_at: logDate ? `${logDate} 00:00:00` : undefined,
      year:       yearOf(year),
      id,
    })
    for (const r of later) {
      logs.push({
        entry_id: id,
        date:     watchDate(r),
        rating:   stars(r['Rating']),
        notes:    (r['Tags'] || '').trim() ? `Tags: ${r['Tags'].trim()}` : '',
      })
    }
  }
  return { entries, logs }
}

function mapSimple(rows, kind) {
  const entries = []
  for (const row of rows) {
    const title = (row['Name'] || '').trim()
    if (!title) continue
    const added = letterboxdDate(row['Date'])
    entries.push({
      category:   'movie',
      title,
      status:     kind === 'watchlist' ? 'planned' : 'completed',
      rating:     kind === 'ratings' ? stars(row['Rating']) : null,
      notes:      '',
      date_read:  null,
      created_at: added ? `${added} 00:00:00` : undefined,
      year:       yearOf(row['Year']),
    })
  }
  return { entries, logs: [] }
}

// One file. `kind` defaults to diary (the original single-file behaviour).
function mapLetterboxd(csvText, { kind = 'diary' } = {}) {
  return mapLetterboxdFiles([{ text: csvText, kind }])
}

// Several files from one export, merged into a single import payload.
function mapLetterboxdFiles(files) {
  let n = 0
  const nextId = () => ++n
  const ordered = [...files].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
  const entries = []
  const logs = []
  for (const f of ordered) {
    const rows = parseCsv(f.text)
    if (f.kind === 'reviews') { attachReviews(rows, entries); continue }
    const part = f.kind === 'diary' ? mapDiary(rows, nextId) : mapSimple(rows, f.kind)
    entries.push(...part.entries)
    logs.push(...part.logs)
  }
  return { format: 'chronicle-export', version: 1, entries, series: [], logs }
}

// reviews.csv runs last (KIND_ORDER), so every other file's entries exist.
function attachReviews(rows, entries) {
  const key = (title, year) => `${String(title).trim().toLowerCase()}|${year ?? ''}`
  const byKey = new Map()
  for (const e of entries) if (!byKey.has(key(e.title, e.year))) byKey.set(key(e.title, e.year), e)
  const dated = rows
    .filter(r => (r['Name'] || '').trim() && (r['Review'] || '').trim())
    .sort((a, b) => (letterboxdDate(a['Date']) ?? '').localeCompare(letterboxdDate(b['Date']) ?? ''))
  for (const row of dated) {
    const title = row['Name'].trim()
    const year  = yearOf(row['Year'])
    const review = row['Review'].trim()
    const existing = byKey.get(key(title, year))
    if (existing) { existing.review = review; continue }
    const watched = letterboxdDate(row['Watched Date'])
    const added   = letterboxdDate(row['Date'])
    const entry = {
      category:   'movie',
      title,
      status:     'completed',
      rating:     stars(row['Rating']),
      notes:      '',
      review,
      date_read:  watched,
      created_at: added ? `${added} 00:00:00` : undefined,
      year,
    }
    entries.push(entry)
    byKey.set(key(title, year), entry)
  }
}

module.exports = { mapLetterboxd, mapLetterboxdFiles, letterboxdDate, letterboxdKind }
