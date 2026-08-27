import { describe, it, expect } from 'vitest'
import { detectSeries, titleKeys } from '../../electron/ai/seriesDetect.js'

let nextId = 1
function entry(title, category = 'movie') {
  return { id: nextId++, title, category }
}

describe('titleKeys', () => {
  it('strips volume/season/part markers', () => {
    expect([...titleKeys('Vagabond, Vol. 3').stripped]).toContain('vagabond')
    expect([...titleKeys('Attack on Titan Season 2').stripped]).toContain('attack on titan')
    expect([...titleKeys('The Godfather Part II').stripped]).toContain('godfather')
  })

  it('strips a short bare trailing number but not a year-like title', () => {
    expect([...titleKeys('Toy Story 3').stripped]).toContain('toy story')
    expect(titleKeys('1984').stripped.size).toBe(0)
    expect(titleKeys('Blade Runner 2049').stripped.size).toBe(0)
  })

  it('strips trailing roman numerals of 2+ characters', () => {
    expect([...titleKeys('Rocky III').stripped]).toContain('rocky')
  })

  it('derives a subtitle prefix only when it is substantial', () => {
    expect([...titleKeys('The Matrix: Reloaded').stripped]).toContain('matrix')
    expect(titleKeys('Mission: Impossible').stripped.size).toBe(0)
  })
})

describe('detectSeries — new series', () => {
  it('groups numbered installments with the unnumbered original', () => {
    const entries = [
      entry('Toy Story'),
      entry('Toy Story 2'),
      entry('Toy Story 3'),
      entry('Heat'),
    ]
    const out = detectSeries({ entries })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Toy Story')
    expect(out[0].matchType).toBe('new')
    expect(out[0].entryIds).toHaveLength(3)
  })

  it('groups subtitled sequels', () => {
    const entries = [
      entry('The Matrix'),
      entry('The Matrix: Reloaded'),
    ]
    const out = detectSeries({ entries })
    expect(out).toHaveLength(1)
    expect(out[0].entryIds).toHaveLength(2)
  })

  it('does not group two identical standalone titles (no marker evidence)', () => {
    const entries = [entry('Dune'), entry('Dune')]
    expect(detectSeries({ entries })).toHaveLength(0)
  })

  it('does not group unrelated titles', () => {
    const entries = [entry('Heat'), entry('Alien'), entry('1984', 'book')]
    expect(detectSeries({ entries })).toHaveLength(0)
  })

  it('keeps categories separate', () => {
    const entries = [
      entry('Dune Part 1', 'movie'),
      entry('Dune Part 2', 'book'),
    ]
    expect(detectSeries({ entries })).toHaveLength(0)
  })
})

describe('detectSeries — existing series', () => {
  it('suggests attaching strays to a matching existing series', () => {
    const entries = [entry('Vagabond, Vol. 12', 'manga')]
    const existingSeries = [{ id: 7, name: 'Vagabond', category: 'manga' }]
    const out = detectSeries({ entries, existingSeries })
    expect(out).toHaveLength(1)
    expect(out[0].matchType).toBe('existing')
    expect(out[0].seriesId).toBe(7)
    expect(out[0].entryIds).toHaveLength(1)
  })

  it('prefers the existing series over proposing a duplicate new one', () => {
    const entries = [
      entry('One Piece, Vol. 1', 'manga'),
      entry('One Piece, Vol. 2', 'manga'),
    ]
    const existingSeries = [{ id: 3, name: 'One Piece', category: 'manga' }]
    const out = detectSeries({ entries, existingSeries })
    expect(out).toHaveLength(1)
    expect(out[0].matchType).toBe('existing')
    expect(out[0].seriesId).toBe(3)
    expect(out[0].entryIds).toHaveLength(2)
  })
})
