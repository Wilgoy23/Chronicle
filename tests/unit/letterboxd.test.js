import { describe, it, expect } from 'vitest'
import { mapLetterboxd, letterboxdDate } from '../../electron/importers/letterboxd.js'

const HEADER = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date'

describe('letterboxdDate', () => {
  it('passes a real date through unchanged', () => {
    expect(letterboxdDate('2023-05-12')).toBe('2023-05-12')
  })
  it('returns null for blank input', () => {
    expect(letterboxdDate('')).toBeNull()
  })
})

describe('mapLetterboxd', () => {
  it('maps title, rating, dates, year, and rewatch/tags into a chronicle-export shape', () => {
    const csv = `${HEADER}\n2023-01-05,Dune,2021,https://boxd.it/x,4.5,No,sci-fi,2023-01-01`
    const data = mapLetterboxd(csv)
    expect(data.format).toBe('chronicle-export')
    expect(data.entries).toEqual([{
      category:   'movie',
      title:      'Dune',
      status:     'completed',
      rating:     9,
      notes:      '(2021) — Tags: sci-fi',
      date_read:  '2023-01-01',
      created_at: '2023-01-05 00:00:00',
    }])
  })

  it('every diary row is a watch, so status is always completed', () => {
    const csv = `${HEADER}\n2023-01-05,Dune,2021,https://boxd.it/x,,No,,2023-01-01`
    expect(mapLetterboxd(csv).entries[0].status).toBe('completed')
  })

  it('treats a blank rating as unrated (null)', () => {
    const csv = `${HEADER}\n2023-01-05,Dune,2021,https://boxd.it/x,,No,,2023-01-01`
    expect(mapLetterboxd(csv).entries[0].rating).toBeNull()
  })

  it('converts the 0.5-5 star scale to Chronicle\'s 1-10 scale', () => {
    const csv = `${HEADER}\n2023-01-05,Dune,2021,https://boxd.it/x,5,No,,2023-01-01`
    expect(mapLetterboxd(csv).entries[0].rating).toBe(10)
    const half = `${HEADER}\n2023-01-05,Dune,2021,https://boxd.it/x,0.5,No,,2023-01-01`
    expect(mapLetterboxd(half).entries[0].rating).toBe(1)
  })

  it('marks a rewatch in notes', () => {
    const csv = `${HEADER}\n2023-01-05,Dune,2021,https://boxd.it/x,4,Yes,,2023-01-01`
    expect(mapLetterboxd(csv).entries[0].notes).toContain('Rewatch')
  })

  it('falls back to the diary log Date when Watched Date is blank', () => {
    const csv = `${HEADER}\n2023-01-05,Dune,2021,https://boxd.it/x,4,No,,`
    expect(mapLetterboxd(csv).entries[0].date_read).toBe('2023-01-05')
  })

  it('skips rows with no title', () => {
    const csv = `${HEADER}\n2023-01-05,,2021,https://boxd.it/x,4,No,,2023-01-01`
    expect(mapLetterboxd(csv).entries).toHaveLength(0)
  })
})
