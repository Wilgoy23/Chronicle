// Whole-series lookup for "Add series…": given one title picked from search,
// return every installment of its series in reading/watching order so the user
// can set a status on each before anything is written to the library.
//
// Every category resolves to the same shape:
//   { seriesName, members: [Member] }  or  { error }
// Member:
//   { source_id, title, cover_url, year, release_date, position,
//     unreleased, progress_total, optional, relation }
// `optional` marks side stories / spin-offs / numbered-oddly compilations —
// listed so the user can opt in, but unchecked by default.

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const MAX_CHAIN = 30          // hard cap on AniList prequel/sequel walking
const ANILIST_GAP_MS = 350    // AniList rate-limits; walk the chain politely

const yearOf = (date) => {
  const y = parseInt(String(date ?? '').slice(0, 4), 10)
  return Number.isFinite(y) ? y : null
}

const byReleaseDate = (a, b) => {
  // Undated (usually unannounced) items sort last.
  if (!a.release_date && !b.release_date) return 0
  if (!a.release_date) return 1
  if (!b.release_date) return -1
  return a.release_date.localeCompare(b.release_date)
}

function numberPositions(members) {
  return members.map((m, i) => ({ ...m, position: m.position ?? i + 1 }))
}

function ymd({ year, month, day } = {}) {
  if (!year) return null
  return `${year}-${String(month ?? 1).padStart(2, '0')}-${String(day ?? 1).padStart(2, '0')}`
}

// ── Books (Hardcover) ────────────────────────────────────────────

async function getBookSeriesMembers(bookId, rawToken) {
  const token = (rawToken ?? '').trim().replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'NO_TOKEN' }
  const gql = `
    query ($id: Int!) {
      books(where: { id: { _eq: $id } }) {
        id
        book_series {
          position
          series {
            id
            name
            book_series {
              position
              book { id title release_date pages image { url } }
            }
          }
        }
      }
    }
  `
  try {
    const res = await fetch('https://api.hardcover.app/v1/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query: gql, variables: { id: Number(bookId) } }),
    })
    const json = await res.json()
    if (json.errors) return { error: json.errors[0].message }
    const edges = json.data?.books?.[0]?.book_series ?? []
    // A book can sit in several series (e.g. "Cosmere" and "Mistborn"); the one
    // where it has an integer position is the main reading order.
    const edge = edges.find(e => Number.isInteger(e.position)) ?? edges[0]
    if (!edge?.series) return { error: 'NOT_IN_SERIES' }

    const seen = new Set()
    const members = []
    for (const bs of edge.series.book_series ?? []) {
      const b = bs.book
      if (!b || seen.has(b.id)) continue
      seen.add(b.id)
      const pos = typeof bs.position === 'number' ? bs.position : null
      members.push({
        source_id:      b.id,
        title:          b.title ?? 'Untitled',
        cover_url:      b.image?.url ?? null,
        release_date:   b.release_date || null,
        year:           yearOf(b.release_date),
        position:       pos,
        unreleased:     !b.release_date || Date.parse(b.release_date) > Date.now(),
        progress_total: null,
        // Novellas (1.5), omnibuses and unnumbered extras are opt-in.
        optional:       pos == null || !Number.isInteger(pos),
        relation:       pos == null ? 'Unnumbered' : Number.isInteger(pos) ? null : 'Novella / extra',
      })
    }
    members.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || byReleaseDate(a, b))
    return { seriesName: edge.series.name ?? '', members }
  } catch (err) {
    return { error: String(err) }
  }
}

// ── Anime / manga (AniList) ──────────────────────────────────────

async function fetchAniListMedia(id, type) {
  const gql = `
    query ($id: Int!, $type: MediaType) {
      Media(id: $id, type: $type) {
        id type format status episodes chapters
        title { romaji english }
        coverImage { medium }
        startDate { year month day }
        relations {
          edges {
            relationType
            node {
              id type format status episodes chapters
              title { romaji english }
              coverImage { medium }
              startDate { year month day }
            }
          }
        }
      }
    }
  `
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { id: Number(id), type } }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data?.Media ?? null
}

function aniListMember(m, { optional = false, relation = null } = {}) {
  const release_date = ymd(m.startDate)
  return {
    source_id:      m.id,
    title:          m.title?.english || m.title?.romaji || 'Untitled',
    cover_url:      m.coverImage?.medium ?? null,
    release_date,
    year:           m.startDate?.year ?? null,
    position:       null,
    unreleased:     m.status === 'NOT_YET_RELEASED',
    progress_total: m.episodes ?? m.chapters ?? null,
    optional,
    relation,
  }
}

// Walks PREQUEL/SEQUEL links in both directions from the picked title to
// rebuild the whole main line; side stories/spin-offs found along the way are
// listed as optional but not walked (they'd drag in unrelated franchises).
async function getAniListSeriesMembers(mediaId, type, { gapMs = ANILIST_GAP_MS } = {}) {
  try {
    const visited = new Set()
    const queue = [Number(mediaId)]
    const main = new Map()
    const extras = new Map()

    while (queue.length && main.size < MAX_CHAIN) {
      const id = queue.shift()
      if (visited.has(id)) continue
      visited.add(id)
      if (visited.size > 1 && gapMs) await sleep(gapMs)

      const media = await fetchAniListMedia(id, type)
      if (!media) continue
      main.set(media.id, aniListMember(media))

      for (const e of media.relations?.edges ?? []) {
        const n = e.node
        if (!n || n.type !== type) continue
        if (e.relationType === 'PREQUEL' || e.relationType === 'SEQUEL') {
          if (!visited.has(n.id)) queue.push(n.id)
        } else if (e.relationType === 'SIDE_STORY' || e.relationType === 'SPIN_OFF') {
          extras.set(n.id, aniListMember(n, {
            optional: true,
            relation: e.relationType === 'SIDE_STORY' ? 'Side story' : 'Spin-off',
          }))
        }
      }
    }

    const mainLine = numberPositions([...main.values()].sort(byReleaseDate))
    const sideLine = [...extras.values()]
      .filter(x => !main.has(x.source_id))
      .sort(byReleaseDate)
    return {
      seriesName: mainLine[0]?.title ?? '',
      members: [...mainLine, ...sideLine],
    }
  } catch (err) {
    return { error: String(err.message ?? err) }
  }
}

// ── Movies (TMDB collections) ────────────────────────────────────

async function getMovieSeriesMembers(movieId, tmdbKey) {
  if (!tmdbKey) return { error: 'NO_TOKEN' }
  const key = encodeURIComponent(tmdbKey)
  try {
    const detail = await fetch(
      `https://api.themoviedb.org/3/movie/${encodeURIComponent(movieId)}?api_key=${key}&language=en-US`
    ).then(r => r.json())
    if (detail.status_code) return { error: detail.status_message }
    const collectionId = detail.belongs_to_collection?.id
    if (!collectionId) return { error: 'NOT_IN_SERIES' }
    const coll = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${key}&language=en-US`
    ).then(r => r.json())
    if (coll.status_code) return { error: coll.status_message }
    const members = (coll.parts ?? []).map(p => ({
      source_id:      p.id,
      title:          p.title ?? 'Untitled',
      cover_url:      p.poster_path ? `https://image.tmdb.org/t/p/w185${p.poster_path}` : null,
      release_date:   p.release_date || null,
      year:           yearOf(p.release_date),
      position:       null,
      unreleased:     !p.release_date || Date.parse(p.release_date) > Date.now(),
      progress_total: null,
      optional:       false,
      relation:       null,
    }))
    return {
      seriesName: (coll.name ?? '').replace(/\s+Collection$/i, ''),
      members: numberPositions(members.sort(byReleaseDate)),
    }
  } catch (err) {
    return { error: String(err) }
  }
}

// ── TV (TMDB seasons) ────────────────────────────────────────────

async function getTvSeriesMembers(tvId, tmdbKey) {
  if (!tmdbKey) return { error: 'NO_TOKEN' }
  try {
    const detail = await fetch(
      `https://api.themoviedb.org/3/tv/${encodeURIComponent(tvId)}?api_key=${encodeURIComponent(tmdbKey)}&language=en-US`
    ).then(r => r.json())
    if (detail.status_code) return { error: detail.status_message }
    const showName = detail.name ?? 'Untitled'
    const poster = (p) => p ? `https://image.tmdb.org/t/p/w185${p}` : null
    // Season 0 is TMDB's "Specials" bucket — listed, but opt-in.
    // Source ids match releaseChecker's `${tvId}-sN` so seasons added here are
    // recognised as "already in library" by release detection.
    const members = (detail.seasons ?? []).map(s => ({
      source_id:      `${tvId}-s${s.season_number}`,
      title:          `${showName} — ${s.name || `Season ${s.season_number}`}`,
      cover_url:      poster(s.poster_path) ?? poster(detail.poster_path),
      release_date:   s.air_date || null,
      year:           yearOf(s.air_date),
      position:       s.season_number > 0 ? s.season_number : null,
      unreleased:     !s.air_date || Date.parse(s.air_date) > Date.now(),
      progress_total: s.episode_count ?? null,
      optional:       !(s.season_number > 0),
      relation:       s.season_number > 0 ? null : 'Specials',
    }))
    members.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    return { seriesName: showName, members }
  } catch (err) {
    return { error: String(err) }
  }
}

// ── Games (RAWG) ─────────────────────────────────────────────────

async function getGameSeriesMembers(gameId, rawgKey) {
  if (!rawgKey) return { error: 'NO_TOKEN' }
  const key = encodeURIComponent(rawgKey)
  try {
    // RAWG's game-series endpoint omits the game itself, so fetch it too.
    const [self, series] = await Promise.all([
      fetch(`https://api.rawg.io/api/games/${encodeURIComponent(gameId)}?key=${key}`).then(r => r.json()),
      fetch(`https://api.rawg.io/api/games/${encodeURIComponent(gameId)}/game-series?key=${key}&page_size=40`).then(r => r.json()),
    ])
    if (self.detail) return { error: self.detail }
    if (series.detail) return { error: series.detail }
    const toMember = (g) => ({
      source_id:      g.id,
      title:          g.name ?? 'Untitled',
      cover_url:      g.background_image ?? null,
      release_date:   g.released || null,
      year:           yearOf(g.released),
      position:       null,
      unreleased:     !!g.tba || !g.released,
      progress_total: null,
      optional:       false,
      relation:       null,
    })
    const others = series.results ?? []
    if (!others.length) return { error: 'NOT_IN_SERIES' }
    const members = [toMember(self), ...others.filter(g => g.id !== self.id).map(toMember)]
    // RAWG has no series name; the picked game's title is a sensible, editable default.
    return { seriesName: self.name ?? '', members: numberPositions(members.sort(byReleaseDate)) }
  } catch (err) {
    return { error: String(err) }
  }
}

// ── Dispatcher ───────────────────────────────────────────────────

function getSeriesMembers(category, sourceId, keys = {}) {
  if (category === 'book')  return getBookSeriesMembers(sourceId, keys.hardcoverToken)
  if (category === 'anime') return getAniListSeriesMembers(sourceId, 'ANIME')
  if (category === 'manga') return getAniListSeriesMembers(sourceId, 'MANGA')
  if (category === 'movie') return getMovieSeriesMembers(sourceId, keys.tmdbKey)
  if (category === 'tv')    return getTvSeriesMembers(sourceId, keys.tmdbKey)
  if (category === 'game')  return getGameSeriesMembers(sourceId, keys.rawgKey)
  return Promise.resolve({ error: 'UNSUPPORTED' })
}

module.exports = {
  getSeriesMembers,
  getBookSeriesMembers, getAniListSeriesMembers, getMovieSeriesMembers,
  getTvSeriesMembers, getGameSeriesMembers,
}
