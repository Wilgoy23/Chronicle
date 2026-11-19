// Which external catalogue backs each category, given the keys available.
//
// Each category lists its providers in preference order. The first one whose
// key requirement is met is used; a keyless provider at the end of the list
// means the category always works, even on a fresh install with no keys.
// Search results are tagged with the provider's `source` so the entry records
// where its source_id came from — books can be a mix of Hardcover and Open
// Library ids, TV a mix of TMDB and TVmaze ids, depending on when each was added.

const api = require('./api')
const { effectiveKeys } = require('./keys')

const PROVIDERS = {
  book: [
    { source: 'hardcover',   label: 'Hardcover',   key: 'hardcoverToken', search: api.searchBooks },
    { source: 'openlibrary', label: 'Open Library',                       search: api.searchOpenLibrary },
  ],
  anime: [{ source: 'anilist', label: 'AniList', search: api.searchAnime }],
  manga: [{ source: 'anilist', label: 'AniList', search: api.searchManga }],
  movie: [{ source: 'tmdb', label: 'TMDB', key: 'tmdbKey', search: api.searchMovies }],
  tv: [
    { source: 'tmdb',   label: 'TMDB',   key: 'tmdbKey', search: api.searchTv },
    { source: 'tvmaze', label: 'TVmaze',                 search: api.searchTvMaze },
  ],
  game: [{ source: 'rawg', label: 'RAWG', key: 'rawgKey', search: api.searchGames }],
}

const SOURCE_LABELS = {
  hardcover: 'Hardcover', openlibrary: 'Open Library', anilist: 'AniList',
  tmdb: 'TMDB', tvmaze: 'TVmaze', rawg: 'RAWG',
}

// The provider a category will use right now, or null for custom categories.
function activeProvider(category, keys) {
  const list = PROVIDERS[category]
  if (!list) return null
  return list.find(p => !p.key || keys[p.key]) ?? list[0]
}

// Per-category summary for the UI: which source is active, whether it works
// without a key, and where the key came from.
function sourcesSummary(settings) {
  const keys = effectiveKeys(settings)
  const out = {}
  for (const category of Object.keys(PROVIDERS)) {
    const p = activeProvider(category, keys)
    out[category] = {
      source:   p.source,
      label:    p.label,
      ready:    !p.key || !!keys[p.key],
      keyOrigin: p.key ? keys.origin[p.key] : 'none-needed',
    }
  }
  return out
}

async function search(category, query, settings) {
  const keys = effectiveKeys(settings)
  const p = activeProvider(category, keys)
  if (!p) return []
  const res = await p.search(query, p.key ? keys[p.key] : undefined)
  return Array.isArray(res) ? res.map(r => ({ ...r, source: p.source })) : res
}

// Franchise lookups for release detection, dispatched on the entry's own
// source (not the category's current provider) since its source_id belongs there.
function lookupReleases(entry, settings) {
  const keys = effectiveKeys(settings)
  const id = entry.source_id
  switch (entry.source) {
    case 'hardcover':   return api.getBookSeries(id, keys.hardcoverToken)
    case 'anilist':     return entry.category === 'manga' ? api.getMangaRelations(id) : api.getAnimeRelations(id)
    case 'tmdb':        return entry.category === 'tv' ? api.getTvSeasons(id, keys.tmdbKey) : api.getMovieCollection(id, keys.tmdbKey)
    case 'tvmaze':      return api.getTvMazeSeasons(id)
    case 'rawg':        return api.getGameSeries(id, keys.rawgKey)
    case 'openlibrary': return Promise.resolve([]) // Open Library has no reliable series data
    default:            return Promise.resolve([])
  }
}

module.exports = { PROVIDERS, SOURCE_LABELS, activeProvider, sourcesSummary, search, lookupReleases }
