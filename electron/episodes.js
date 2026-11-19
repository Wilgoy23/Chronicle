// Episode lists for TV and anime entries, for the edit panel's episode grid
// and Up Next's "next episode" line.
//
// Result shape (or { error }):
//   {
//     episodes: [{ season, number, title, air_date, aired }],   // watch order
//     next_airing: { index, season, number, air_date } | null,  // first unaired with a date
//   }
// `index` (1-based position in `episodes`) is what an entry's `progress`
// counts, so "progress = 7" means the first seven episodes in this list are
// watched — for a whole-show TV entry that spans seasons, for a season entry
// (source_id "123-s2") just that season. Specials (season 0) are left out.

const { KEYLESS_HEADERS } = require('./api')
const { effectiveKeys } = require('./keys')

const TTL_MS = 12 * 60 * 60 * 1000
const today = () => new Date().toISOString().slice(0, 10)

// "123" → { showId: '123', season: null }; "123-s2" → { showId: '123', season: 2 }
function parseTvSourceId(sourceId) {
  const m = String(sourceId ?? '').match(/^(.+?)-s(\d+)$/)
  return m ? { showId: m[1], season: Number(m[2]) } : { showId: String(sourceId), season: null }
}

function finalize(episodes) {
  const t = today()
  const list = episodes
    .filter(e => e.season == null || e.season > 0)
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.number - b.number)
    .map(e => ({ ...e, aired: e.aired ?? (!!e.air_date && e.air_date <= t) }))
  const idx = list.findIndex(e => !e.aired && e.air_date)
  return {
    episodes: list,
    next_airing: idx === -1 ? null
      : { index: idx + 1, season: list[idx].season, number: list[idx].number, air_date: list[idx].air_date },
  }
}

// ── TMDB ─────────────────────────────────────────────────────────

async function tmdbEpisodes(sourceId, tmdbKey) {
  if (!tmdbKey) return { error: 'NO_TOKEN' }
  const key = encodeURIComponent(tmdbKey)
  const { showId, season } = parseTvSourceId(sourceId)
  const base = `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}`
  const toEp = (e) => ({ season: e.season_number, number: e.episode_number, title: e.name || null, air_date: e.air_date || null })

  if (season != null) {
    const json = await fetch(`${base}/season/${season}?api_key=${key}&language=en-US`).then(r => r.json())
    if (json.status_code) return { error: json.status_message }
    return finalize((json.episodes ?? []).map(toEp))
  }

  const detail = await fetch(`${base}?api_key=${key}&language=en-US`).then(r => r.json())
  if (detail.status_code) return { error: detail.status_message }
  const seasons = (detail.seasons ?? []).map(s => s.season_number).filter(n => n > 0)
  // append_to_response takes at most 20 sub-requests per call.
  const episodes = []
  for (let i = 0; i < seasons.length; i += 20) {
    const chunk = seasons.slice(i, i + 20)
    const append = chunk.map(n => `season/${n}`).join(',')
    const json = await fetch(`${base}?api_key=${key}&language=en-US&append_to_response=${append}`).then(r => r.json())
    if (json.status_code) return { error: json.status_message }
    for (const n of chunk) episodes.push(...(json[`season/${n}`]?.episodes ?? []).map(toEp))
  }
  return finalize(episodes)
}

// ── TVmaze (keyless) ─────────────────────────────────────────────

async function tvmazeEpisodes(sourceId) {
  const { showId, season } = parseTvSourceId(sourceId)
  const res = await fetch(`https://api.tvmaze.com/shows/${encodeURIComponent(showId)}/episodes`, { headers: KEYLESS_HEADERS })
  if (!res.ok) return { error: `TVmaze returned ${res.status}` }
  const json = await res.json()
  return finalize((json ?? [])
    .filter(e => e.number != null && (season == null || e.season === season))
    .map(e => ({ season: e.season, number: e.number, title: e.name || null, air_date: e.airdate || null })))
}

// ── AniList (anime) ──────────────────────────────────────────────
// AniList has no per-episode titles; it does know the episode count and the
// next episode's air time, which is what the grid and Up Next need.

async function anilistEpisodes(mediaId) {
  const gql = `
    query ($id: Int!) {
      Media(id: $id, type: ANIME) {
        episodes status
        nextAiringEpisode { episode airingAt }
      }
    }
  `
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { id: Number(mediaId) } }),
  })
  const json = await res.json()
  if (json.errors) return { error: json.errors[0].message }
  return anilistToEpisodes(json.data?.Media)
}

function anilistToEpisodes(media) {
  if (!media) return { error: 'NOT_FOUND' }
  const next = media.nextAiringEpisode
  const count = media.episodes ?? (next ? next.episode : 0)
  const notStarted = media.status === 'NOT_YET_RELEASED'
  const episodes = []
  for (let n = 1; n <= count; n++) {
    const isNext = next && n === next.episode
    episodes.push({
      season: null,
      number: n,
      title:  null,
      air_date: isNext ? new Date(next.airingAt * 1000).toISOString().slice(0, 10) : null,
      aired:  !notStarted && (!next || n < next.episode),
    })
  }
  return finalize(episodes)
}

// ── Dispatcher (with cache) ──────────────────────────────────────

function fetchEpisodes(entry, settings) {
  const keys = effectiveKeys(settings)
  if (entry.category === 'anime' && entry.source === 'anilist') return anilistEpisodes(entry.source_id)
  if (entry.category === 'tv' && entry.source === 'tmdb')       return tmdbEpisodes(entry.source_id, keys.tmdbKey)
  if (entry.category === 'tv' && entry.source === 'tvmaze')     return tvmazeEpisodes(entry.source_id)
  return Promise.resolve({ error: 'UNSUPPORTED' })
}

function supportsEpisodes(entry) {
  return !!entry?.source_id && (
    (entry.category === 'anime' && entry.source === 'anilist') ||
    (entry.category === 'tv' && (entry.source === 'tmdb' || entry.source === 'tvmaze'))
  )
}

// `cache` is { get(key, ttl), set(key, value) } — the db's media_cache in the
// app, injectable for tests.
async function getEpisodes(entry, settings, cache, { force = false } = {}) {
  if (!supportsEpisodes(entry)) return { error: 'UNSUPPORTED' }
  const key = `episodes:${entry.source}:${entry.source_id}`
  const cached = cache?.get(key, TTL_MS)
  if (cached?.fresh && !force) return cached.value
  try {
    const res = await fetchEpisodes(entry, settings)
    if (!res.error) { cache?.set(key, res); return res }
    return cached ? cached.value : res
  } catch (err) {
    // Offline or the API is down: a stale list beats no list.
    return cached ? cached.value : { error: String(err.message ?? err) }
  }
}

module.exports = { getEpisodes, supportsEpisodes, parseTvSourceId, anilistToEpisodes, finalize }
