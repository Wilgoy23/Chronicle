// StoryGraph CSV export (Manage Account → Export StoryGraph Library) → the
// shape importData() (electron/db.js) accepts.
//
// Column reference (documented export header, not yet verified against a
// live download — same caveat as the Goodreads/MAL/Letterboxd slices):
// Title, Authors, Contributors, ISBN/UID, Format, Read Status, Date Added,
// Last Date Read, Dates Read, Read Count, Moods, Pace, …, Star Rating, Review,
// Content Warnings, Content Warning Description, Tags, Owned?
// Columns are looked up case-insensitively so small header drift still maps.
//
// Read Status → status: read → completed, currently-reading/paused →
// in_progress, to-read → planned, did-not-finish → completed (kept, like
// MAL's Dropped). Star Rating is 0–5 in quarter steps → doubled and rounded
// onto Chronicle's 1–10 scale. Read Count > 1 adds undated re-read logs.
const { parseCsv } = require('../csv')

const STATUS_MAP = {
  'read':              'completed',
  'currently-reading': 'in_progress',
  'paused':            'in_progress',
  'to-read':           'planned',
  'did-not-finish':    'completed',
}

// "2023/05/12" or "2023-05-12" → "2023-05-12"; anything else → null.
function storygraphDate(raw) {
  const m = String(raw ?? '').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}

function picker(row) {
  const keys = new Map(Object.keys(row).map(k => [k.trim().toLowerCase(), k]))
  return (...names) => {
    for (const n of names) {
      const k = keys.get(n.toLowerCase())
      if (k != null && String(row[k]).trim() !== '') return String(row[k]).trim()
    }
    return ''
  }
}

function mapStoryGraph(csvText) {
  const entries = []
  const logs = []
  let nextId = 1

  for (const row of parseCsv(csvText)) {
    const get = picker(row)
    const title = get('Title')
    if (!title) continue

    const statusKey = get('Read Status').toLowerCase().replace(/\s+/g, '-')
    const status = STATUS_MAP[statusKey] ?? 'completed'

    const stars = parseFloat(get('Star Rating'))
    const rating = Number.isFinite(stars) && stars > 0 ? Math.max(1, Math.round(stars * 2)) : null

    const authors = get('Authors', 'Author')
    const review  = get('Review')
    const notes   = [authors && `By ${authors}`, review].filter(Boolean).join('\n\n')

    const added = storygraphDate(get('Date Added'))
    const lastRead = storygraphDate(get('Last Date Read'))
    const readCount = parseInt(get('Read Count'), 10)
    const id = nextId++

    entries.push({
      id,
      category:   'book',
      title,
      status,
      rating,
      notes,
      genres:     get('Tags') || null,
      date_read:  status === 'completed' ? lastRead : null,
      created_at: added ? `${added} 00:00:00` : undefined,
    })

    if (Number.isFinite(readCount) && readCount > 1) {
      for (let i = 1; i < readCount; i++) {
        logs.push({ entry_id: id, date: null, rating: null, notes: 'Imported re-read' })
      }
    }
  }

  return { format: 'chronicle-export', version: 1, entries, series: [], logs }
}

module.exports = { mapStoryGraph, storygraphDate }
