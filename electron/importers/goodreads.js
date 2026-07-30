// Goodreads "My Books" CSV export -> the shape importData() (electron/db.js)
// already accepts, so the existing merge/dedupe logic is reused unchanged.
// Column reference (Goodreads export header row): Title, Author, My Rating
// (0-5 stars, 0 = unrated), Date Read, Date Added, Exclusive Shelf.
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

function mapGoodreads(csvText) {
  const entries = []

  for (const row of parseCsv(csvText)) {
    const title = (row['Title'] || '').trim()
    if (!title) continue

    const shelf  = (row['Exclusive Shelf'] || '').trim().toLowerCase()
    const status = SHELF_STATUS[shelf] ?? 'completed'

    const stars  = parseInt(row['My Rating'], 10)
    const rating = Number.isFinite(stars) && stars > 0 ? stars * 2 : null

    const author  = (row['Author'] || '').trim()
    const dateAdd = goodreadsDate(row['Date Added'])

    entries.push({
      category:   'book',
      title,
      status,
      rating,
      notes:      author ? `By ${author}` : '',
      date_read:  goodreadsDate(row['Date Read']),
      created_at: dateAdd ? `${dateAdd} 00:00:00` : undefined,
    })
  }

  return { format: 'chronicle-export', version: 1, entries, series: [] }
}

module.exports = { mapGoodreads, goodreadsDate }
