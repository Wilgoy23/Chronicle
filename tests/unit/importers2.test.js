import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mapAniList, fetchAniList, fuzzyDate } from '../../electron/importers/anilist.js'
import { mapStoryGraph, storygraphDate } from '../../electron/importers/storygraph.js'
import { mapGoodreads, splitSeriesTitle } from '../../electron/importers/goodreads.js'
import { mapLetterboxd, mapLetterboxdFiles, letterboxdKind } from '../../electron/importers/letterboxd.js'
import { initDb, importData, getEntries, getLogs, addEntry } from '../../electron/db.js'

// ── AniList ────────────────────────────────────────────────────

const media = (over = {}) => ({
  id: 21, title: { romaji: 'One Piece', english: null }, coverImage: { medium: 'c.jpg' },
  episodes: null, chapters: null, genres: ['Action', 'Adventure', 'Comedy', 'Drama'],
  startDate: { year: 1999 }, description: '<b>Pirates</b>', ...over,
})

describe('mapAniList', () => {
  it('maps a list entry with source linkage, progress, score and dates', () => {
    const data = mapAniList({
      anime: { lists: [{ isCustomList: false, entries: [{
        status: 'COMPLETED', score: 9, progress: 12, repeat: 0, notes: 'great',
        completedAt: { year: 2023, month: 4, day: 2 }, createdAt: 1672531200,
        media: media({ id: 1, title: { romaji: 'Shingeki', english: 'Attack on Titan' }, episodes: 25 }),
      }] }] },
    })
    expect(data.entries).toEqual([expect.objectContaining({
      category: 'anime', title: 'Attack on Titan', status: 'completed', rating: 9,
      notes: 'great', source: 'anilist', source_id: '1', progress: 12, progress_total: 25,
      date_read: '2023-04-02', created_at: '2023-01-01 00:00:00', genres: 'Action, Adventure, Comedy',
      year: 1999, description: 'Pirates',
    })])
  })

  it('maps statuses like the MAL importer and treats score 0 as unrated', () => {
    const entries = ['CURRENT', 'PAUSED', 'DROPPED', 'PLANNING', 'REPEATING'].map((status, i) => ({
      status, score: 0, progress: 0, media: media({ id: 100 + i, title: { english: `T${i}` } }),
    }))
    const data = mapAniList({ anime: { lists: [{ isCustomList: false, entries }] } })
    expect(data.entries.map(e => e.status)).toEqual(['in_progress', 'in_progress', 'completed', 'planned', 'in_progress'])
    expect(data.entries.every(e => e.rating === null)).toBe(true)
  })

  it('only sets date_read for completed entries', () => {
    const data = mapAniList({ manga: { lists: [{ isCustomList: false, entries: [{
      status: 'CURRENT', score: 7, progress: 50, completedAt: { year: 2020 },
      media: media({ chapters: null }),
    }] }] } })
    expect(data.entries[0]).toMatchObject({ category: 'manga', date_read: null, progress: 50, progress_total: null })
  })

  it('takes each media once, preferring the status list over a custom list', () => {
    const item = (status) => ({ status, score: 0, progress: 0, media: media() })
    const data = mapAniList({ anime: { lists: [
      { isCustomList: true,  entries: [item('PLANNING')] },
      { isCustomList: false, entries: [item('CURRENT')] },
    ] } })
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].status).toBe('in_progress')
  })

  it('turns the repeat count into undated logs keyed to the entry', () => {
    const data = mapAniList({ anime: { lists: [{ isCustomList: false, entries: [{
      status: 'COMPLETED', score: 10, progress: 1, repeat: 2, media: media(),
    }] }] } })
    expect(data.logs).toHaveLength(2)
    expect(data.logs.every(l => l.entry_id === data.entries[0].id && l.date === null)).toBe(true)
  })

  it('fuzzyDate pads partial dates and rejects missing years', () => {
    expect(fuzzyDate({ year: 2020, month: 3 })).toBe('2020-03-01')
    expect(fuzzyDate({ year: null })).toBeNull()
    expect(fuzzyDate(null)).toBeNull()
  })
})

describe('fetchAniList', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('accepts a profile URL and queries both list types', async () => {
    const seen = []
    vi.stubGlobal('fetch', async (_url, opts) => {
      const { variables } = JSON.parse(opts.body)
      seen.push(variables)
      return { json: async () => ({ data: { MediaListCollection: { lists: [] } } }) }
    })
    await fetchAniList('https://anilist.co/user/someone/animelist')
    expect(seen).toEqual([{ name: 'someone', type: 'ANIME' }, { name: 'someone', type: 'MANGA' }])
  })

  it('turns a not-found error into a readable message', async () => {
    vi.stubGlobal('fetch', async () => ({ json: async () => ({ errors: [{ message: 'Not Found.', status: 404 }] }) }))
    await expect(fetchAniList('nobody')).rejects.toThrow(/No AniList user named "nobody"/)
  })

  it('rejects an empty username', async () => {
    await expect(fetchAniList('  ')).rejects.toThrow(/username/)
  })
})

// ── StoryGraph ─────────────────────────────────────────────────

const SG_HEADER = 'Title,Authors,Read Status,Star Rating,Last Date Read,Date Added,Read Count,Review,Tags'

describe('mapStoryGraph', () => {
  it('maps status, quarter-star ratings, authors, review and tags', () => {
    const csv = `${SG_HEADER}\nPiranesi,Susanna Clarke,read,4.25,2023/05/12,2023/01/01,1,Loved it,fantasy`
    const [e] = mapStoryGraph(csv).entries
    expect(e).toMatchObject({
      category: 'book', title: 'Piranesi', status: 'completed', rating: 9,
      notes: 'By Susanna Clarke\n\nLoved it', genres: 'fantasy',
      date_read: '2023-05-12', created_at: '2023-01-01 00:00:00',
    })
  })

  it('maps every read status', () => {
    const rows = ['read', 'currently-reading', 'paused', 'to-read', 'did-not-finish']
      .map((s, i) => `B${i},A,${s},,,,,,`).join('\n')
    expect(mapStoryGraph(`${SG_HEADER}\n${rows}`).entries.map(e => e.status))
      .toEqual(['completed', 'in_progress', 'in_progress', 'planned', 'completed'])
  })

  it('adds re-read logs for a read count above one', () => {
    const data = mapStoryGraph(`${SG_HEADER}\nDune,Frank Herbert,read,5,2023/05/12,,3,,`)
    expect(data.logs).toHaveLength(2)
    expect(data.logs[0].entry_id).toBe(data.entries[0].id)
  })

  it('matches headers case-insensitively', () => {
    const csv = 'title,AUTHORS,read status\nX,Y,to-read'
    expect(mapStoryGraph(csv).entries[0]).toMatchObject({ title: 'X', status: 'planned', notes: 'By Y' })
  })

  it('storygraphDate accepts slashes or dashes', () => {
    expect(storygraphDate('2023/5/2')).toBe('2023-05-02')
    expect(storygraphDate('2023-05-02')).toBe('2023-05-02')
    expect(storygraphDate('')).toBeNull()
  })
})

// ── Goodreads (7.4 additions) ──────────────────────────────────

describe('Goodreads series, year, pages, shelves and re-reads', () => {
  const HEADER = 'Title,Author,My Rating,Date Read,Date Added,Exclusive Shelf,Bookshelves,Number of Pages,Original Publication Year,Read Count'

  it('splits "Title (Series, #N)"', () => {
    expect(splitSeriesTitle('The Way of Kings (The Stormlight Archive, #1)'))
      .toEqual({ title: 'The Way of Kings', series: 'The Stormlight Archive' })
    expect(splitSeriesTitle('Words of Radiance (The Stormlight Archive #2)'))
      .toEqual({ title: 'Words of Radiance', series: 'The Stormlight Archive' })
    expect(splitSeriesTitle('Edgedancer (The Stormlight Archive, #2.5)').series).toBe('The Stormlight Archive')
    expect(splitSeriesTitle('Dune')).toEqual({ title: 'Dune', series: null })
    expect(splitSeriesTitle('Surely You\'re Joking (Adventures of a Curious Character)').series).toBeNull()
  })

  it('maps the extra columns and declares the series', () => {
    const csv = `${HEADER}\n"The Way of Kings (The Stormlight Archive, #1)",Brandon Sanderson,5,2022/01/01,2021/12/01,read,"read, favorites, epic",1007,2010,2`
    const data = mapGoodreads(csv)
    expect(data.entries[0]).toMatchObject({
      title: 'The Way of Kings', series: 'The Stormlight Archive', year: 2010,
      progress_total: 1007, genres: 'favorites, epic',
    })
    expect(data.series).toEqual([{ category: 'book', name: 'The Stormlight Archive' }])
    expect(data.logs).toEqual([{ entry_id: data.entries[0].id, date: null, rating: null, notes: 'Imported re-read' }])
  })
})

// ── Letterboxd (7.4 additions) ─────────────────────────────────

describe('Letterboxd multi-file + rewatches', () => {
  const DIARY = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date'

  it('collapses repeat diary rows into one entry plus re-watch logs', () => {
    const csv = [
      DIARY,
      '2024-02-01,Heat,1995,https://boxd.it/h,5,Yes,,2024-02-01',
      '2020-06-01,Heat,1995,https://boxd.it/h,4,No,,2020-06-01',
    ].join('\n')
    const data = mapLetterboxd(csv)
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0]).toMatchObject({ title: 'Heat', date_read: '2020-06-01', rating: 8, year: 1995 })
    expect(data.logs).toEqual([{ entry_id: data.entries[0].id, date: '2024-02-01', rating: 10, notes: '' }])
  })

  it('infers the file kind from its name', () => {
    expect(letterboxdKind('C:\\x\\watchlist.csv')).toBe('watchlist')
    expect(letterboxdKind('/x/ratings.csv')).toBe('ratings')
    expect(letterboxdKind('watched.csv')).toBe('watched')
    expect(letterboxdKind('diary.csv')).toBe('diary')
    expect(letterboxdKind('something.csv')).toBe('diary')
  })

  it('maps watchlist to planned and ratings to rated completions', () => {
    const data = mapLetterboxdFiles([
      { kind: 'watchlist', text: 'Date,Name,Year,Letterboxd URI\n2024-01-01,Arrival,2016,u' },
      { kind: 'ratings',   text: 'Date,Name,Year,Letterboxd URI,Rating\n2023-01-01,Alien,1979,u,4.5' },
    ])
    // Ratings are processed before the watchlist.
    expect(data.entries.map(e => [e.title, e.status, e.rating])).toEqual([
      ['Alien', 'completed', 9], ['Arrival', 'planned', null],
    ])
  })
})

// ── importData: source-id dedupe + logs from importers ─────────

describe('importData with importer payloads', () => {
  beforeEach(() => initDb(':memory:'))

  it('skips an entry whose source + source_id is already in the library, even under another title', () => {
    addEntry({ category: 'anime', title: 'Shingeki no Kyojin', source: 'anilist', source_id: '16498' })
    const res = importData({
      format: 'chronicle-export', version: 1,
      entries: [{ category: 'anime', title: 'Attack on Titan', source: 'anilist', source_id: '16498' }],
    })
    expect(res).toMatchObject({ imported: 0, skipped: 1 })
  })

  it('attaches importer logs to the right new entries', () => {
    const data = mapAniList({ anime: { lists: [{ isCustomList: false, entries: [
      { status: 'COMPLETED', score: 8, progress: 1, repeat: 1, media: media({ id: 5, title: { english: 'A' } }) },
      { status: 'COMPLETED', score: 8, progress: 1, repeat: 0, media: media({ id: 6, title: { english: 'B' } }) },
    ] }] } })
    const res = importData(data)
    expect(res).toMatchObject({ imported: 2, logsImported: 1 })
    const a = getEntries('anime').find(e => e.title === 'A')
    expect(getLogs(a.id)).toHaveLength(1)
    expect(a.log_count).toBe(1)
  })

  it('creates series declared by the Goodreads mapper and links entries to them', () => {
    const csv = 'Title,Author,My Rating,Date Read,Date Added,Exclusive Shelf\n"Mistborn (Mistborn, #1)",B,4,,,read'
    importData(mapGoodreads(csv))
    const [e] = getEntries('book')
    expect(e).toMatchObject({ title: 'Mistborn', series: 'Mistborn' })
  })
})
