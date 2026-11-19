// Release calendar (8.2): dated events from two sources, plus an iCalendar
// (.ics) serializer so they can be put into Google / Apple / Outlook calendars.
//
//   - releases: franchise installments the release checker detected (sequels,
//     new seasons, next books in a series), including ones already added;
//   - episodes: air dates for TV / anime you're watching or plan to, from the
//     same episode lists the edit panel's grid uses (cached for 12 hours).
//
// Event shape:
//   { uid, kind: 'release' | 'episode', date: 'YYYY-MM-DD', category, title,
//     detail, cover_url, entry_id, release_id, status }

const { getEpisodes, supportsEpisodes } = require('./episodes')

// Uncached episode lookups are network calls; bound how many shows one
// calendar load can fan out to, and how many run at once.
const MAX_SHOWS = 60
const CONCURRENCY = 4
const EPISODE_STATUSES = new Set(['in_progress', 'planned'])

const CATEGORY_LABELS = {
  book: 'Books', anime: 'Anime', manga: 'Manga', movie: 'Movies', tv: 'TV Shows', game: 'Games',
}

const DAY_MS = 86400000
const ymd = (d) => d.toISOString().slice(0, 10)
function addDays(dateYmd, n) {
  return ymd(new Date(Date.parse(`${dateYmd}T00:00:00Z`) + n * DAY_MS))
}
const inRange = (date, from, to) => !!date && (!from || date >= from) && (!to || date <= to)

// ── Event builders (pure) ────────────────────────────────────────

function releaseEvents(releases, from, to) {
  return releases
    .filter(r => inRange(r.release_date, from, to))
    .map(r => ({
      uid:        `release-${r.source}-${r.source_id}`,
      kind:       'release',
      date:       r.release_date.slice(0, 10),
      category:   r.category,
      title:      r.title,
      detail:     [r.relation, r.origin_title ? `via ${r.origin_title}` : null].filter(Boolean).join(' · '),
      cover_url:  r.cover_url ?? null,
      entry_id:   r.entry_id ?? null,
      release_id: r.id,
      status:     r.status,
      // Enough for the page's "Add to planned" to create the entry.
      source:     r.source,
      source_id:  r.source_id,
    }))
}

function epCode(e) {
  return e.season != null ? `S${e.season}E${e.number}` : `Episode ${e.number}`
}

// "S2E5", "S2E1–E8", "Episodes 3–4", or "S1E10 – S2E1" for a same-day span.
function episodeSpan(eps) {
  if (eps.length === 1) {
    const e = eps[0]
    return e.title ? `${epCode(e)} · ${e.title}` : epCode(e)
  }
  const first = eps[0], last = eps[eps.length - 1]
  if (first.season === last.season) {
    return first.season != null
      ? `S${first.season}E${first.number}–E${last.number}`
      : `Episodes ${first.number}–${last.number}`
  }
  return `${epCode(first)} – ${epCode(last)}`
}

// One event per show per day: a season dropped all at once is a single
// "S2E1–E8" entry rather than eight identical ones.
function episodeEvents(entry, result, from, to) {
  if (!Array.isArray(result?.episodes)) return []
  const byDate = new Map()
  for (const ep of result.episodes) {
    if (!inRange(ep.air_date, from, to)) continue
    if (!byDate.has(ep.air_date)) byDate.set(ep.air_date, [])
    byDate.get(ep.air_date).push(ep)
  }
  return [...byDate.entries()].map(([date, eps]) => ({
    uid:        `episode-${entry.source}-${entry.source_id}-${date}`,
    kind:       'episode',
    date,
    category:   entry.category,
    title:      entry.title,
    detail:     episodeSpan(eps),
    cover_url:  entry.cover_url ?? null,
    entry_id:   entry.id,
    release_id: null,
    status:     entry.status,
    count:      eps.length,
  }))
}

function sortEvents(events) {
  return events.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    (a.kind === b.kind ? 0 : a.kind === 'release' ? -1 : 1) ||
    a.title.localeCompare(b.title))
}

// Which library entries to fetch episode schedules for: shows you're
// watching first (most recently touched first), then ones you plan to.
function episodeCandidates(entries, max = MAX_SHOWS) {
  const rank = (e) => (e.status === 'in_progress' ? 0 : 1)
  return entries
    .filter(e => EPISODE_STATUSES.has(e.status) && supportsEpisodes(e))
    .sort((a, b) => rank(a) - rank(b) || (b.last_activity ?? '').localeCompare(a.last_activity ?? ''))
    .slice(0, max)
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      try { out[idx] = await fn(items[idx]) } catch { out[idx] = null }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * Gather events between `from` and `to` (inclusive, YYYY-MM-DD).
 * `episodes: false` skips the network-bound episode lookups so the page can
 * paint releases first.
 */
async function collectCalendar({ from, to, episodes = true } = {}, deps) {
  const { getCalendarReleases, getEntries, cacheGet, cacheSet, settings } = deps
  const fetchEpisodes = deps.getEpisodes ?? getEpisodes
  const events = releaseEvents(getCalendarReleases(), from, to)

  if (episodes) {
    const shows = episodeCandidates(getEntries())
    const results = await mapLimit(shows, CONCURRENCY, (e) =>
      fetchEpisodes(e, settings, { get: cacheGet, set: cacheSet }))
    shows.forEach((show, i) => events.push(...episodeEvents(show, results[i], from, to)))
  }
  return sortEvents(events)
}

// ── iCalendar (RFC 5545) ─────────────────────────────────────────

function icsEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([;,])/g, '\\$1')
}

// Lines are limited to 75 octets; continuations start with one space.
function foldLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line
  const parts = []
  let cur = '', len = 0
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8')
    if (len + n > 75) { parts.push(cur); cur = ' '; len = 1 }
    cur += ch
    len += n
  }
  parts.push(cur)
  return parts.join('\r\n')
}

const icsDate  = (dateYmd) => dateYmd.replace(/-/g, '')
const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function eventSummary(ev) {
  if (ev.kind === 'episode') return `${ev.title}: ${ev.detail.split(' · ')[0]}`
  return ev.title
}

function eventDescription(ev) {
  const cat = CATEGORY_LABELS[ev.category] ?? ev.category
  if (ev.kind === 'episode') return [ev.detail, cat].filter(Boolean).join('\n')
  return [`New release${ev.detail ? ` · ${ev.detail}` : ''}`, cat].join('\n')
}

function toIcs(events, { now = new Date(), name = 'Chronicle' } = {}) {
  const stamp = icsStamp(now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chronicle//Release calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
    'X-WR-CALDESC:Releases and episode air dates from your Chronicle library',
    // Hints for subscribed calendars; Google ignores them and polls on its own schedule.
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ]
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}@chronicle.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(ev.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(ev.date, 1))}`,
      `SUMMARY:${icsEscape(eventSummary(ev))}`,
      `DESCRIPTION:${icsEscape(eventDescription(ev))}`,
      `CATEGORIES:${icsEscape(CATEGORY_LABELS[ev.category] ?? ev.category)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

// The window an exported / synced .ics covers: last month through next year.
function icsWindow(now = new Date()) {
  const today = ymd(now)
  return { from: addDays(today, -30), to: addDays(today, 365) }
}

module.exports = {
  collectCalendar, releaseEvents, episodeEvents, episodeCandidates, sortEvents,
  toIcs, icsEscape, foldLine, icsWindow, addDays, MAX_SHOWS,
}
