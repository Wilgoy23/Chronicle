import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
import { getEpisodes, parseTvSourceId, anilistToEpisodes, finalize, supportsEpisodes } from '../../electron/episodes.js'

// episodes.js require()s keys.js natively; reach that same instance.
const { setBundledForTests } = createRequire(import.meta.url)('../../electron/keys.js')

afterEach(() => vi.unstubAllGlobals())

const memCache = () => {
  const m = new Map()
  return {
    store: m,
    get: (k) => m.has(k) ? { value: m.get(k).value, fresh: m.get(k).fresh } : null,
    set: (k, v) => m.set(k, { value: v, fresh: true }),
  }
}

describe('parseTvSourceId', () => {
  it('splits season ids and leaves whole-show ids alone', () => {
    expect(parseTvSourceId('1399-s2')).toEqual({ showId: '1399', season: 2 })
    expect(parseTvSourceId('1399')).toEqual({ showId: '1399', season: null })
    expect(parseTvSourceId(82)).toEqual({ showId: '82', season: null })
  })
})

describe('finalize', () => {
  it('drops specials, sorts by season/number and flags the next dated unaired episode', () => {
    const res = finalize([
      { season: 2, number: 1, title: 'B1', air_date: '2999-01-01' },
      { season: 0, number: 1, title: 'Special', air_date: '2000-01-01' },
      { season: 1, number: 2, title: 'A2', air_date: '2001-01-08' },
      { season: 1, number: 1, title: 'A1', air_date: '2001-01-01' },
    ])
    expect(res.episodes.map(e => e.title)).toEqual(['A1', 'A2', 'B1'])
    expect(res.episodes.map(e => e.aired)).toEqual([true, true, false])
    expect(res.next_airing).toEqual({ index: 3, season: 2, number: 1, air_date: '2999-01-01' })
  })

  it('treats undated episodes as unaired without making them next_airing', () => {
    const res = finalize([{ season: 1, number: 1, title: null, air_date: null }])
    expect(res.episodes[0].aired).toBe(false)
    expect(res.next_airing).toBeNull()
  })
})

describe('anilistToEpisodes', () => {
  it('builds 1..N with episodes before the next airing one marked aired', () => {
    const res = anilistToEpisodes({ episodes: 12, status: 'RELEASING', nextAiringEpisode: { episode: 5, airingAt: 4102444800 } })
    expect(res.episodes).toHaveLength(12)
    expect(res.episodes.filter(e => e.aired)).toHaveLength(4)
    expect(res.next_airing).toMatchObject({ index: 5, number: 5, air_date: '2100-01-01' })
  })

  it('uses the next episode number as the count when the total is unknown', () => {
    const res = anilistToEpisodes({ episodes: null, status: 'RELEASING', nextAiringEpisode: { episode: 1100, airingAt: 4102444800 } })
    expect(res.episodes).toHaveLength(1100)
  })

  it('marks nothing aired for a show that has not started', () => {
    const res = anilistToEpisodes({ episodes: 12, status: 'NOT_YET_RELEASED', nextAiringEpisode: null })
    expect(res.episodes.every(e => !e.aired)).toBe(true)
  })

  it('marks everything aired for a finished show', () => {
    const res = anilistToEpisodes({ episodes: 3, status: 'FINISHED', nextAiringEpisode: null })
    expect(res.episodes.every(e => e.aired)).toBe(true)
    expect(res.next_airing).toBeNull()
  })
})

describe('supportsEpisodes', () => {
  it('covers AniList anime and TMDB/TVmaze TV with a source id', () => {
    expect(supportsEpisodes({ category: 'anime', source: 'anilist', source_id: '1' })).toBe(true)
    expect(supportsEpisodes({ category: 'tv', source: 'tvmaze', source_id: '1' })).toBe(true)
    expect(supportsEpisodes({ category: 'tv', source: 'tmdb', source_id: null })).toBe(false)
    expect(supportsEpisodes({ category: 'manga', source: 'anilist', source_id: '1' })).toBe(false)
  })
})

describe('getEpisodes', () => {
  it('fetches TVmaze episodes for a season entry, filtered to that season', async () => {
    vi.stubGlobal('fetch', async (url) => {
      expect(String(url)).toBe('https://api.tvmaze.com/shows/82/episodes')
      return {
        ok: true,
        json: async () => ([
          { season: 1, number: 1, name: 'Winter Is Coming', airdate: '2011-04-17' },
          { season: 2, number: 1, name: 'The North Remembers', airdate: '2012-04-01' },
        ]),
      }
    })
    const res = await getEpisodes({ category: 'tv', source: 'tvmaze', source_id: '82-s2' }, {}, memCache())
    expect(res.episodes).toEqual([
      { season: 2, number: 1, title: 'The North Remembers', air_date: '2012-04-01', aired: true },
    ])
  })

  it('serves a fresh cached copy without fetching', async () => {
    const cache = memCache()
    cache.set('episodes:tvmaze:82', { episodes: [], next_airing: null })
    vi.stubGlobal('fetch', () => { throw new Error('should not fetch') })
    expect(await getEpisodes({ category: 'tv', source: 'tvmaze', source_id: '82' }, {}, cache))
      .toEqual({ episodes: [], next_airing: null })
  })

  it('falls back to a stale cached copy when the network fails', async () => {
    const cache = memCache()
    cache.store.set('episodes:tvmaze:82', { value: { episodes: ['old'] }, fresh: false })
    vi.stubGlobal('fetch', async () => { throw new Error('offline') })
    expect(await getEpisodes({ category: 'tv', source: 'tvmaze', source_id: '82' }, {}, cache))
      .toEqual({ episodes: ['old'] })
  })

  it('reports NO_TOKEN for TMDB without a key', async () => {
    setBundledForTests({})
    try {
      expect(await getEpisodes({ category: 'tv', source: 'tmdb', source_id: '1' }, {}, memCache()))
        .toEqual({ error: 'NO_TOKEN' })
    } finally {
      setBundledForTests(null)
    }
  })

  it('reports UNSUPPORTED for categories without episode data', async () => {
    expect(await getEpisodes({ category: 'book', source: 'hardcover', source_id: '1' }, {}, memCache()))
      .toEqual({ error: 'UNSUPPORTED' })
  })

  it('batches TMDB whole-show seasons through append_to_response', async () => {
    const urls = []
    vi.stubGlobal('fetch', async (url) => {
      urls.push(String(url))
      if (!String(url).includes('append_to_response')) {
        return { json: async () => ({ seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }] }) }
      }
      return { json: async () => ({
        'season/1': { episodes: [{ season_number: 1, episode_number: 1, name: 'Pilot', air_date: '2010-01-01' }] },
        'season/2': { episodes: [{ season_number: 2, episode_number: 1, name: 'Return', air_date: '2011-01-01' }] },
      }) }
    })
    const settings = { tmdbKey: 'k' }
    const res = await getEpisodes({ category: 'tv', source: 'tmdb', source_id: '1399' }, settings, memCache())
    expect(res.episodes.map(e => e.title)).toEqual(['Pilot', 'Return'])
    expect(urls[1]).toContain('append_to_response=season/1,season/2')
  })
})
