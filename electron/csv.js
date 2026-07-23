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

module.exports = { CSV_COLUMNS, csvCell, toCsv }
