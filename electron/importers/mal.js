// MyAnimeList XML export (Account Settings > Import/Export > Export, or
// https://myanimelist.net/panel.php?go=export) -> the shape importData()
// (electron/db.js) already accepts. MAL's export is a flat schema — a
// <myanimelist> root containing repeated, non-nested <anime> or <manga>
// blocks, each with simple text-content child tags (sometimes CDATA-wrapped)
// — so a small purpose-built extractor is used here instead of a general XML
// parser, mirroring electron/csv.js's hand-rolled parseCsv for Goodreads.
//
// Status mapping note: MAL has 5 list statuses; Chronicle only has 3
// (completed / in_progress / planned). Watching/Reading and On-Hold both map
// to in_progress (an on-hold title still has episodes/chapters logged and is
// nominally "in progress", just paused); Dropped maps to completed rather
// than being discarded, so the entry and its rating/comments are preserved
// instead of silently lost on import — the alternative (skipping dropped
// entries) would lose data the user may still want tracked.
const STATUS_MAP = {
  watching:    'in_progress',
  reading:     'in_progress',
  onhold:      'in_progress',
  completed:   'completed',
  dropped:     'completed',
  plantowatch: 'planned',
  plantoread:  'planned',
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// Text content of <tag>...</tag> within a block, unwrapping CDATA if present.
function field(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  if (!m) return ''
  const raw = m[1].trim()
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
  return decodeXmlEntities(cdata ? cdata[1] : raw)
}

// MAL leaves unset dates as the literal string "0000-00-00" rather than blank.
function malDate(raw) {
  const t = (raw || '').trim()
  return t && t !== '0000-00-00' ? t : null
}

// MAL's own status strings have varied in exact spelling/casing across export
// versions ("On-Hold" vs "On Hold" vs "on_hold") — normalize away
// spaces/hyphens/underscores and case so any variant matches.
function normalizeStatus(raw) {
  const key = (raw || '').toLowerCase().replace(/[\s_-]+/g, '')
  return STATUS_MAP[key] ?? 'planned'
}

function extractBlocks(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  return [...xml.matchAll(re)].map(m => m[1])
}

function mapBlocks(xml, tag, category, episodeField, totalField) {
  return extractBlocks(xml, tag).map(block => {
    const title = field(block, 'series_title')
    if (!title) return null

    const status = normalizeStatus(field(block, 'my_status'))
    const score  = parseInt(field(block, 'my_score'), 10)
    const rating = Number.isFinite(score) && score > 0 ? score : null
    const watched = parseInt(field(block, episodeField), 10) || 0
    const total    = parseInt(field(block, totalField), 10) || 0

    return {
      category,
      title,
      status,
      rating,
      notes:          field(block, 'my_comments'),
      date_read:      status === 'completed' ? malDate(field(block, 'my_finish_date')) : null,
      progress:       watched,
      progress_total: total || null,
    }
  }).filter(Boolean)
}

function mapMal(xmlText) {
  const entries = [
    ...mapBlocks(xmlText, 'anime', 'anime', 'my_watched_episodes', 'series_episodes'),
    ...mapBlocks(xmlText, 'manga', 'manga', 'my_read_chapters',    'series_chapters'),
  ]
  return { format: 'chronicle-export', version: 1, entries, series: [] }
}

module.exports = { mapMal, malDate, normalizeStatus }
