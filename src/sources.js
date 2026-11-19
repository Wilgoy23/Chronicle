// Default source per category, for results/entries that don't carry their own.
// Search results are tagged with their real source by the main process (books
// may come from Open Library and TV from TVmaze when no key is set).
export const SOURCE_KEYS = {
  book:  'hardcover',
  anime: 'anilist',
  manga: 'anilist',
  movie: 'tmdb',
  tv:    'tmdb',
  game:  'rawg',
}

export const sourceKey = (source, id) => `${source}:${id}`

// Library entries keyed by source + id, so an Open Library id can't collide
// with a Hardcover one. Entries linked before sources were recorded per entry
// fall back to the category default.
export function sourceKeySet(entries, category) {
  return new Set(
    entries.filter(e => e.source_id != null)
      .map(e => sourceKey(e.source ?? SOURCE_KEYS[e.category ?? category], e.source_id))
  )
}
