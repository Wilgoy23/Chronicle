async function searchBooks(query, rawToken) {
  if (!rawToken) return { error: 'NO_TOKEN' }
  const token = rawToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'NO_TOKEN' }

  const gql = `
    query Search($query: String!) {
      search(query: $query, query_type: "books", per_page: 20, page: 1) {
        results
      }
    }
  `
  const res = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query: gql, variables: { query } }),
  })

  const json = await res.json()
  if (json.errors) return { error: json.errors[0].message }

  const raw = json.data?.search?.results
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const hits = parsed?.hits ?? []

  return hits.map(hit => {
    const doc = hit.document ?? hit
    let authors = []
    try {
      const contrib = typeof doc.cached_contributors === 'string'
        ? JSON.parse(doc.cached_contributors)
        : doc.cached_contributors
      authors = (contrib ?? []).map(c => c.author?.name ?? c.name).filter(Boolean)
    } catch {}
    return {
      id:          doc.id,
      title:       doc.title ?? '',
      author:      authors.join(', '),
      cover:       doc.image?.url ?? doc.image_url ?? '',
      description: doc.description ?? '',
    }
  })
}

async function searchAnime(query) {
  const gql = `
    query ($search: String!) {
      Page(page: 1, perPage: 20) {
        media(search: $search, type: ANIME) {
          id
          title { romaji english }
          coverImage { medium }
          episodes
          status
          averageScore
          description(asHtml: false)
          genres
          seasonYear
        }
      }
    }
  `
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  })

  const json = await res.json()
  if (json.errors) return { error: json.errors[0].message }

  return (json.data?.Page?.media ?? []).map(m => ({
    id:          m.id,
    title:       m.title.english || m.title.romaji,
    titleRomaji: m.title.romaji,
    cover:       m.coverImage?.medium ?? '',
    episodes:    m.episodes,
    status:      m.status,
    score:       m.averageScore ? Math.round(m.averageScore / 10) : null,
    description: m.description?.replace(/<[^>]*>/g, '').slice(0, 300) ?? '',
    genres:      m.genres?.slice(0, 3).join(', ') ?? '',
    year:        m.seasonYear,
  }))
}

async function searchMovies(query, tmdbKey) {
  if (!tmdbKey) return { error: 'NO_TOKEN' }
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(tmdbKey)}&query=${encodeURIComponent(query)}&language=en-US&page=1`
  const res = await fetch(url)
  const json = await res.json()
  if (json.status_code) return { error: json.status_message }
  return (json.results ?? []).slice(0, 20).map(m => ({
    id:          m.id,
    title:       m.title ?? '',
    cover:       m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : '',
    description: m.overview?.slice(0, 300) ?? '',
    year:        m.release_date?.slice(0, 4) ?? '',
    score:       m.vote_average ? Math.round(m.vote_average) : null,
  }))
}

async function searchGames(query, rawgKey) {
  if (!rawgKey) return { error: 'NO_TOKEN' }
  const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(rawgKey)}&search=${encodeURIComponent(query)}&page_size=20`
  const res = await fetch(url)
  const json = await res.json()
  if (json.detail) return { error: json.detail }
  return (json.results ?? []).map(g => ({
    id:          g.id,
    title:       g.name ?? '',
    cover:       g.background_image ?? '',
    description: '',
    year:        g.released?.slice(0, 4) ?? '',
    genres:      g.genres?.slice(0, 3).map(x => x.name).join(', ') ?? '',
    score:       g.rating ? Math.round(g.rating * 2) : null,
  }))
}

// ── Franchise lookups (for new-release detection) ────────────────
// Each returns a normalized array of candidates:
//   { source_id, title, cover_url, release_date, relation, unreleased }
// or { error } on failure. Callers treat errors/empties as "nothing new".

function ymd({ year, month, day } = {}) {
  if (!year) return null
  const m = String(month ?? 1).padStart(2, '0')
  const d = String(day ?? 1).padStart(2, '0')
  return `${year}-${m}-${d}`
}

async function getAnimeRelations(mediaId) {
  const gql = `
    query ($id: Int!) {
      Media(id: $id, type: ANIME) {
        relations {
          edges {
            relationType
            node {
              id
              type
              format
              status
              title { romaji english }
              coverImage { medium }
              startDate { year month day }
            }
          }
        }
      }
    }
  `
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql, variables: { id: Number(mediaId) } }),
    })
    const json = await res.json()
    if (json.errors) return { error: json.errors[0].message }
    const edges = json.data?.Media?.relations?.edges ?? []
    return edges
      .filter(e => ['SEQUEL', 'SIDE_STORY'].includes(e.relationType))
      .filter(e => e.node?.type === 'ANIME')
      .map(e => ({
        source_id:    e.node.id,
        title:        e.node.title?.english || e.node.title?.romaji || 'Untitled',
        cover_url:    e.node.coverImage?.medium ?? null,
        release_date: ymd(e.node.startDate),
        relation:     e.relationType === 'SEQUEL' ? 'New season / sequel' : 'Side story',
        unreleased:   ['NOT_YET_RELEASED', 'RELEASING'].includes(e.node.status),
      }))
  } catch (err) {
    return { error: String(err) }
  }
}

async function getMovieCollection(movieId, tmdbKey) {
  if (!tmdbKey) return { error: 'NO_TOKEN' }
  try {
    const detail = await fetch(
      `https://api.themoviedb.org/3/movie/${encodeURIComponent(movieId)}?api_key=${encodeURIComponent(tmdbKey)}&language=en-US`
    ).then(r => r.json())
    const collectionId = detail?.belongs_to_collection?.id
    if (!collectionId) return []
    const coll = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${encodeURIComponent(tmdbKey)}&language=en-US`
    ).then(r => r.json())
    if (coll.status_code) return { error: coll.status_message }
    return (coll.parts ?? []).map(p => ({
      source_id:    p.id,
      title:        p.title ?? 'Untitled',
      cover_url:    p.poster_path ? `https://image.tmdb.org/t/p/w185${p.poster_path}` : null,
      release_date: p.release_date || null,
      relation:     'In collection',
      unreleased:   !p.release_date,
    }))
  } catch (err) {
    return { error: String(err) }
  }
}

async function getGameSeries(gameId, rawgKey) {
  if (!rawgKey) return { error: 'NO_TOKEN' }
  try {
    const json = await fetch(
      `https://api.rawg.io/api/games/${encodeURIComponent(gameId)}/game-series?key=${encodeURIComponent(rawgKey)}&page_size=40`
    ).then(r => r.json())
    if (json.detail) return { error: json.detail }
    return (json.results ?? []).map(g => ({
      source_id:    g.id,
      title:        g.name ?? 'Untitled',
      cover_url:    g.background_image ?? null,
      release_date: g.released || null,
      relation:     'In series',
      unreleased:   !!g.tba || !g.released,
    }))
  } catch (err) {
    return { error: String(err) }
  }
}

async function getBookSeries(bookId, rawToken) {
  if (!rawToken) return { error: 'NO_TOKEN' }
  const token = rawToken.trim().replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'NO_TOKEN' }
  const gql = `
    query ($id: Int!) {
      books(where: { id: { _eq: $id } }) {
        book_series {
          series {
            id
            name
            book_series {
              book { id title release_date image { url } }
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
    const seriesEdges = json.data?.books?.[0]?.book_series ?? []
    const out = []
    const seen = new Set()
    for (const se of seriesEdges) {
      const seriesName = se.series?.name ?? ''
      for (const bs of (se.series?.book_series ?? [])) {
        const b = bs.book
        if (!b || String(b.id) === String(bookId) || seen.has(b.id)) continue
        seen.add(b.id)
        out.push({
          source_id:    b.id,
          title:        b.title ?? 'Untitled',
          cover_url:    b.image?.url ?? null,
          release_date: b.release_date || null,
          relation:     seriesName ? `${seriesName} series` : 'In series',
          unreleased:   !b.release_date,
        })
      }
    }
    return out
  } catch (err) {
    return { error: String(err) }
  }
}

module.exports = {
  searchBooks, searchAnime, searchMovies, searchGames,
  getAnimeRelations, getMovieCollection, getGameSeries, getBookSeries,
}
