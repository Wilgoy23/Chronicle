// Goodreads "My Books" CSV export -> the shape importData() (electron/db.js)
// already accepts, so the existing merge/dedupe logic is reused unchanged.
// Column reference (Goodreads export header row): Title, Author, My Rating
// (0-5 stars, 0 = unrated), Date Read, Date Added, Exclusive Shelf, My Review,
// Spoiler, Private Notes, Binding, Owned Copies.
const { parseCsv } = require('../csv')

const SHELF_STATUS = {
  read:                'completed',
  'currently-reading': 'in_progress',
  'to-read':           'planned',
}

// Goodreads dates are "yyyy/MM/dd"; Chronicle stores "yyyy-MM-dd".
function goodreadsDate(raw) {
  const t = (raw || '').trim()
  const m = t.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// Goodreads appends series info to titles: "The Way of Kings (The Stormlight
// Archive, #1)" → { title: 'The Way of Kings', series: 'The Stormlight Archive' }.
function splitSeriesTitle(raw) {
  const m = String(raw ?? '').trim().match(/^(.*\S)\s+\(([^()]+?),?\s+#[\d.]+(?:-[\d.]+)?\)$/)
  return m ? { title: m[1], series: m[2].trim() } : { title: String(raw ?? '').trim(), series: null }
}

// Goodreads "Binding" → Chronicle format. Unknown bindings stay unset.
function bindingFormat(raw) {
  const b = String(raw ?? '').trim().toLowerCase()
  if (!b) return null
  if (/audio|mp3|audible/.test(b)) return 'audiobook'
  if (/kindle|ebook|e-book|nook|epub|digital/.test(b)) return 'ebook'
  if (/paperback|hardcover|hardback|mass market|board book|library binding|leather|spiral|chapbook|comic/.test(b)) return 'physical'
  return null
}

const intOrNull = (v) => {
  const n = parseInt(String(v ?? '').trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function mapGoodreads(csvText) {
  const entries = []
  const logs = []
  const series = new Set()
  let nextId = 1

  for (const row of parseCsv(csvText)) {
    const { title, series: seriesName } = splitSeriesTitle(row['Title'])
    if (!title) continue

    const shelf  = (row['Exclusive Shelf'] || '').trim().toLowerCase()
    const status = SHELF_STATUS[shelf] ?? 'completed'

    const stars  = parseInt(row['My Rating'], 10)
    const rating = Number.isFinite(stars) && stars > 0 ? stars * 2 : null

    const author  = (row['Author'] || '').trim()
    const review  = (row['My Review'] || '').trim()
    const privateNotes = (row['Private Notes'] || '').trim()
    const dateAdd = goodreadsDate(row['Date Added'])

    // Personal shelves (minus the three status shelves) become tags.
    const shelves = (row['Bookshelves'] || '').split(',').map(s => s.trim())
      .filter(s => s && !Object.hasOwn(SHELF_STATUS, s.toLowerCase()))
    const readCount = intOrNull(row['Read Count'])
    const needsId = readCount > 1

    const entry = {
      category:   'book',
      title,
      status,
      rating,
      notes:      [author && `By ${author}`, privateNotes].filter(Boolean).join('\n\n'),
      review:     review || undefined,
      review_spoilers: review && /^true$/i.test((row['Spoiler'] || '').trim()) ? 1 : undefined,
      format:     bindingFormat(row['Binding']) ?? undefined,
      ownership:  intOrNull(row['Owned Copies']) ? 'owned' : undefined,
      date_read:  goodreadsDate(row['Date Read']),
      created_at: dateAdd ? `${dateAdd} 00:00:00` : undefined,
      series:     seriesName ?? undefined,
      year:       intOrNull(row['Original Publication Year']) ?? intOrNull(row['Year Published']) ?? undefined,
      progress_total: intOrNull(row['Number of Pages']) ?? undefined,
      genres:     shelves.length ? shelves.join(', ') : undefined,
      // An id is only needed to attach re-read logs (importData remaps it).
      id:         needsId ? nextId++ : undefined,
    }
    entries.push(entry)
    if (seriesName) series.add(seriesName)
    if (needsId) {
      for (let i = 1; i < readCount; i++) {
        logs.push({ entry_id: entry.id, date: null, rating: null, notes: 'Imported re-read' })
      }
    }
  }

  return {
    format: 'chronicle-export', version: 1, entries,
    series: [...series].map(name => ({ category: 'book', name })),
    logs,
  }
}

module.exports = { mapGoodreads, goodreadsDate, splitSeriesTitle, bindingFormat }
