import { describe, it, expect } from 'vitest'
import { parseQuery, sanitizeFilter, applyFilter, describeFilter } from '../../electron/ai/nlFilter.js'

const CATS = [
  { id: 'book',  label: 'Books' },
  { id: 'anime', label: 'Anime' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv',    label: 'TV Shows' },
  { id: 'game',  label: 'Games' },
]

const NOW = new Date('2026-08-26')

function parse(q, extra = {}) {
  return parseQuery(q, { categories: CATS, now: NOW, ...extra })
}

describe('parseQuery — categories', () => {
  it('detects a category from its synonyms', () => {
    expect(parse('films about war').category).toBe('movie')
    expect(parse('novels I loved').category).toBe('book')
    expect(parse('tv shows from 2020').category).toBe('tv')
  })

  it('leaves category null when none is named', () => {
    expect(parse('something cozy').category).toBeNull()
  })
})

describe('parseQuery — status', () => {
  it('maps backlog wording to planned', () => {
    expect(parse('games in my backlog').status).toBe('planned')
    expect(parse('books I want to read').status).toBe('planned')
  })

  it('maps finished wording to completed', () => {
    expect(parse('anime I finished').status).toBe('completed')
  })

  it('maps currently watching to in_progress', () => {
    expect(parse('shows I am currently watching').status).toBe('in_progress')
  })
})

describe('parseQuery — ratings', () => {
  it('parses "8+" and "or higher" as a minimum', () => {
    expect(parse('anime rated 8+').ratingMin).toBe(8)
    expect(parse('movies 7 or higher').ratingMin).toBe(7)
  })

  it('parses exact ratings', () => {
    const f = parse('books rated 9')
    expect(f.ratingMin).toBe(9)
    expect(f.ratingMax).toBe(9)
  })

  it('parses strict bounds with over/under', () => {
    expect(parse('games over 7').ratingMin).toBe(8)
    expect(parse('movies under 5').ratingMax).toBe(4)
  })

  it('maps sentiment shortcuts', () => {
    expect(parse('my favorite anime').ratingMin).toBe(8)
    expect(parse('highly rated movies').ratingMin).toBe(8)
    expect(parse('the worst games').ratingMax).toBe(4)
  })

  it('maps star scales onto 10', () => {
    expect(parse('5 star books').ratingMin).toBe(10)
    expect(parse('4 stars movies').ratingMin).toBe(8)
  })

  it('detects unrated', () => {
    expect(parse('unrated movies').unrated).toBe(true)
  })
})

describe('parseQuery — years', () => {
  it('treats bare years as consumption year when a verb is present', () => {
    const f = parse('movies I watched in 2023')
    expect(f.dateYearMin).toBe(2023)
    expect(f.dateYearMax).toBe(2023)
    expect(f.yearMin).toBeNull()
  })

  it('treats bare years as release year without a verb', () => {
    const f = parse('movies from 2019')
    expect(f.yearMin).toBe(2019)
    expect(f.yearMax).toBe(2019)
    expect(f.dateYearMin).toBeNull()
  })

  it('parses decades', () => {
    const f = parse('movies from the 90s')
    expect(f.yearMin).toBe(1990)
    expect(f.yearMax).toBe(1999)
  })

  it('parses "last year" relative to now', () => {
    const f = parse('anime I watched last year')
    expect(f.dateYearMin).toBe(2025)
    expect(f.dateYearMax).toBe(2025)
  })

  it('parses explicit ranges', () => {
    const f = parse('books between 2010 and 2015')
    expect(f.yearMin).toBe(2010)
    expect(f.yearMax).toBe(2015)
  })
})

describe('parseQuery — genres and residual text', () => {
  it('picks known genres out of the query', () => {
    const f = parse('romance anime rated 8+', { genres: ['Romance', 'Action'] })
    expect(f.genres).toEqual(['Romance'])
    expect(f.category).toBe('anime')
    expect(f.ratingMin).toBe(8)
  })

  it('leaves the thematic remainder as semantic text', () => {
    const f = parse('cozy books about found family')
    expect(f.category).toBe('book')
    expect(f.text).toContain('cozy')
    expect(f.text).toContain('found family')
    expect(f.text).not.toContain('about')
  })

  it('produces no residual text for pure filter queries', () => {
    expect(parse('anime rated 8+').text).toBe('')
    expect(parse('movies I watched last year').text).toBe('')
  })
})

describe('applyFilter', () => {
  const entries = [
    { id: 1, category: 'anime', status: 'completed', rating: 9,   year: 2020, date_read: '2025-03-01', genres: 'Action, Drama' },
    { id: 2, category: 'anime', status: 'planned',   rating: null, year: 2023, date_read: null, created_at: '2026-01-05 10:00:00', genres: 'Romance' },
    { id: 3, category: 'movie', status: 'completed', rating: 6,   year: 1994, date_read: '2024-07-15', genres: '' },
  ]

  it('filters by category, status, and rating', () => {
    const f = parse('completed anime rated 8+')
    expect(applyFilter(entries, f).map(e => e.id)).toEqual([1])
  })

  it('filters by consumption year using date_read', () => {
    const f = parse('anime I watched last year')
    expect(applyFilter(entries, f).map(e => e.id)).toEqual([1])
  })

  it('falls back to created_at when date_read is missing', () => {
    const f = parse('anime I added this year')
    expect(applyFilter(entries, f).map(e => e.id)).toEqual([2])
  })

  it('filters by release decade', () => {
    const f = parse('movies from the 90s')
    expect(applyFilter(entries, f).map(e => e.id)).toEqual([3])
  })

  it('filters unrated entries', () => {
    const f = parse('unrated anime')
    expect(applyFilter(entries, f).map(e => e.id)).toEqual([2])
  })

  it('filters by genre', () => {
    const f = parseQuery('romance anime', { categories: CATS, genres: ['Romance'], now: NOW })
    expect(applyFilter(entries, f).map(e => e.id)).toEqual([2])
  })
})

describe('sanitizeFilter (LLM output)', () => {
  const opts = { categories: CATS, genres: ['Sci-Fi', 'Comedy'] }

  it('rejects non-object input', () => {
    expect(sanitizeFilter(null, opts)).toBeNull()
    expect(sanitizeFilter('nope', opts)).toBeNull()
  })

  it('drops unknown categories, statuses and genres', () => {
    const f = sanitizeFilter(
      { category: 'podcast', status: 'abandoned', genres: ['Sci-Fi', 'Nonsense'] }, opts)
    expect(f.category).toBeNull()
    expect(f.status).toBeNull()
    expect(f.genres).toEqual(['Sci-Fi'])
  })

  it('matches known genres case-insensitively and restores canonical casing', () => {
    expect(sanitizeFilter({ genres: ['sci-fi'] }, opts).genres).toEqual(['Sci-Fi'])
  })

  it('clamps out-of-range ratings into the 1-10 scale', () => {
    // 10 is a real minimum ("only perfect scores"), so it survives — unlike a
    // ratingMax of 10, which constrains nothing. Rounding handles fractions.
    expect(sanitizeFilter({ ratingMin: 42 }, opts).ratingMin).toBe(10)
    expect(sanitizeFilter({ ratingMin: 7.4 }, opts).ratingMin).toBe(7)
    expect(sanitizeFilter({ ratingMax: -5 }, opts).ratingMax).toBe(1)
  })

  it('treats edge-of-scale bounds as absent so unrated entries are not hidden', () => {
    // A ratingMax of 10 filters nothing by value, but any non-null bound also
    // excludes unrated entries — so it must not survive sanitization.
    expect(sanitizeFilter({ ratingMax: 10 }, opts).ratingMax).toBeNull()
    expect(sanitizeFilter({ ratingMin: 1 }, opts).ratingMin).toBeNull()
  })

  it('keeps unrated entries visible when the LLM returns a redundant ratingMax', () => {
    const entries = [
      { id: 1, category: 'movie', status: 'completed', rating: 9,    year: 2010, genres: '' },
      { id: 2, category: 'movie', status: 'planned',   rating: null, year: 2011, genres: '' },
    ]
    const f = sanitizeFilter({ category: 'movie', ratingMax: 10 }, opts)
    expect(applyFilter(entries, f).map(e => e.id)).toEqual([1, 2])
  })

  it('ignores non-array genres and non-string text', () => {
    const f = sanitizeFilter({ genres: 'Sci-Fi', text: 42 }, opts)
    expect(f.genres).toEqual([])
    expect(f.text).toBe('')
  })

  it('truncates an overlong text phrase', () => {
    expect(sanitizeFilter({ text: 'x'.repeat(500) }, opts).text).toHaveLength(200)
  })
})

describe('describeFilter', () => {
  it('renders human-readable chips', () => {
    const chips = describeFilter(parse('completed anime rated 8+'), CATS)
    expect(chips).toContain('Anime')
    expect(chips).toContain('Completed')
    expect(chips).toContain('rating ≥ 8')
  })
})
