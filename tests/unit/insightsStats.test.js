import { describe, it, expect } from 'vitest'
import { computeStats, getYear } from '../../src/insightsStats.js'

const CATS = [
  { id: 'book',  label: 'Books',  color: '#e8a838' },
  { id: 'anime', label: 'Anime',  color: '#c084fc' },
  { id: 'movie', label: 'Movies', color: '#38bdf8' },
  { id: 'game',  label: 'Games',  color: '#4ade80' },
]

// Fixed "now" so this-year / last-year assertions are stable.
const NOW = new Date('2026-06-15T00:00:00Z')

const DATASET = [
  { category: 'book',  status: 'completed',   rating: 8,    date_read: '2026-01-10' },
  { category: 'book',  status: 'completed',   rating: 6,    date_read: '2025-11-02' },
  { category: 'anime', status: 'completed',   rating: 10,   date_read: '2026-03-20' },
  { category: 'anime', status: 'in_progress', rating: null, date_read: null },
  { category: 'movie', status: 'planned',     rating: null, date_read: null },
  { category: 'game',  status: 'completed',   rating: 4,    date_read: '2024-07-01' },
  // completed but no date → counts as completed, but not in any year bucket
  { category: 'game',  status: 'completed',   rating: null, created_at: null },
]

describe('getYear', () => {
  it('prefers date_read', () => {
    expect(getYear({ date_read: '2026-01-10', created_at: '2020-01-01' })).toBe('2026')
  })
  it('falls back to created_at', () => {
    expect(getYear({ date_read: null, created_at: '2023-05-05 12:00:00' })).toBe('2023')
  })
  it('returns null when neither is present', () => {
    expect(getYear({ date_read: null, created_at: null })).toBeNull()
  })
})

describe('computeStats', () => {
  const s = computeStats(DATASET, CATS, NOW)

  it('counts totals and statuses', () => {
    expect(s.total).toBe(7)
    expect(s.completed).toBe(5)
    expect(s.inProgress).toBe(1)
    expect(s.planned).toBe(1)
  })

  it('buckets completed entries per year (dated only), sorted ascending', () => {
    expect(s.perYear).toEqual([
      { year: '2024', count: 1 },
      { year: '2025', count: 1 },
      { year: '2026', count: 2 },
    ])
  })

  it('compares this year vs last year completed counts', () => {
    expect(s.thisYearLabel).toBe('2026')
    expect(s.lastYearLabel).toBe('2025')
    expect(s.thisYear).toBe(2)
    expect(s.lastYear).toBe(1)
  })

  it('builds a 10-bin rating distribution', () => {
    expect(s.ratingDist).toHaveLength(10)
    const byRating = Object.fromEntries(s.ratingDist.map(d => [d.rating, d.count]))
    expect(byRating[8]).toBe(1)
    expect(byRating[6]).toBe(1)
    expect(byRating[10]).toBe(1)
    expect(byRating[4]).toBe(1)
    expect(byRating[5]).toBe(0)
  })

  it('averages ratings per category, sorted high to low, ignoring unrated', () => {
    expect(s.perCategory).toEqual([
      { id: 'anime', label: 'Anime', color: '#c084fc', avg: 10, count: 1 },
      { id: 'book',  label: 'Books', color: '#e8a838', avg: 7,  count: 2 },
      { id: 'game',  label: 'Games', color: '#4ade80', avg: 4,  count: 1 },
    ])
    // movie has no ratings → excluded
    expect(s.perCategory.find(c => c.id === 'movie')).toBeUndefined()
  })

  it('computes overall average across all rated entries', () => {
    // ratings: 8, 6, 10, 4 → 28 / 4 = 7
    expect(s.avgOverall).toBe(7)
  })

  it('returns null overall average when nothing is rated', () => {
    const empty = computeStats([{ category: 'book', status: 'planned', rating: null }], CATS, NOW)
    expect(empty.avgOverall).toBeNull()
    expect(empty.perCategory).toEqual([])
  })
})
