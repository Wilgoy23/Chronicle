// Letterboxd "Export Data" zip -> the shape importData() (electron/db.js)
// already accepts, so the existing merge/dedupe logic is reused unchanged.
// Letterboxd's export is a zip containing several CSVs (diary/ratings/watched/
// watchlist/reviews); rather than hand-roll a zip reader, this mapper takes
// diary.csv on its own (the file the user extracts from the zip and picks),
// since it's the richest single file: every logged watch, with its rating,
// watched date, and rewatch flag in one place.
// Column reference (Letterboxd diary.csv export header row): Date, Name,
// Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date.
const { parseCsv } = require('../csv')

// Letterboxd dates are already "yyyy-MM-dd"; pass through, blank -> null.
function letterboxdDate(raw) {
  const t = (raw || '').trim()
  return t || null
}

function mapLetterboxd(csvText) {
  const entries = []

  for (const row of parseCsv(csvText)) {
    const title = (row['Name'] || '').trim()
    if (!title) continue

    // Letterboxd's diary is a watch log: every row is a watched film.
    const status = 'completed'

    // Letterboxd rates in 0.5-star increments on a 0.5-5 scale; blank = unrated.
    const stars  = parseFloat(row['Rating'])
    const rating = Number.isFinite(stars) && stars > 0 ? Math.round(stars * 2) : null

    const year    = (row['Year'] || '').trim()
    const rewatch = (row['Rewatch'] || '').trim().toLowerCase() === 'yes'
    const tags    = (row['Tags'] || '').trim()

    const noteParts = []
    if (year) noteParts.push(`(${year})`)
    if (rewatch) noteParts.push('Rewatch')
    if (tags) noteParts.push(`Tags: ${tags}`)

    const logDate = letterboxdDate(row['Date'])

    entries.push({
      category:   'movie',
      title,
      status,
      rating,
      notes:      noteParts.join(' — '),
      date_read:  letterboxdDate(row['Watched Date']) ?? logDate,
      created_at: logDate ? `${logDate} 00:00:00` : undefined,
    })
  }

  return { format: 'chronicle-export', version: 1, entries, series: [] }
}

module.exports = { mapLetterboxd, letterboxdDate }
