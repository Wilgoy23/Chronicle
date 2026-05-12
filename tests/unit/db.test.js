import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, addEntry, getEntries, updateEntry, deleteEntry, getSeries } from '../../electron/db.js'

describe('initDb', () => {
  it('does not throw when called twice on the same path', () => {
    const os = require('os')
    const path = require('path')
    const fs = require('fs')
    const tmp = path.join(os.tmpdir(), `chronicle-migration-${Date.now()}.db`)
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
})

describe('getEntries', () => {
  beforeEach(() => initDb(':memory:'))

  it('returns entries for the given category, newest first', () => {
    addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    addEntry({ category: 'book', title: 'Foundation', status: 'planned' })
    addEntry({ category: 'anime', title: 'Naruto', status: 'completed' })

    const books = getEntries('book')
    expect(books).toHaveLength(2)
    expect(books[0].title).toBe('Foundation')
    expect(books[1].title).toBe('Dune')
  })

  it('returns all entries when called with no category', () => {
    addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    addEntry({ category: 'anime', title: 'Naruto', status: 'completed' })
    expect(getEntries()).toHaveLength(2)
  })

  it('returns empty array for a category with no entries', () => {
    expect(getEntries('game')).toEqual([])
  })
})

describe('updateEntry', () => {
  beforeEach(() => initDb(':memory:'))

  it('updates all editable fields and returns the updated row', () => {
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'planned' })
    const updated = updateEntry({
      id: entry.id,
      title: 'Dune Messiah',
      status: 'completed',
      rating: 9,
      notes: 'Great sequel',
      series: 'Dune',
      date_read: '2024-01-01',
    })
    expect(updated.title).toBe('Dune Messiah')
    expect(updated.status).toBe('completed')
    expect(updated.rating).toBe(9)
    expect(updated.notes).toBe('Great sequel')
    expect(updated.series).toBe('Dune')
    expect(updated.date_read).toBe('2024-01-01')
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

  it('returns distinct series for the category, sorted alphabetically', () => {
    addEntry({ category: 'book', title: 'Dune 1', status: 'completed', series: 'Dune' })
    addEntry({ category: 'book', title: 'Foundation 1', status: 'completed', series: 'Foundation' })
    addEntry({ category: 'book', title: 'Dune 2', status: 'completed', series: 'Dune' })
    addEntry({ category: 'anime', title: 'Naruto 1', status: 'completed', series: 'Naruto' })

    expect(getSeries('book')).toEqual(['Dune', 'Foundation'])
  })

  it('excludes entries with no series', () => {
    addEntry({ category: 'book', title: 'Solo', status: 'completed' })
    expect(getSeries('book')).toHaveLength(0)
  })
})
