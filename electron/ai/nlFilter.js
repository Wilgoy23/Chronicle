// Heuristic natural-language query parser. Turns free text like
// "highly rated anime I watched last year about revenge" into a structured
// filter plus a residual semantic-search phrase — entirely offline, no LLM.
// When Ollama is configured the service asks it first and falls back here,
// so this parser is the guaranteed baseline for every install.

// Synonyms for the built-in categories; custom categories match by label.
const CATEGORY_WORDS = {
  book:  ['book', 'books', 'novel', 'novels'],
  anime: ['anime'],
  manga: ['manga'],
  movie: ['movie', 'movies', 'film', 'films'],
  tv:    ['tv', 'tv show', 'tv shows', 'show', 'shows', 'tv series'],
  game:  ['game', 'games', 'videogame', 'videogames', 'video game', 'video games'],
}

const CONSUME_VERBS = /\b(watch(ed|ing)?|read(ing)?|play(ed|ing)?|finish(ed)?|complet(ed|ing)|logg?ed|added)\b/

// Filler that adds nothing to a semantic query once filters are extracted.
const STOPWORDS = new Set([
  'show', 'me', 'find', 'all', 'my', 'the', 'a', 'an', 'i', 'ive', "i've",
  'that', 'which', 'with', 'of', 'in', 'on', 'from', 'and', 'or', 'to',
  'was', 'were', 'is', 'are', 'have', 'has', 'had', 'something', 'anything',
  'stuff', 'things', 'list', 'give', 'items', 'entries', 'about', 'like',
  'rated', 'rating', 'year', 'last', 'this',
  // consumption verbs are filter signals, not search terms
  'watch', 'watched', 'watching', 'read', 'reading', 'play', 'played', 'playing',
])

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Parse a query into { filter, matchedText }. `categories` is the visible
// category list [{id, label}], `genres` the library's known genre vocabulary.
function parseQuery(query, { categories = [], genres = [], now = new Date() } = {}) {
  let q = ` ${String(query).toLowerCase().trim()} `
  const filter = {
    category:  null,
    status:    null,
    ratingMin: null,
    ratingMax: null,
    unrated:   false,
    yearMin:   null,   // release year (entries.year)
    yearMax:   null,
    dateYearMin: null, // consumption year (date_read / created_at)
    dateYearMax: null,
    genres:    [],
    text:      '',
  }

  // Remember, then blank out, every phrase we consumed so the residual text
  // that goes to semantic search is only the unexplained part of the query.
  function consume(re, handler) {
    q = q.replace(re, (...args) => {
      const groups = args.slice(1, -2)
      if (handler) handler(...groups, args[0])
      return ' '
    })
  }

  const hasConsumeVerb = CONSUME_VERBS.test(q)

  // ── Category ───────────────────────────────────────────────────
  for (const cat of categories) {
    const words = CATEGORY_WORDS[cat.id] ?? [cat.label.toLowerCase()]
    // Longest synonym first so "tv shows" wins over "shows".
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\b${escapeRe(w)}\\b`)
      if (re.test(q) && !filter.category) {
        filter.category = cat.id
        consume(new RegExp(`\\b${escapeRe(w)}\\b`, 'g'))
      }
    }
  }

  // ── Status ─────────────────────────────────────────────────────
  consume(/\b(?:in.progress|currently\s+(?:reading|watching|playing)|still\s+(?:reading|watching|playing))\b/g,
    () => { filter.status = 'in_progress' })
  consume(/\b(?:planned|plan\s+to\s+\w+|backlog|wishlist|want\s+to\s+\w+|to.read|to.watch|to.play)\b/g,
    () => { if (!filter.status) filter.status = 'planned' })
  consume(/\b(?:completed|finished|done\s+with)\b/g,
    () => { if (!filter.status) filter.status = 'completed' })

  // ── Rating ─────────────────────────────────────────────────────
  consume(/\b(?:unrated|not\s+rated|no\s+rating|without\s+a?\s*rating)\b/g,
    () => { filter.unrated = true })
  // "8+", "8 or higher", "rated 8 and up" (no \b after "+" — it's a non-word char)
  consume(/\b(?:rated\s+)?(10|[1-9])\s*(?:\+|or\s+(?:higher|better|above|more)\b|and\s+up\b)/g,
    n => { filter.ratingMin = Number(n) })
  // "at least 7", "over 7", "above 7", "more than 7", ">= 7"
  consume(/\b(?:at\s+least|minimum|min|>=)\s*(10|[1-9])\b/g,
    n => { filter.ratingMin = Number(n) })
  consume(/\b(?:over|above|more\s+than|better\s+than|>)\s*(10|[1-9])\b/g,
    n => { filter.ratingMin = Math.min(10, Number(n) + 1) })
  // "under 5", "below 5", "at most 5", "less than 5"
  consume(/\b(?:at\s+most|maximum|max|<=)\s*(10|[1-9])\b/g,
    n => { filter.ratingMax = Number(n) })
  consume(/\b(?:under|below|less\s+than|worse\s+than|<)\s*(10|[1-9])\b/g,
    n => { filter.ratingMax = Math.max(1, Number(n) - 1) })
  // "rated 8", "8/10" — exact
  consume(/\b(?:rated\s+)(10|[1-9])\b/g,
    n => { filter.ratingMin = Number(n); filter.ratingMax = Number(n) })
  consume(/\b(10|[1-9])\s*\/\s*10\b/g,
    n => { filter.ratingMin = Number(n); filter.ratingMax = Number(n) })
  // "5 stars" — star scales are 1–5, ratings here are 1–10.
  consume(/\b([1-5])\s*stars?\b/g,
    n => { filter.ratingMin = Number(n) * 2 })
  // Sentiment shortcuts
  consume(/\b(?:favou?rites?|best|top.rated|highly.rated|loved|amazing)\b/g,
    () => { if (filter.ratingMin == null) filter.ratingMin = 8 })
  consume(/\b(?:worst|hated|low.rated|terrible|bad)\b/g,
    () => { if (filter.ratingMax == null) filter.ratingMax = 4 })

  // ── Years ──────────────────────────────────────────────────────
  const thisYear = now.getFullYear()
  const setYearRange = (min, max, isDate) => {
    if (isDate) { filter.dateYearMin = min; filter.dateYearMax = max }
    else        { filter.yearMin = min;     filter.yearMax = max }
  }
  consume(/\blast\s+year\b/g,  () => setYearRange(thisYear - 1, thisYear - 1, true))
  consume(/\bthis\s+year\b/g,  () => setYearRange(thisYear, thisYear, true))
  // Decades: "90s", "1990s", "2000s"
  consume(/\b(?:the\s+)?(19|20)?(\d)0s\b/g, (century, decade) => {
    const base = century ? Number(`${century}${decade}0`) : (Number(decade) >= 3 ? 1900 + Number(`${decade}0`) : 2000 + Number(`${decade}0`))
    setYearRange(base, base + 9, false)
  })
  // "between 2010 and 2015", "2010-2015"
  consume(/\b(?:between\s+)?((?:19|20)\d{2})\s*(?:-|–|to|and)\s*((?:19|20)\d{2})\b/g,
    (a, b) => setYearRange(Number(a), Number(b), hasConsumeVerb))
  // "released in 2019", "from 2019" — release year regardless of verbs
  consume(/\b(?:released\s+(?:in\s+)?|from\s+)((?:19|20)\d{2})\b/g,
    y => setYearRange(Number(y), Number(y), false))
  // Bare year: consumption year when the query has a watched/read/played verb,
  // release year otherwise ("movies 2019" ≈ released 2019).
  consume(/\b(?:in\s+)?((?:19|20)\d{2})\b/g,
    y => setYearRange(Number(y), Number(y), hasConsumeVerb))

  // ── Genres ─────────────────────────────────────────────────────
  const seen = new Set()
  for (const g of [...genres].sort((a, b) => b.length - a.length)) {
    const trimmed = String(g).trim()
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue
    const re = new RegExp(`\\b${escapeRe(trimmed.toLowerCase())}\\b`)
    if (re.test(q)) {
      seen.add(trimmed.toLowerCase())
      filter.genres.push(trimmed)
      consume(new RegExp(`\\b${escapeRe(trimmed.toLowerCase())}\\b`, 'g'))
    }
  }

  // ── Residual text → semantic query ─────────────────────────────
  const residual = q
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w))
    .join(' ')
    .trim()
  filter.text = residual.length >= 3 ? residual : ''

  return filter
}

// Whitelist/clamp a filter that came from an LLM into one we trust: unknown
// categories, statuses and genres are dropped, numbers are coerced into range.
// Bounds sitting at the edge of the 1–10 scale are treated as absent — they
// exclude nothing by value, but a non-null bound also drops *unrated* entries
// (see applyFilter), so keeping them would silently hide part of the library.
function sanitizeFilter(raw, { categories = [], genres = [] } = {}) {
  if (!raw || typeof raw !== 'object') return null
  const catIds = new Set(categories.map(c => c.id))
  const genreSet = new Map(genres.map(g => [String(g).toLowerCase(), g]))
  const int = (v, lo, hi) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : null
  }
  const ratingMin = int(raw.ratingMin, 1, 10)
  const ratingMax = int(raw.ratingMax, 1, 10)
  return {
    category:  catIds.has(raw.category) ? raw.category : null,
    status:    ['completed', 'in_progress', 'planned'].includes(raw.status) ? raw.status : null,
    ratingMin: ratingMin === 1  ? null : ratingMin,
    ratingMax: ratingMax === 10 ? null : ratingMax,
    unrated:   raw.unrated === true,
    yearMin:     int(raw.yearMin, 1000, 3000),
    yearMax:     int(raw.yearMax, 1000, 3000),
    dateYearMin: int(raw.dateYearMin, 1000, 3000),
    dateYearMax: int(raw.dateYearMax, 1000, 3000),
    genres: Array.isArray(raw.genres)
      ? raw.genres.map(g => genreSet.get(String(g).toLowerCase())).filter(Boolean)
      : [],
    text: typeof raw.text === 'string' ? raw.text.slice(0, 200) : '',
  }
}

// Apply a parsed filter to entry rows (as returned by db.getEntries()).
function applyFilter(entries, filter) {
  return entries.filter(e => {
    if (filter.category && e.category !== filter.category) return false
    if (filter.status && e.status !== filter.status) return false
    if (filter.unrated) {
      if (e.rating != null) return false
    } else {
      if (filter.ratingMin != null && (e.rating == null || e.rating < filter.ratingMin)) return false
      if (filter.ratingMax != null && (e.rating == null || e.rating > filter.ratingMax)) return false
    }
    if (filter.yearMin != null && (e.year == null || e.year < filter.yearMin)) return false
    if (filter.yearMax != null && (e.year == null || e.year > filter.yearMax)) return false
    if (filter.dateYearMin != null || filter.dateYearMax != null) {
      const d = e.date_read || e.created_at || ''
      const y = Number(d.slice(0, 4))
      if (!y) return false
      if (filter.dateYearMin != null && y < filter.dateYearMin) return false
      if (filter.dateYearMax != null && y > filter.dateYearMax) return false
    }
    if (filter.genres.length) {
      const have = (e.genres || '').toLowerCase().split(',').map(t => t.trim())
      if (!filter.genres.every(g => have.includes(g.toLowerCase()))) return false
    }
    return true
  })
}

// Human-readable chips for the UI, e.g. ["anime", "rating ≥ 8", "watched in 2023"].
function describeFilter(filter, categories = []) {
  const chips = []
  if (filter.category) {
    const cat = categories.find(c => c.id === filter.category)
    chips.push(cat?.label ?? filter.category)
  }
  if (filter.status) chips.push({ completed: 'Completed', in_progress: 'In Progress', planned: 'Planned' }[filter.status] ?? filter.status)
  if (filter.unrated) chips.push('unrated')
  else if (filter.ratingMin != null && filter.ratingMin === filter.ratingMax) chips.push(`rated ${filter.ratingMin}`)
  else {
    if (filter.ratingMin != null) chips.push(`rating ≥ ${filter.ratingMin}`)
    if (filter.ratingMax != null) chips.push(`rating ≤ ${filter.ratingMax}`)
  }
  if (filter.yearMin != null) {
    chips.push(filter.yearMin === filter.yearMax ? `released ${filter.yearMin}` : `released ${filter.yearMin}–${filter.yearMax ?? '…'}`)
  }
  if (filter.dateYearMin != null) {
    chips.push(filter.dateYearMin === filter.dateYearMax ? `logged ${filter.dateYearMin}` : `logged ${filter.dateYearMin}–${filter.dateYearMax ?? '…'}`)
  }
  for (const g of filter.genres) chips.push(`#${g}`)
  if (filter.text) chips.push(`“${filter.text}”`)
  return chips
}

module.exports = { parseQuery, sanitizeFilter, applyFilter, describeFilter, CATEGORY_WORDS }
