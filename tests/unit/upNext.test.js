import { describe, it, expect } from 'vitest'
import { buildUpNext, isUpNextEmpty } from '../../src/upNext.js'

const NOW = Date.parse('2026-11-18T12:00:00Z')
let id = 0
const e = (over = {}) => ({
  id: ++id, category: 'book', title: `T${id}`, status: 'planned', series_id: null, series: null,
  year: null, date_read: null, last_activity: '2026-11-17 10:00:00', ...over,
})

describe('buildUpNext', () => {
  it('splits in-progress entries into active and stalled, most recent first', () => {
    const a = e({ status: 'in_progress', last_activity: '2026-11-10 10:00:00' })
    const b = e({ status: 'in_progress', last_activity: '2026-11-17 10:00:00' })
    const old = e({ status: 'in_progress', last_activity: '2026-08-01 10:00:00' })
    const u = buildUpNext([a, b, old, e({ status: 'completed' })], [], null, NOW)
    expect(u.active.map(x => x.id)).toEqual([b.id, a.id])
    expect(u.stalled.map(x => x.id)).toEqual([old.id])
  })

  it('suggests the earliest planned installment of a series you have finished part of', () => {
    const s = { series_id: 7, series: 'Stormlight' }
    const done = e({ ...s, status: 'completed', year: 2010, date_read: '2025-01-01' })
    const third = e({ ...s, status: 'planned', year: 2017 })
    const second = e({ ...s, status: 'planned', year: 2014 })
    const u = buildUpNext([done, third, second], [], null, NOW)
    expect(u.nextInSeries).toHaveLength(1)
    expect(u.nextInSeries[0]).toMatchObject({ seriesName: 'Stormlight', done: 1, total: 3 })
    expect(u.nextInSeries[0].entry.id).toBe(second.id)
  })

  it('falls back to insertion order when years are missing', () => {
    const s = { series_id: 8, series: 'S' }
    const done = e({ ...s, status: 'completed' })
    const first = e({ ...s, status: 'planned' })
    e({ ...s, status: 'planned' })
    const u = buildUpNext([done, first], [], null, NOW)
    expect(u.nextInSeries[0].entry.id).toBe(first.id)
  })

  it('skips series that are in progress, untouched, or fully done', () => {
    const inProg = [e({ series_id: 1, status: 'completed' }), e({ series_id: 1, status: 'in_progress' }), e({ series_id: 1 })]
    const untouched = [e({ series_id: 2 }), e({ series_id: 2 })]
    const finished = [e({ series_id: 3, status: 'completed' })]
    const u = buildUpNext([...inProg, ...untouched, ...finished], [], null, NOW)
    expect(u.nextInSeries).toEqual([])
  })

  it('splits releases into out now and coming soon, ignoring far-future and undated ones', () => {
    const rel = (id, date) => ({ id, category: 'tv', release_date: date })
    const u = buildUpNext([], [
      rel(1, '2026-11-01'), rel(2, '2026-12-01'), rel(3, '2027-06-01'), rel(4, null), rel(5, '2026-11-18'),
    ], null, NOW)
    expect(u.outNow.map(r => r.id)).toEqual([5, 1])
    expect(u.comingSoon.map(r => r.id)).toEqual([2])
  })

  it('hides disabled categories', () => {
    const u = buildUpNext(
      [e({ category: 'game', status: 'in_progress' })],
      [{ id: 1, category: 'game', release_date: '2026-11-01' }],
      new Set(['book']), NOW,
    )
    expect(isUpNextEmpty(u)).toBe(true)
  })
})
