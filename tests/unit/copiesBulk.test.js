import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDb, addEntry, updateEntry, getEntries, addSeries, getActivity,
  bulkUpdateEntries, deleteEntries, exportData, importData, addLog, getLogs,
} from '../../electron/db.js'
import { toCsv, CSV_COLUMNS } from '../../electron/csv.js'

beforeEach(() => initDb(':memory:'))

describe('copy and review fields (9.1, 9.3)', () => {
  it('stores format, platform, ownership and a review with its spoiler flag', () => {
    const e = addEntry({
      category: 'game', title: 'Hades', status: 'completed',
      format: 'Digital', platform: '  Nintendo Switch ', ownership: 'owned',
      review: ' Great loop ', review_spoilers: true,
    })
    expect(e).toMatchObject({
      format: 'digital', platform: 'Nintendo Switch', ownership: 'owned',
      review: 'Great loop', review_spoilers: 1,
    })
  })

  it('defaults everything to empty, with review_spoilers 0', () => {
    const e = addEntry({ category: 'book', title: 'Dune' })
    expect(e).toMatchObject({ format: null, platform: null, ownership: null, review: null, review_spoilers: 0 })
  })

  it('drops values outside the allowed sets', () => {
    const e = addEntry({ category: 'book', title: 'Dune', format: 'scroll', ownership: 'borrowed' })
    expect(e.format).toBeNull()
    expect(e.ownership).toBeNull()
  })

  it('updateEntry leaves copy fields alone when the caller omits them', () => {
    const e = addEntry({ category: 'book', title: 'Dune', format: 'audiobook', ownership: 'wishlist', review: 'Spice' })
    const u = updateEntry({ id: e.id, title: 'Dune', status: 'completed', rating: 9, notes: '' })
    expect(u).toMatchObject({ format: 'audiobook', ownership: 'wishlist', review: 'Spice', rating: 9 })
  })

  it('updateEntry clears a field sent as null', () => {
    const e = addEntry({ category: 'book', title: 'Dune', format: 'ebook', ownership: 'owned', review: 'x', review_spoilers: 1 })
    const u = updateEntry({ id: e.id, title: 'Dune', status: 'completed', format: null, ownership: null, review: null, review_spoilers: false })
    expect(u).toMatchObject({ format: null, ownership: null, review: null, review_spoilers: 0 })
  })

  it('round-trips through export and import, and into CSV', () => {
    addEntry({ category: 'book', title: 'Dune', format: 'physical', ownership: 'owned', review: 'Long', review_spoilers: 1 })
    const data = exportData()
    initDb(':memory:')
    expect(importData(data).imported).toBe(1)
    const [e] = getEntries('book')
    expect(e).toMatchObject({ format: 'physical', ownership: 'owned', review: 'Long', review_spoilers: 1 })

    const row = toCsv([e]).split('\r\n')[1].split(',')
    expect(row[CSV_COLUMNS.indexOf('format')]).toBe('physical')
    expect(row[CSV_COLUMNS.indexOf('review_spoilers')]).toBe('1')
  })

  it('imports older exports that have no copy fields', () => {
    const res = importData({ format: 'chronicle-export', version: 1, entries: [{ category: 'movie', title: 'Heat' }] })
    expect(res.imported).toBe(1)
    expect(getEntries('movie')[0]).toMatchObject({ format: null, ownership: null, review_spoilers: 0 })
  })
})

describe('bulkUpdateEntries (9.2)', () => {
  function seed() {
    return ['A', 'B', 'C'].map(t => addEntry({ category: 'book', title: t, status: 'planned', genres: 'Fantasy, Old' }))
  }

  it('changes status for every id and records one activity row each', () => {
    const [a, b, c] = seed()
    const res = bulkUpdateEntries({ ids: [a.id, b.id], status: 'completed' })
    expect(res.entries.map(e => e.status)).toEqual(['completed', 'completed'])
    expect(getActivity(a.id)[0]).toMatchObject({ status: 'completed', delta: 0 })
    expect(getActivity(c.id)).toHaveLength(0)
  })

  it('does not log activity when the status is already the target', () => {
    const [a] = seed()
    bulkUpdateEntries({ ids: [a.id], status: 'planned' })
    expect(getActivity(a.id)).toHaveLength(0)
  })

  it('ignores an unknown status but still applies the rest', () => {
    const [a] = seed()
    const res = bulkUpdateEntries({ ids: [a.id], status: 'abandoned', ownership: 'owned' })
    expect(res.entries[0]).toMatchObject({ status: 'planned', ownership: 'owned' })
  })

  it('adds and removes tags case-insensitively without duplicates', () => {
    const [a, b] = seed()
    const res = bulkUpdateEntries({ ids: [a.id, b.id], addTags: ['fantasy', 'Comfort'], removeTags: ['OLD'] })
    expect(res.entries.map(e => e.genres)).toEqual(['Fantasy, Comfort', 'Fantasy, Comfort'])
    const cleared = bulkUpdateEntries({ ids: [a.id], removeTags: ['fantasy', 'comfort'] })
    expect(cleared.entries[0].genres).toBeNull()
  })

  it('moves entries into a series of their own category and skips others', () => {
    const [a] = seed()
    const film = addEntry({ category: 'movie', title: 'Dune', status: 'planned' })
    const s = addSeries('book', 'Saga')
    const res = bulkUpdateEntries({ ids: [a.id, film.id], series_id: s.id })
    expect(res.skipped).toBe(1)
    expect(getEntries('book').find(e => e.id === a.id).series).toBe('Saga')
    expect(getEntries('movie')[0].series_id).toBeNull()
  })

  it('removes entries from their series with series_id null', () => {
    const s = addSeries('book', 'Saga')
    const e = addEntry({ category: 'book', title: 'X', series_id: s.id })
    expect(bulkUpdateEntries({ ids: [e.id], series_id: null }).entries[0].series_id).toBeNull()
  })

  it('rejects a series that does not exist', () => {
    const [a] = seed()
    expect(bulkUpdateEntries({ ids: [a.id], series_id: 999 })).toEqual({ error: 'SERIES_NOT_FOUND' })
  })

  it('sets and clears ownership, format and platform', () => {
    const g = addEntry({ category: 'game', title: 'Celeste' })
    expect(bulkUpdateEntries({ ids: [g.id], ownership: 'wishlist', format: 'physical', platform: 'PC' }).entries[0])
      .toMatchObject({ ownership: 'wishlist', format: 'physical', platform: 'PC' })
    expect(bulkUpdateEntries({ ids: [g.id], platform: null }).entries[0])
      .toMatchObject({ ownership: 'wishlist', format: 'physical', platform: null })
  })

  it('leaves untouched fields alone and skips missing ids', () => {
    const [a] = seed()
    updateEntry({ id: a.id, title: 'A', status: 'planned', rating: 7, notes: 'n' })
    const res = bulkUpdateEntries({ ids: [a.id, 12345], ownership: 'owned' })
    expect(res.skipped).toBe(1)
    expect(res.entries[0]).toMatchObject({ rating: 7, notes: 'n', genres: 'Fantasy, Old', ownership: 'owned' })
  })
})

describe('deleteEntries (9.2)', () => {
  it('deletes every id with its logs, in one go', () => {
    const a = addEntry({ category: 'book', title: 'A' })
    const b = addEntry({ category: 'book', title: 'B' })
    const c = addEntry({ category: 'book', title: 'C' })
    addLog({ entry_id: a.id, date: '2024-01-01' })
    expect(deleteEntries([a.id, b.id])).toEqual({ success: true, count: 2 })
    expect(getEntries('book').map(e => e.id)).toEqual([c.id])
    expect(getLogs(a.id)).toEqual([])
  })
})
