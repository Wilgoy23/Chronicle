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

module.exports = { searchBooks, searchAnime, searchMovies, searchGames }
