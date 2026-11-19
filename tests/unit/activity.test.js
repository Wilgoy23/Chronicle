import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDb, addEntry, updateEntry, deleteEntry, getEntries, getActivity,
  cacheGet, cacheSet, exportData, importData,
} from '../../electron/db.js'

function base(e) {
  return { id: e.id, title: e.title, status: e.status, rating: e.rating, notes: e.notes, series_id: e.series_id, date_read: e.date_read }
}

describe('activity log', () => {
  beforeEach(() => initDb(':memory:'))

  it('records a row when progress changes, with the delta and new value', () => {
    const e = addEntry({ category: 'tv', title: 'Severance', status: 'in_progress', progress: 2, progress_total: 9 })
    updateEntry({ ...base(e), progress: 5 })
    const [a] = getActivity(e.id)
    expect(a).toMatchObject({ entry_id: e.id, progress: 5, delta: 3, status: null })
    expect(a.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('records a status change even when progress is unchanged', () => {
    const e = addEntry({ category: 'book', title: 'Dune', status: 'planned' })
    updateEntry({ ...base(e), status: 'in_progress' })
    expect(getActivity(e.id)).toEqual([expect.objectContaining({ status: 'in_progress', delta: 0 })])
  })

  it('records nothing for an edit that touches neither progress nor status', () => {
    const e = addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    updateEntry({ ...base(e), notes: 'great' })
    updateEntry({ ...base(e), series_id: null }) // drag-to-series style call, progress omitted
    expect(getActivity(e.id)).toEqual([])
  })

  it('exposes last_activity, falling back to created_at', () => {
    const e = addEntry({ category: 'book', title: 'Dune', status: 'in_progress' })
    expect(getEntries('book')[0].last_activity).toBe(e.created_at)
    updateEntry({ ...base(e), progress: 40 })
    const after = getEntries('book')[0]
    expect(after.last_activity).toBe(getActivity(e.id)[0].at)
  })

  it('is removed with its entry', () => {
    const e = addEntry({ category: 'book', title: 'Dune', status: 'in_progress' })
    updateEntry({ ...base(e), progress: 10 })
    deleteEntry(e.id)
    expect(getActivity(e.id)).toEqual([])
  })

  it('round-trips through JSON export/import, remapped to the new entry ids', () => {
    const e = addEntry({ category: 'book', title: 'Dune', status: 'in_progress' })
    updateEntry({ ...base(e), progress: 10 })
    updateEntry({ ...base(e), progress: 25 })
    const snapshot = exportData()
    expect(snapshot.activity).toHaveLength(2)

    initDb(':memory:')
    addEntry({ category: 'book', title: 'Filler' }) // shift ids so remapping matters
    const res = importData(snapshot)
    expect(res.imported).toBe(1)
    const imported = getEntries('book').find(x => x.title === 'Dune')
    expect(getActivity(imported.id).map(a => a.progress)).toEqual([25, 10])
  })

  it('imports older exports with no activity key', () => {
    const res = importData({ format: 'chronicle-export', version: 1, entries: [{ id: 1, category: 'book', title: 'X' }] })
    expect(res.ok).toBe(true)
  })
})

describe('media cache', () => {
  beforeEach(() => initDb(':memory:'))

  it('returns null for a missing key', () => {
    expect(cacheGet('nope', 1000)).toBeNull()
  })

  it('returns fresh values within the TTL and stale ones after', () => {
    cacheSet('k', { a: 1 })
    expect(cacheGet('k', 60_000)).toEqual({ value: { a: 1 }, fresh: true })
    expect(cacheGet('k', -1)).toEqual({ value: { a: 1 }, fresh: false })
  })
})
