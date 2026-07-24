import { describe, it, expect, afterEach, vi } from 'vitest'
import { searchBooks, searchAnime, searchMovies, searchTv, searchGames, getTvSeasons } from '../../electron/api.js'

// ── searchBooks ────────────────────────────────────────────────────────────────

describe('searchBooks', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns NO_TOKEN error when token is null', async () => {
    expect(await searchBooks('dune', null)).toEqual({ error: 'NO_TOKEN' })
  })

  it('returns NO_TOKEN error when token is empty string', async () => {
    expect(await searchBooks('dune', '')).toEqual({ error: 'NO_TOKEN' })
  })

  it('returns NO_TOKEN error when token is only whitespace', async () => {
    expect(await searchBooks('dune', '   ')).toEqual({ error: 'NO_TOKEN' })
  })

  it('strips an accidental Bearer prefix before forwarding the token', async () => {
    let authHeader
    vi.stubGlobal('fetch', async (_url, opts) => {
      authHeader = opts.headers['Authorization']
      return { json: async () => ({ data: { search: { results: JSON.stringify({ hits: [] }) } } }) }
    })
    await searchBooks('dune', 'Bearer my-actual-token')
    expect(authHeader).toBe('Bearer my-actual-token')
  })

  it('parses hits into book objects with authors joined', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        data: {
          search: {
            results: JSON.stringify({
              hits: [{
                document: {
                  id: 1, title: 'Dune',
                  cached_contributors: JSON.stringify([{ author: { name: 'Frank Herbert' } }]),
                  image: { url: 'https://example.com/dune.jpg' },
                  description: 'A great book',
                },
              }],
            }),
          },
        },
      }),
    }))
    const results = await searchBooks('dune', 'valid-token')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: 1, title: 'Dune', author: 'Frank Herbert',
      cover: 'https://example.com/dune.jpg', description: 'A great book',
    })
  })

  it('handles cached_contributors already being an array (not a string)', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        data: {
          search: {
            results: JSON.stringify({
              hits: [{
                document: {
                  id: 2, title: 'Foundation',
                  cached_contributors: [{ name: 'Isaac Asimov' }],
                  image_url: 'https://example.com/foundation.jpg',
                  description: '',
                },
              }],
            }),
          },
        },
      }),
    }))
    const results = await searchBooks('foundation', 'valid-token')
    expect(results[0].author).toBe('Isaac Asimov')
    expect(results[0].cover).toBe('https://example.com/foundation.jpg')
  })

  it('returns error from GraphQL errors array', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({ errors: [{ message: 'Unauthorized' }] }),
    }))
    expect(await searchBooks('dune', 'bad-token')).toEqual({ error: 'Unauthorized' })
  })
})

// ── searchAnime ────────────────────────────────────────────────────────────────

describe('searchAnime', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps results to anime objects, preferring English title', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        data: {
          Page: {
            media: [{
              id: 1,
              title: { english: 'Attack on Titan', romaji: 'Shingeki no Kyojin' },
              coverImage: { medium: 'https://example.com/aot.jpg' },
              episodes: 25, status: 'FINISHED', averageScore: 84,
              description: 'Humanity fights giants.',
              genres: ['Action', 'Drama', 'Fantasy', 'Mystery'],
              seasonYear: 2013,
            }],
          },
        },
      }),
    }))
    const results = await searchAnime('attack on titan')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: 1, title: 'Attack on Titan', titleRomaji: 'Shingeki no Kyojin',
      cover: 'https://example.com/aot.jpg', episodes: 25, status: 'FINISHED',
      score: 8, description: 'Humanity fights giants.', genres: 'Action, Drama, Fantasy', year: 2013,
    })
  })

  it('falls back to romaji title when English title is null', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        data: {
          Page: {
            media: [{
              id: 2, title: { english: null, romaji: 'Kimetsu no Yaiba' },
              coverImage: { medium: '' }, episodes: 26, status: 'FINISHED',
              averageScore: 80, description: '', genres: [], seasonYear: 2019,
            }],
          },
        },
      }),
    }))
    const results = await searchAnime('demon slayer')
    expect(results[0].title).toBe('Kimetsu no Yaiba')
  })

  it('strips HTML tags from description and truncates to 300 chars', async () => {
    const long = 'A'.repeat(400)
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        data: {
          Page: {
            media: [{
              id: 3, title: { english: 'Test', romaji: 'Test' },
              coverImage: { medium: '' }, episodes: null, status: 'RELEASING',
              averageScore: null, description: `<b>${long}</b>`, genres: [], seasonYear: 2024,
            }],
          },
        },
      }),
    }))
    const results = await searchAnime('test')
    expect(results[0].description).toHaveLength(300)
    expect(results[0].score).toBeNull()
  })

  it('limits genres to 3 items joined by comma-space', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        data: {
          Page: {
            media: [{
              id: 4, title: { english: 'X', romaji: 'X' },
              coverImage: { medium: '' }, episodes: 12, status: 'FINISHED',
              averageScore: 70, description: '', genres: ['Action', 'Drama', 'Fantasy', 'Mystery'], seasonYear: 2020,
            }],
          },
        },
      }),
    }))
    const results = await searchAnime('x')
    expect(results[0].genres).toBe('Action, Drama, Fantasy')
  })

  it('returns error from GraphQL errors array', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({ errors: [{ message: 'Rate limited' }] }),
    }))
    expect(await searchAnime('test')).toEqual({ error: 'Rate limited' })
  })
})

// ── searchMovies ───────────────────────────────────────────────────────────────

describe('searchMovies', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns NO_TOKEN error when key is null', async () => {
    expect(await searchMovies('dune', null)).toEqual({ error: 'NO_TOKEN' })
  })

  it('returns NO_TOKEN error when key is empty string', async () => {
    expect(await searchMovies('dune', '')).toEqual({ error: 'NO_TOKEN' })
  })

  it('maps TMDB results to movie objects', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        results: [{
          id: 438631, title: 'Dune',
          poster_path: '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
          overview: 'Paul Atreides leads nomadic tribes.',
          release_date: '2021-09-15',
          vote_average: 7.8,
        }],
      }),
    }))
    const results = await searchMovies('dune', 'valid-key')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: 438631,
      title: 'Dune',
      cover: 'https://image.tmdb.org/t/p/w185/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
      description: 'Paul Atreides leads nomadic tribes.',
      year: '2021',
      score: 8,
    })
  })

  it('returns empty cover when poster_path is null', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        results: [{ id: 1, title: 'X', poster_path: null, overview: '', release_date: '', vote_average: 0 }],
      }),
    }))
    const results = await searchMovies('x', 'valid-key')
    expect(results[0].cover).toBe('')
  })

  it('returns API error message', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({ status_code: 7, status_message: 'Invalid API key.' }),
    }))
    expect(await searchMovies('dune', 'bad-key')).toEqual({ error: 'Invalid API key.' })
  })
})

// ── searchTv ───────────────────────────────────────────────────────────────────

describe('searchTv', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns NO_TOKEN error when key is null', async () => {
    expect(await searchTv('severance', null)).toEqual({ error: 'NO_TOKEN' })
  })

  it('returns NO_TOKEN error when key is empty string', async () => {
    expect(await searchTv('severance', '')).toEqual({ error: 'NO_TOKEN' })
  })

  it('hits the TMDB /search/tv endpoint', async () => {
    let calledUrl
    vi.stubGlobal('fetch', async (url) => {
      calledUrl = url
      return { json: async () => ({ results: [] }) }
    })
    await searchTv('severance', 'valid-key')
    expect(calledUrl).toContain('/search/tv')
    expect(calledUrl).toContain('query=severance')
  })

  it('maps TMDB TV results to entry objects (name→title, first_air_date→year)', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        results: [{
          id: 95396, name: 'Severance',
          poster_path: '/lFf6LLrQjYldcZItzOkGmMMigP7.jpg',
          overview: 'Mark leads a team whose memories are surgically divided.',
          first_air_date: '2022-02-18',
          vote_average: 8.4,
        }],
      }),
    }))
    const results = await searchTv('severance', 'valid-key')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: 95396,
      title: 'Severance',
      cover: 'https://image.tmdb.org/t/p/w185/lFf6LLrQjYldcZItzOkGmMMigP7.jpg',
      description: 'Mark leads a team whose memories are surgically divided.',
      year: '2022',
      score: 8,
    })
  })

  it('returns empty cover when poster_path is null', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        results: [{ id: 1, name: 'X', poster_path: null, overview: '', first_air_date: '', vote_average: 0 }],
      }),
    }))
    const results = await searchTv('x', 'valid-key')
    expect(results[0].cover).toBe('')
    expect(results[0].score).toBeNull()
  })

  it('returns API error message', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({ status_code: 7, status_message: 'Invalid API key.' }),
    }))
    expect(await searchTv('severance', 'bad-key')).toEqual({ error: 'Invalid API key.' })
  })
})

// ── getTvSeasons ─────────────────────────────────────────────────────────────────

describe('getTvSeasons', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns NO_TOKEN error when key is null', async () => {
    expect(await getTvSeasons(95396, null)).toEqual({ error: 'NO_TOKEN' })
  })

  it('maps seasons to release candidates, skipping the specials bucket (season 0)', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        name: 'Severance',
        poster_path: '/show.jpg',
        seasons: [
          { season_number: 0, name: 'Specials', air_date: '2022-01-01', poster_path: '/s0.jpg' },
          { season_number: 1, name: 'Season 1', air_date: '2022-02-18', poster_path: '/s1.jpg' },
          { season_number: 2, name: 'Season 2', air_date: null, poster_path: null },
        ],
      }),
    }))
    const out = await getTvSeasons(95396, 'valid-key')
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      source_id:    '95396-s1',
      title:        'Severance — Season 1',
      cover_url:    'https://image.tmdb.org/t/p/w185/s1.jpg',
      release_date: '2022-02-18',
      relation:     'New season',
      unreleased:   false,
    })
    // Season 2 has no air date → unreleased, falls back to the show poster.
    expect(out[1]).toMatchObject({
      source_id:  '95396-s2',
      cover_url:  'https://image.tmdb.org/t/p/w185/show.jpg',
      release_date: null,
      unreleased: true,
    })
  })

  it('returns [] when the show has no seasons', async () => {
    vi.stubGlobal('fetch', async () => ({ json: async () => ({ name: 'X' }) }))
    expect(await getTvSeasons(1, 'valid-key')).toEqual([])
  })

  it('returns API error message', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({ status_code: 34, status_message: 'Not found.' }),
    }))
    expect(await getTvSeasons(999999, 'valid-key')).toEqual({ error: 'Not found.' })
  })
})

// ── searchGames ────────────────────────────────────────────────────────────────

describe('searchGames', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns NO_TOKEN error when key is null', async () => {
    expect(await searchGames('hades', null)).toEqual({ error: 'NO_TOKEN' })
  })

  it('returns NO_TOKEN error when key is empty string', async () => {
    expect(await searchGames('hades', '')).toEqual({ error: 'NO_TOKEN' })
  })

  it('maps RAWG results to game objects', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        results: [{
          id: 123, name: 'Hades',
          background_image: 'https://example.com/hades.jpg',
          released: '2020-09-17',
          genres: [{ name: 'Action' }, { name: 'RPG' }, { name: 'Indie' }, { name: 'Extra' }],
          rating: 4.5,
        }],
      }),
    }))
    const results = await searchGames('hades', 'valid-key')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: 123, title: 'Hades',
      cover: 'https://example.com/hades.jpg',
      description: '',
      year: '2020',
      genres: 'Action, RPG, Indie',
      score: 9,
    })
  })

  it('limits genres to 3 items', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({
        results: [{
          id: 1, name: 'X', background_image: null, released: null,
          genres: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
          rating: 0,
        }],
      }),
    }))
    const results = await searchGames('x', 'valid-key')
    expect(results[0].genres).toBe('A, B, C')
  })

  it('returns API error message', async () => {
    vi.stubGlobal('fetch', async () => ({
      json: async () => ({ detail: 'Invalid API key' }),
    }))
    expect(await searchGames('hades', 'bad-key')).toEqual({ error: 'Invalid API key' })
  })
})
