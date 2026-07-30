import { describe, it, expect } from 'vitest'
import { mapGoodreads, goodreadsDate } from '../../electron/importers/goodreads.js'

const HEADER = 'Title,Author,My Rating,Date Read,Date Added,Exclusive Shelf'

describe('goodreadsDate', () => {
  it('converts yyyy/MM/dd to yyyy-MM-dd', () => {
    expect(goodreadsDate('2023/05/12')).toBe('2023-05-12')
  })
  it('returns null for blank/malformed input', () => {
    expect(goodreadsDate('')).toBeNull()
    expect(goodreadsDate('not a date')).toBeNull()
  })
})

describe('mapGoodreads', () => {
  it('maps title, author, rating, date, and shelf into a chronicle-export shape', () => {
    const csv = `${HEADER}\nDune,Frank Herbert,4,2023/05/12,2023/01/01,read`
    const data = mapGoodreads(csv)
    expect(data.format).toBe('chronicle-export')
    expect(data.entries).toEqual([{
      category:   'book',
      title:      'Dune',
      status:     'completed',
      rating:     8,
      notes:      'By Frank Herbert',
      date_read:  '2023-05-12',
      created_at: '2023-01-01 00:00:00',
    }])
  })

  it('maps the "currently-reading" and "to-read" shelves to in_progress/planned', () => {
    const csv = `${HEADER}\nBook A,X,0,,2023/01/01,currently-reading\nBook B,Y,0,,2023/01/01,to-read`
    const data = mapGoodreads(csv)
    expect(data.entries.map(e => e.status)).toEqual(['in_progress', 'planned'])
  })

  it('treats a 0 (unrated) star rating as null, not 0', () => {
    const csv = `${HEADER}\nBook,Author,0,,2023/01/01,read`
    expect(mapGoodreads(csv).entries[0].rating).toBeNull()
  })

  it('converts the 1-5 star scale to Chronicle\'s 1-10 scale', () => {
    const csv = `${HEADER}\nBook,Author,5,,2023/01/01,read`
    expect(mapGoodreads(csv).entries[0].rating).toBe(10)
  })

  it('skips rows with no title', () => {
    const csv = `${HEADER}\n,Author,4,2023/05/12,2023/01/01,read`
    expect(mapGoodreads(csv).entries).toHaveLength(0)
  })

  it('leaves date_read null when Date Read is blank (still counts as completed)', () => {
    const csv = `${HEADER}\nDune,Frank Herbert,4,,2023/01/01,read`
    const entry = mapGoodreads(csv).entries[0]
    expect(entry.status).toBe('completed')
    expect(entry.date_read).toBeNull()
  })
})
