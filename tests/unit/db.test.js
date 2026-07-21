import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDb, addEntry, getEntries, updateEntry, deleteEntry,
  getSeries, addSeries, deleteSeries, renameSeries,
} from '../../electron/db.js'

describe('initDb', () => {
  it('does not throw when called twice on the same path', () => {
    const os   = require('os')
    const path = require('path')
    const fs   = require('fs')
    const tmp  = path.join(os.tmpdir(), `chronicle-migration-${Date.now()}.db`)
    try {
      expect(() => { initDb(tmp); initDb(tmp) }).not.toThrow()
    } finally {
      try { fs.unlinkSync(tmp) } catch {}
    }
  })
})

describe('addEntry', () => {
  beforeEach(() => initDb(':memory:'))

  it('returns the inserted row with an id', () => {
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    expect(entry.id).toBeTypeOf('number')
    expect(entry.title).toBe('Dune')
    expect(entry.category).toBe('book')
    expect(entry.status).toBe('completed')
  })

  it('defaults status to completed when omitted', () => {
    const entry = addEntry({ category: 'book', title: 'Dune' })
    expect(entry.status).toBe('completed')
  })

  it('stores rating as null when omitted', () => {
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    expect(entry.rating).toBeNull()
  })

  it('stores series_id and exposes series name via JOIN', () => {
    const s = addSeries('book', 'Dune')
    const entry = addEntry({ category: 'book', title: 'Dune Messiah', status: 'completed', series_id: s.id })
    expect(entry.series_id).toBe(s.id)
    expect(entry.series).toBe('Dune')
  })

  it('returns { error: DUPLICATE } when the same title is added twice in one category', () => {
    addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    const dup = addEntry({ category: 'book', title: 'Dune', status: 'planned' })
    expect(dup.error).toBe('DUPLICATE')
    expect(dup.existing.title).toBe('Dune')
  })

  it('allows the same title in different categories', () => {
    const book  = addEntry({ category: 'book',  title: 'Dune', status: 'completed' })
    const movie = addEntry({ category: 'movie', title: 'Dune', status: 'planned' })
    expect(book.id).toBeTypeOf('number')
    expect(movie.id).toBeTypeOf('number')
    expect(book.id).not.toBe(movie.id)
  })

  it('duplicate check is case-insensitive', () => {
    addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    const dup = addEntry({ category: 'book', title: 'dune', status: 'planned' })
    expect(dup.error).toBe('DUPLICATE')
  })
})

describe('getEntries', () => {
  beforeEach(() => initDb(':memory:'))

  it('returns entries for the given category, newest first', () => {
    addEntry({ category: 'book',  title: 'Dune',       status: 'completed' })
    addEntry({ category: 'book',  title: 'Foundation', status: 'planned' })
    addEntry({ category: 'anime', title: 'Naruto',     status: 'completed' })

    const books = getEntries('book')
    expect(books).toHaveLength(2)
    expect(books[0].title).toBe('Foundation')
    expect(books[1].title).toBe('Dune')
  })

  it('returns all entries when called with no category', () => {
    addEntry({ category: 'book',  title: 'Dune',   status: 'completed' })
    addEntry({ category: 'anime', title: 'Naruto', status: 'completed' })
    expect(getEntries()).toHaveLength(2)
  })

  it('returns empty array for a category with no entries', () => {
    expect(getEntries('game')).toEqual([])
  })

  it('includes series name from JOIN when series_id is set', () => {
    const s = addSeries('book', 'Dune')
    addEntry({ category: 'book', title: 'Dune Messiah', status: 'completed', series_id: s.id })
    const [entry] = getEntries('book')
    expect(entry.series).toBe('Dune')
    expect(entry.series_id).toBe(s.id)
  })
})

describe('updateEntry', () => {
  beforeEach(() => initDb(':memory:'))

  it('updates all editable fields and returns the updated row', () => {
    const s     = addSeries('book', 'Dune')
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'planned' })
    const updated = updateEntry({
      id:        entry.id,
      title:     'Dune Messiah',
      status:    'completed',
      rating:    9,
      notes:     'Great sequel',
      series_id: s.id,
      date_read: '2024-01-01',
    })
    expect(updated.title).toBe('Dune Messiah')
    expect(updated.status).toBe('completed')
    expect(updated.rating).toBe(9)
    expect(updated.notes).toBe('Great sequel')
    expect(updated.series_id).toBe(s.id)
    expect(updated.series).toBe('Dune')
    expect(updated.date_read).toBe('2024-01-01')
  })

  it('sets series_id to null when passed null', () => {
    const s     = addSeries('book', 'Dune')
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'completed', series_id: s.id })
    const updated = updateEntry({ id: entry.id, title: entry.title, status: entry.status, series_id: null })
    expect(updated.series_id).toBeNull()
    expect(updated.series).toBeNull()
  })
})

describe('progress tracking', () => {
  beforeEach(() => initDb(':memory:'))

  it('stores progress and progress_total on add', () => {
    const entry = addEntry({ category: 'anime', title: 'Naruto', status: 'in_progress', progress: 5, progress_total: 220 })
    expect(entry.progress).toBe(5)
    expect(entry.progress_total).toBe(220)
  })

  it('defaults progress to 0 and progress_total to null when omitted', () => {
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    expect(entry.progress).toBe(0)
    expect(entry.progress_total).toBeNull()
  })

  it('updates progress and progress_total', () => {
    const entry   = addEntry({ category: 'anime', title: 'Naruto', status: 'in_progress', progress: 5, progress_total: 220 })
    const updated = updateEntry({ id: entry.id, title: entry.title, status: 'in_progress', progress: 6, progress_total: 220 })
    expect(updated.progress).toBe(6)
    expect(updated.progress_total).toBe(220)
  })

  it('preserves progress when a caller omits it (e.g. drag-to-series)', () => {
    const entry = addEntry({ category: 'anime', title: 'Naruto', status: 'in_progress', progress: 42, progress_total: 220 })
    // Simulate handleDropEntry, which only touches series_id and never sends progress.
    const updated = updateEntry({ id: entry.id, title: entry.title, status: entry.status, series_id: null })
    expect(updated.progress).toBe(42)
    expect(updated.progress_total).toBe(220)
  })
})

describe('deleteEntry', () => {
  beforeEach(() => initDb(':memory:'))

  it('removes the entry from the database', () => {
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    deleteEntry(entry.id)
    expect(getEntries('book')).toHaveLength(0)
  })

  it('returns { success: true }', () => {
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    expect(deleteEntry(entry.id)).toEqual({ success: true })
  })
})

describe('getSeries', () => {
  beforeEach(() => initDb(':memory:'))

  it('returns series as {id, name} objects sorted alphabetically', () => {
    const f = addSeries('book', 'Foundation')
    const d = addSeries('book', 'Dune')
    const list = getSeries('book')
    expect(list).toEqual([
      { id: d.id, name: 'Dune' },
      { id: f.id, name: 'Foundation' },
    ])
  })

  it('returns empty array when no series exist for the category', () => {
    addSeries('anime', 'Naruto')
    expect(getSeries('book')).toHaveLength(0)
  })

  it('includes series with no entries attached', () => {
    addSeries('book', 'EmptySeries')
    expect(getSeries('book')).toHaveLength(1)
  })
})

describe('addSeries', () => {
  beforeEach(() => initDb(':memory:'))

  it('creates a series and returns it with an id', () => {
    const s = addSeries('book', 'Dune')
    expect(s.id).toBeTypeOf('number')
    expect(s.name).toBe('Dune')
    expect(s.category).toBe('book')
  })

  it('trims whitespace from the name', () => {
    const s = addSeries('book', '  Dune  ')
    expect(s.name).toBe('Dune')
  })

  it('returns the existing record instead of throwing on duplicate name', () => {
    const first  = addSeries('book', 'Dune')
    const second = addSeries('book', 'Dune')
    expect(second.id).toBe(first.id)
  })

  it('allows the same name in different categories', () => {
    const a = addSeries('book',  'Dune')
    const b = addSeries('movie', 'Dune')
    expect(a.id).not.toBe(b.id)
  })
})

describe('deleteSeries', () => {
  beforeEach(() => initDb(':memory:'))

  it('removes the series record', () => {
    const s = addSeries('book', 'Dune')
    deleteSeries(s.id)
    expect(getSeries('book')).toHaveLength(0)
  })

  it('nullifies series_id on attached entries', () => {
    const s     = addSeries('book', 'Dune')
    const entry = addEntry({ category: 'book', title: 'Dune 1', status: 'completed', series_id: s.id })
    deleteSeries(s.id)
    const [updated] = getEntries('book')
    expect(updated.series_id).toBeNull()
    expect(updated.series).toBeNull()
  })

  it('returns { success: true }', () => {
    const s = addSeries('book', 'Dune')
    expect(deleteSeries(s.id)).toEqual({ success: true })
  })
})

describe('renameSeries', () => {
  beforeEach(() => initDb(':memory:'))

  it('updates the series name and returns the updated record', () => {
    const s       = addSeries('book', 'Old Name')
    const updated = renameSeries(s.id, 'New Name')
    expect(updated.name).toBe('New Name')
    expect(updated.id).toBe(s.id)
  })

  it('entries reflect the new name via JOIN after rename', () => {
    const s = addSeries('book', 'Old Name')
    addEntry({ category: 'book', title: 'Book 1', status: 'completed', series_id: s.id })
    renameSeries(s.id, 'New Name')
    const [entry] = getEntries('book')
    expect(entry.series).toBe('New Name')
  })
})
