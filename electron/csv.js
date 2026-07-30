// Pure CSV serialization for entry export — no Electron/DB deps, so it's unit-testable.

const CSV_COLUMNS = [
  'id', 'category', 'title', 'series', 'status', 'rating',
  'progress', 'progress_total', 'date_read', 'notes', 'description',
  'cover_url', 'source', 'source_id', 'created_at',
]

function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(entries, columns = CSV_COLUMNS) {
  const rows = entries.map(e => columns.map(c => csvCell(e[c])).join(','))
  return [columns.join(','), ...rows].join('\r\n')
}

// RFC4180-ish CSV parser (handles quoted fields, embedded commas/newlines, and
// "" as an escaped quote) — used to read third-party exports (Goodreads, etc.)
// for the importers in electron/importers/. Returns an array of row objects
// keyed by the header row; blank trailing lines are skipped.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  const pushField = () => { row.push(field); field = '' }
  const pushRow    = () => { pushField(); rows.push(row); row = [] }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      pushField()
    } else if (c === '\r') {
      // swallow; \n (bare or following \r) ends the row
    } else if (c === '\n') {
      pushRow()
    } else {
      field += c
    }
  }
  // Final field/row if the file doesn't end with a newline.
  if (field !== '' || row.length) pushRow()

  if (rows.length === 0) return []
  const header = rows[0]
  return rows.slice(1)
    .filter(r => !(r.length === 1 && r[0] === ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

module.exports = { CSV_COLUMNS, csvCell, toCsv, parseCsv }
