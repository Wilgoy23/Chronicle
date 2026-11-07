import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getBookSeriesMembers, getAniListSeriesMembers, getMovieSeriesMembers,
  getTvSeriesMembers, getGameSeriesMembers, getSeriesMembers,
} from '../../electron/seriesLookup.js'

const json = (body) => ({ json: async () => body })

// ── Books ────────────────────────────────────────────────────────────────────

describe('getBookSeriesMembers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requires a token', async () => {
    expect(await getBookSeriesMembers(1, '')).toEqual({ error: 'NO_TOKEN' })
  })

  it('keeps the picked book, orders by position, and marks extras optional', async () => {
    vi.stubGlobal('fetch', async () => json({ data: { books: [{ id: 2, book_series: [{
      position: 2,
      series: { id: 9, name: 'The Expanse', book_series: [
        { position: 2,   book: { id: 2, title: "Caliban's War", release_date: '2012-06-26', image: { url: 'b.jpg' } } },
        { position: 1,   book: { id: 1, title: 'Leviathan Wakes', release_date: '2011-06-02', image: null } },
        { position: 1.5, book: { id: 5, title: 'Gods of Risk', release_date: '2012-09-01' } },
        { position: 1,   book: { id: 1, title: 'Leviathan Wakes (dupe edge)' } },
      ] },
    }] }] } }))
    const res = await getBookSeriesMembers(2, 'tok')
    expect(res.seriesName).toBe('The Expanse')
    expect(res.members.map(m => m.source_id)).toEqual([1, 5, 2])
    expect(res.members.find(m => m.source_id === 5).optional).toBe(true)
    expect(res.members.find(m => m.source_id === 2).optional).toBe(false)
  })

  it('reports NOT_IN_SERIES for a standalone book', async () => {
    vi.stubGlobal('fetch', async () => json({ data: { books: [{ id: 1, book_series: [] }] } }))
    expect(await getBookSeriesMembers(1, 'tok')).toEqual({ error: 'NOT_IN_SERIES' })
  })
})

// ── AniList ──────────────────────────────────────────────────────────────────

function media(id, year, edges = [], extra = {}) {
  return {
    id, type: 'ANIME', status: 'FINISHED', episodes: 12,
    title: { english: `S${id}`, romaji: `R${id}` }, coverImage: { medium: null },
    startDate: { year, month: 1, day: 1 }, relations: { edges }, ...extra,
  }
}
const edge = (relationType, node) => ({ relationType, node })

describe('getAniListSeriesMembers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('walks prequels and sequels from the middle and orders by start date', async () => {
    const db = {
      1: media(1, 2013, [edge('SEQUEL', media(2, 2017))]),
      2: media(2, 2017, [edge('PREQUEL', media(1, 2013)), edge('SEQUEL', media(3, 2019)),
                         edge('SIDE_STORY', media(7, 2018))]),
      3: media(3, 2019, [edge('PREQUEL', media(2, 2017))]),
    }
    const calls = []
    vi.stubGlobal('fetch', async (_u, opts) => {
      const id = JSON.parse(opts.body).variables.id
      calls.push(id)
      return json({ data: { Media: db[id] } })
    })
    const res = await getAniListSeriesMembers(2, 'ANIME', { gapMs: 0 })
    expect(res.members.map(m => m.source_id)).toEqual([1, 2, 3, 7])
    expect(res.members.slice(0, 3).map(m => m.position)).toEqual([1, 2, 3])
    expect(res.members[3]).toMatchObject({ optional: true, relation: 'Side story' })
    expect(res.seriesName).toBe('S1')
    expect(calls.sort()).toEqual([1, 2, 3]) // side story is listed, not walked
  })

  it('terminates on a relation cycle', async () => {
    vi.stubGlobal('fetch', async (_u, opts) => {
      const id = JSON.parse(opts.body).variables.id
      const other = id === 1 ? 2 : 1
      return json({ data: { Media: media(id, 2000 + id, [
        edge('SEQUEL', media(other, 2000 + other)),
        edge('PREQUEL', media(other, 2000 + other)),
      ]) } })
    })
    const res = await getAniListSeriesMembers(1, 'ANIME', { gapMs: 0 })
    expect(res.members.map(m => m.source_id)).toEqual([1, 2])
  })

  it('ignores relations of the other media type', async () => {
    vi.stubGlobal('fetch', async () => json({ data: { Media: media(1, 2010, [
      edge('SEQUEL', { ...media(2, 2012), type: 'MANGA' }),
    ]) } }))
    const res = await getAniListSeriesMembers(1, 'ANIME', { gapMs: 0 })
    expect(res.members.map(m => m.source_id)).toEqual([1])
  })

  it('surfaces API errors', async () => {
    vi.stubGlobal('fetch', async () => json({ errors: [{ message: 'Too Many Requests' }] }))
    expect(await getAniListSeriesMembers(1, 'ANIME', { gapMs: 0 })).toEqual({ error: 'Too Many Requests' })
  })
})

// ── Movies ───────────────────────────────────────────────────────────────────

describe('getMovieSeriesMembers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the collection in release order without the "Collection" suffix', async () => {
    vi.stubGlobal('fetch', async (url) => url.includes('/collection/')
      ? json({ name: 'Alien Collection', parts: [
          { id: 2, title: 'Aliens', release_date: '1986-07-18' },
          { id: 1, title: 'Alien', release_date: '1979-05-25' },
          { id: 9, title: 'Alien: Untitled', release_date: '' },
        ] })
      : json({ belongs_to_collection: { id: 8091 } }))
    const res = await getMovieSeriesMembers(1, 'key')
    expect(res.seriesName).toBe('Alien')
    expect(res.members.map(m => m.source_id)).toEqual([1, 2, 9])
    expect(res.members[2].unreleased).toBe(true)
    expect(res.members.map(m => m.position)).toEqual([1, 2, 3])
  })

  it('reports NOT_IN_SERIES when the movie has no collection', async () => {
    vi.stubGlobal('fetch', async () => json({ belongs_to_collection: null }))
    expect(await getMovieSeriesMembers(1, 'key')).toEqual({ error: 'NOT_IN_SERIES' })
  })
})

// ── TV ───────────────────────────────────────────────────────────────────────

describe('getTvSeriesMembers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps seasons with release-checker ids and makes specials optional', async () => {
    vi.stubGlobal('fetch', async () => json({ name: 'Severance', poster_path: '/p.jpg', seasons: [
      { season_number: 2, name: 'Season 2', air_date: '2025-01-17', episode_count: 10 },
      { season_number: 0, name: 'Specials', air_date: null, episode_count: 1 },
      { season_number: 1, name: 'Season 1', air_date: '2022-02-18', episode_count: 9 },
    ] }))
    const res = await getTvSeriesMembers(42, 'key')
    expect(res.seriesName).toBe('Severance')
    expect(res.members.map(m => m.source_id)).toEqual(['42-s1', '42-s2', '42-s0'])
    expect(res.members[0]).toMatchObject({ title: 'Severance — Season 1', progress_total: 9, optional: false })
    expect(res.members[2]).toMatchObject({ optional: true, relation: 'Specials' })
  })
})

// ── Games ────────────────────────────────────────────────────────────────────

describe('getGameSeriesMembers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('includes the picked game alongside the rest of the series', async () => {
    vi.stubGlobal('fetch', async (url) => url.includes('/game-series')
      ? json({ results: [{ id: 1, name: 'Portal', released: '2007-10-09' }] })
      : json({ id: 2, name: 'Portal 2', released: '2011-04-18' }))
    const res = await getGameSeriesMembers(2, 'key')
    expect(res.seriesName).toBe('Portal 2')
    expect(res.members.map(m => m.source_id)).toEqual([1, 2])
  })
})

describe('getSeriesMembers', () => {
  it('rejects unknown categories', async () => {
    expect(await getSeriesMembers('podcast', 1)).toEqual({ error: 'UNSUPPORTED' })
  })
})
