import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
import { searchOpenLibrary, searchTvMaze, getTvMazeSeasons } from '../../electron/api.js'

// catalog.js require()s keys.js; load both through CommonJS so the test's
// bundled-key override reaches the same module instance the catalog uses.
const require = createRequire(import.meta.url)
const { effectiveKeys, setBundledForTests } = require('../../electron/keys.js')
const { search, sourcesSummary, lookupReleases, activeProvider } = require('../../electron/catalog.js')

afterEach(() => { vi.unstubAllGlobals(); setBundledForTests(null) })

describe('effectiveKeys', () => {
  it("prefers the user's key over a bundled one", () => {
    setBundledForTests({ tmdbKey: 'bundled-tmdb' })
    const k = effectiveKeys({ tmdbKey: ' mine ' })
    expect(k.tmdbKey).toBe('mine')
    expect(k.origin.tmdbKey).toBe('user')
  })

  it('falls back to the bundled key when the user has none', () => {
    setBundledForTests({ tmdbKey: 'bundled-tmdb', rawgKey: 'bundled-rawg' })
    const k = effectiveKeys({ tmdbKey: '   ' })
    expect(k.tmdbKey).toBe('bundled-tmdb')
    expect(k.origin.tmdbKey).toBe('bundled')
    expect(k.rawgKey).toBe('bundled-rawg')
  })

  it('reports null origin when neither is present', () => {
    setBundledForTests({})
    const k = effectiveKeys({})
    expect(k.tmdbKey).toBe('')
    expect(k.origin.tmdbKey).toBeNull()
  })

  it('never bundles a Hardcover token and strips a Bearer prefix', () => {
    setBundledForTests({})
    expect(effectiveKeys({}).hardcoverToken).toBe('')
    expect(effectiveKeys({ hardcoverToken: 'Bearer abc' }).hardcoverToken).toBe('abc')
  })
})

describe('activeProvider', () => {
  it('uses the keyless fallback for books and TV with no keys', () => {
    expect(activeProvider('book', {}).source).toBe('openlibrary')
    expect(activeProvider('tv', {}).source).toBe('tvmaze')
  })

  it('switches to the keyed source once a key exists', () => {
    expect(activeProvider('book', { hardcoverToken: 't' }).source).toBe('hardcover')
    expect(activeProvider('tv', { tmdbKey: 'k' }).source).toBe('tmdb')
  })

  it('keeps movies/games on their keyed source (no fallback) so they report NO_TOKEN', () => {
    expect(activeProvider('movie', {}).source).toBe('tmdb')
    expect(activeProvider('game', {}).source).toBe('rawg')
  })

  it('returns null for custom categories', () => {
    expect(activeProvider('custom-abc', {})).toBeNull()
  })
})

describe('sourcesSummary', () => {
  it('marks keyless categories ready and keyed ones without a key not ready', () => {
    setBundledForTests({})
    const s = sourcesSummary({})
    expect(s.book).toMatchObject({ source: 'openlibrary', ready: true, keyOrigin: 'none-needed' })
    expect(s.anime).toMatchObject({ source: 'anilist', ready: true })
    expect(s.movie).toMatchObject({ source: 'tmdb', ready: false, keyOrigin: null })
  })

  it('reports a bundled TMDB key as the origin for movies and TV', () => {
    setBundledForTests({ tmdbKey: 'b' })
    const s = sourcesSummary({})
    expect(s.movie).toMatchObject({ ready: true, keyOrigin: 'bundled' })
    expect(s.tv.source).toBe('tmdb')
  })
})

describe('search', () => {
  it('tags each result with the source that produced it', async () => {
    setBundledForTests({})
    vi.stubGlobal('fetch', async (url) => {
      expect(String(url)).toContain('openlibrary.org/search.json')
      return { ok: true, json: async () => ({ docs: [{ key: '/works/OL1W', title: 'Dune' }] }) }
    })
    const res = await search('book', 'dune', {})
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ id: 'OL1W', title: 'Dune', source: 'openlibrary' })
  })

  it('passes errors through untouched', async () => {
    setBundledForTests({})
    const res = await search('movie', 'alien', {})
    expect(res).toEqual({ error: 'NO_TOKEN' })
  })
})

describe('lookupReleases', () => {
  it("dispatches on the entry's own source, not the category default", async () => {
    const urls = []
    vi.stubGlobal('fetch', async (url) => {
      urls.push(String(url))
      if (String(url).endsWith('/seasons')) return { json: async () => [{ number: 1, premiereDate: '2020-01-01' }] }
      return { json: async () => ({ name: 'Show' }) }
    })
    const res = await lookupReleases({ category: 'tv', source: 'tvmaze', source_id: '42' }, {})
    expect(urls.every(u => u.includes('api.tvmaze.com'))).toBe(true)
    expect(res[0].source_id).toBe('42-s1')
  })

  it('returns no candidates for Open Library books', async () => {
    expect(await lookupReleases({ category: 'book', source: 'openlibrary', source_id: 'OL1W' }, {})).toEqual([])
  })
})

describe('searchOpenLibrary', () => {
  it('maps docs to results with a cover URL, year and median page count', async () => {
    vi.stubGlobal('fetch', async (_url, opts) => {
      expect(opts.headers['User-Agent']).toMatch(/Chronicle/)
      return {
        ok: true,
        json: async () => ({ docs: [{
          key: '/works/OL893415W', title: 'Dune', author_name: ['Frank Herbert'],
          cover_i: 12345, first_publish_year: 1965, number_of_pages_median: 604,
        }] }),
      }
    })
    const [r] = await searchOpenLibrary('dune')
    expect(r).toEqual({
      id: 'OL893415W', title: 'Dune', author: 'Frank Herbert',
      cover: 'https://covers.openlibrary.org/b/id/12345-M.jpg',
      description: '', year: 1965, pages: 604,
    })
  })

  it('returns an error object on a non-OK response', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503 }))
    expect(await searchOpenLibrary('x')).toEqual({ error: 'Open Library returned 503' })
  })
})

describe('searchTvMaze', () => {
  it('maps shows, stripping HTML from the summary', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ([{ show: {
        id: 82, name: 'Game of Thrones', image: { medium: 'm.jpg' },
        summary: '<p>Seven <b>noble</b> families.</p>', premiered: '2011-04-17',
        genres: ['Drama', 'Adventure', 'Fantasy', 'Extra'], rating: { average: 8.9 },
      } }]),
    }))
    const [r] = await searchTvMaze('thrones')
    expect(r).toEqual({
      id: 82, title: 'Game of Thrones', cover: 'm.jpg', description: 'Seven noble families.',
      year: '2011', genres: 'Drama, Adventure, Fantasy', score: 9,
    })
  })
})

describe('getTvMazeSeasons', () => {
  it('skips season 0 and uses `${id}-sN` ids', async () => {
    vi.stubGlobal('fetch', async (url) => ({
      json: async () => String(url).endsWith('/seasons')
        ? [{ number: 0 }, { number: 1, premiereDate: '2011-04-17' }, { number: 2, premiereDate: null }]
        : { name: 'GoT' },
    }))
    const res = await getTvMazeSeasons(82)
    expect(res.map(r => r.source_id)).toEqual(['82-s1', '82-s2'])
    expect(res[1].unreleased).toBe(true)
    expect(res[0].title).toBe('GoT — Season 1')
  })
})
