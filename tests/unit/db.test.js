import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDb, addEntry, findDuplicate, getEntries, updateEntry, deleteEntry,
  getLogs, getLogsByCategory, addLog, deleteLog,
  getSeries, addSeries, deleteSeries, renameSeries,
  exportData, importData, getAllSeries, backupTo, validateBackupFile, closeDb, getDbPath,
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

  it('stores year on add and exposes it', () => {
    const entry = addEntry({ category: 'movie', title: 'Dune', status: 'completed', year: 2021 })
    expect(entry.year).toBe(2021)
    expect(addEntry({ category: 'movie', title: 'Blade Runner', status: 'completed' }).year).toBeNull()
  })
})

describe('smarter duplicate detection (5.7)', () => {
  beforeEach(() => initDb(':memory:'))

  it('flags an exact source + source_id match', () => {
    addEntry({ category: 'movie', title: 'Dune', status: 'completed', source: 'tmdb', source_id: 438631 })
    const dup = addEntry({ category: 'movie', title: 'Dune (2021)', status: 'planned', source: 'tmdb', source_id: 438631 })
    expect(dup.error).toBe('DUPLICATE')
    expect(dup.existing.source_id).toBe('438631')
  })

  it('allows a same-title remake with a different source_id', () => {
    addEntry({ category: 'movie', title: 'Dune', status: 'completed', source: 'tmdb', source_id: 841 })   // 1984
    const remake = addEntry({ category: 'movie', title: 'Dune', status: 'planned', source: 'tmdb', source_id: 438631 }) // 2021
    expect(remake.id).toBeTypeOf('number')
    expect(remake.error).toBeUndefined()
  })

  it('does not cross-match a movie id against a same-numbered tv id (category scope)', () => {
    addEntry({ category: 'movie', title: 'Thing', status: 'completed', source: 'tmdb', source_id: 100 })
    const tv = addEntry({ category: 'tv', title: 'Thing', status: 'completed', source: 'tmdb', source_id: 100 })
    expect(tv.id).toBeTypeOf('number')
    expect(tv.error).toBeUndefined()
  })

  it('falls back to title + year, letting different years coexist', () => {
    addEntry({ category: 'movie', title: 'Dune', status: 'completed', year: 1984 })
    const same   = addEntry({ category: 'movie', title: 'Dune', status: 'planned', year: 1984 })
    const remake = addEntry({ category: 'movie', title: 'Dune', status: 'planned', year: 2021 })
    expect(same.error).toBe('DUPLICATE')
    expect(remake.id).toBeTypeOf('number')
    expect(remake.error).toBeUndefined()
  })

  it('falls back to title-only when no source or year is available', () => {
    addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    const dup = addEntry({ category: 'book', title: 'DUNE', status: 'planned' })
    expect(dup.error).toBe('DUPLICATE')
  })

  it('allowDuplicate bypasses the guard entirely (Add anyway)', () => {
    addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    const forced = addEntry({ category: 'book', title: 'Dune', status: 'planned', allowDuplicate: true })
    expect(forced.id).toBeTypeOf('number')
    expect(forced.error).toBeUndefined()
    expect(getEntries('book')).toHaveLength(2)
  })

  it('findDuplicate prefers source identity over a title collision', () => {
    // A manual "Dune" (no source) exists; a sourced add with a NEW id is not a dup.
    addEntry({ category: 'movie', title: 'Dune', status: 'completed' })
    expect(findDuplicate({ category: 'movie', title: 'Dune', source: 'tmdb', source_id: 438631 })).toBeNull()
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

describe('genres / tags', () => {
  beforeEach(() => initDb(':memory:'))

  it('stores genres on add and trims/dedupes them', () => {
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'completed', genres: ' Sci-Fi ,Epic, sci-fi ,Adventure' })
    expect(entry.genres).toBe('Sci-Fi, Epic, Adventure')
  })

  it('defaults genres to null when omitted or empty', () => {
    expect(addEntry({ category: 'book', title: 'Dune', status: 'completed' }).genres).toBeNull()
    expect(addEntry({ category: 'book', title: 'Foundation', status: 'completed', genres: '  ,  ' }).genres).toBeNull()
  })

  it('updates genres', () => {
    const entry   = addEntry({ category: 'book', title: 'Dune', status: 'completed', genres: 'Sci-Fi' })
    const updated = updateEntry({ id: entry.id, title: entry.title, status: entry.status, genres: 'Fantasy, Favorites' })
    expect(updated.genres).toBe('Fantasy, Favorites')
  })

  it('clears genres when passed an empty string', () => {
    const entry   = addEntry({ category: 'book', title: 'Dune', status: 'completed', genres: 'Sci-Fi' })
    const updated = updateEntry({ id: entry.id, title: entry.title, status: entry.status, genres: '' })
    expect(updated.genres).toBeNull()
  })

  it('preserves genres when a caller omits them (e.g. drag-to-series)', () => {
    const entry   = addEntry({ category: 'book', title: 'Dune', status: 'completed', genres: 'Sci-Fi, Epic' })
    const updated = updateEntry({ id: entry.id, title: entry.title, status: entry.status, series_id: null })
    expect(updated.genres).toBe('Sci-Fi, Epic')
  })
})

describe('description (API synopsis, separate from notes)', () => {
  beforeEach(() => initDb(':memory:'))

  it('stores description on add without touching notes', () => {
    const entry = addEntry({ category: 'anime', title: 'Naruto', status: 'completed', description: 'A ninja story', notes: '' })
    expect(entry.description).toBe('A ninja story')
    expect(entry.notes).toBe('')
  })

  it('defaults description to null when omitted', () => {
    const entry = addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    expect(entry.description).toBeNull()
  })

  it('preserves description across an update (edit form never sends it)', () => {
    const entry   = addEntry({ category: 'anime', title: 'Naruto', status: 'completed', description: 'A ninja story' })
    const updated = updateEntry({ id: entry.id, title: entry.title, status: 'completed', notes: 'loved it' })
    expect(updated.description).toBe('A ninja story')
    expect(updated.notes).toBe('loved it')
  })
})

describe('exportData', () => {
  beforeEach(() => initDb(':memory:'))

  it('returns a versioned snapshot of all entries and series', () => {
    const s = addSeries('book', 'Dune')
    addEntry({ category: 'book', title: 'Dune', status: 'completed', rating: 9, series_id: s.id })
    addEntry({ category: 'anime', title: 'Naruto', status: 'in_progress', progress: 5, progress_total: 220 })

    const data = exportData()
    expect(data.format).toBe('chronicle-export')
    expect(data.version).toBe(1)
    expect(data.exportedAt).toBeTypeOf('string')
    expect(data.entries).toHaveLength(2)
    expect(data.series).toHaveLength(1)
    // entries carry every column, including the joined series name
    const dune = data.entries.find(e => e.title === 'Dune')
    expect(dune.series).toBe('Dune')
    expect(dune.rating).toBe(9)
  })

  it('includes re-watch/re-read logs, keyed by their entry id', () => {
    const dune = addEntry({ category: 'book', title: 'Dune', status: 'completed', rating: 9 })
    addLog({ entry_id: dune.id, date: '2026-02-01', rating: 10, notes: 'Reread' })

    const data = exportData()
    expect(data.logs).toHaveLength(1)
    expect(data.logs[0].entry_id).toBe(dune.id)
    expect(data.logs[0].rating).toBe(10)
    expect(data.logs[0].notes).toBe('Reread')
  })
})

describe('importData', () => {
  beforeEach(() => initDb(':memory:'))

  it('reproduces a library from a Chronicle export into a fresh DB', () => {
    // Build a snapshot in one DB…
    const s = addSeries('book', 'Dune')
    addEntry({ category: 'book',  title: 'Dune',   status: 'completed',   rating: 9, series_id: s.id })
    addEntry({ category: 'anime', title: 'Naruto', status: 'in_progress', progress: 5, progress_total: 220 })
    const snapshot = exportData()

    // …then import it into an empty DB.
    initDb(':memory:')
    const res = importData(snapshot)
    expect(res.ok).toBe(true)
    expect(res.imported).toBe(2)
    expect(res.skipped).toBe(0)

    const after = getEntries()
    expect(after.map(e => e.title).sort()).toEqual(['Dune', 'Naruto'])
    const dune = after.find(e => e.title === 'Dune')
    expect(dune.series).toBe('Dune')          // series remapped by (category, name)
    expect(dune.rating).toBe(9)
    const naruto = after.find(e => e.title === 'Naruto')
    expect(naruto.progress).toBe(5)
    expect(naruto.progress_total).toBe(220)
    expect(getAllSeries()).toHaveLength(1)
  })

  it('preserves original created_at timestamps', () => {
    addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    const snapshot = exportData()
    const original = snapshot.entries[0].created_at

    initDb(':memory:')
    importData(snapshot)
    expect(getEntries()[0].created_at).toBe(original)
  })

  it('skips entries whose title already exists in the same category (merge)', () => {
    addEntry({ category: 'book', title: 'Dune', status: 'completed', rating: 9 })
    const snapshot = exportData()
    // Import back into the SAME db that already has Dune.
    const res = importData(snapshot)
    expect(res.imported).toBe(0)
    expect(res.skipped).toBe(1)
    expect(getEntries()).toHaveLength(1)   // no duplicate row
  })

  it('carries over series that have no entries', () => {
    addSeries('book', 'Empty Series')
    const snapshot = exportData()
    initDb(':memory:')
    importData(snapshot)
    expect(getAllSeries().map(s => s.name)).toContain('Empty Series')
  })

  it('carries re-watch/re-read logs over, remapped to the new entry id', () => {
    const dune = addEntry({ category: 'book', title: 'Dune', status: 'completed', rating: 9 })
    addLog({ entry_id: dune.id, date: '2026-02-01', rating: 10, notes: 'Reread' })
    addLog({ entry_id: dune.id, date: '2026-03-01', rating: 8,  notes: 'Third time' })
    const snapshot = exportData()

    initDb(':memory:')
    const res = importData(snapshot)
    expect(res.logsImported).toBe(2)

    const [imported] = getEntries()
    expect(imported.log_count).toBe(2)
    const logs = getLogs(imported.id)
    expect(logs).toHaveLength(2)
    expect(logs.map(l => l.notes).sort()).toEqual(['Reread', 'Third time'])
    // remapped to the fresh entry id, not the export-time id
    expect(logs.every(l => l.entry_id === imported.id)).toBe(true)
  })

  it('imports cleanly when the export predates the logs field', () => {
    addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    const snapshot = exportData()
    delete snapshot.logs // simulate a pre-6.1 export

    initDb(':memory:')
    const res = importData(snapshot)
    expect(res.ok).toBe(true)
    expect(res.logsImported).toBe(0)
  })

  it('drops logs belonging to a dupe-skipped entry rather than orphaning them', () => {
    const dune = addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    addLog({ entry_id: dune.id, date: '2026-02-01', rating: 10, notes: 'Reread' })
    const snapshot = exportData()

    // Import back into the SAME db — Dune is a title dupe and gets skipped.
    const res = importData(snapshot)
    expect(res.skipped).toBe(1)
    expect(res.logsImported).toBe(0)
    // the original entry's own log is untouched
    expect(getLogs(dune.id)).toHaveLength(1)
  })

  it('rejects a non-Chronicle payload', () => {
    expect(importData({ foo: 'bar' }).ok).toBe(false)
    expect(importData(null).ok).toBe(false)
    expect(importData({ format: 'chronicle-export', entries: 'nope' }).ok).toBe(false)
  })
})

describe('backup / restore round-trip', () => {
  const os   = require('os')
  const path = require('path')
  const fs   = require('fs')

  it('export → clear all → restore reproduces the full library', async () => {
    const dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-backup-'))
    const dbPath  = path.join(dir, 'data.db')
    const bakPath = path.join(dir, 'backup.db')
    try {
      initDb(dbPath)
      const s = addSeries('book', 'Dune')
      const dune = addEntry({ category: 'book',  title: 'Dune',   status: 'completed',   rating: 9, series_id: s.id, progress: 0, progress_total: null })
      addEntry({ category: 'anime', title: 'Naruto', status: 'in_progress', rating: null, progress: 5, progress_total: 220 })
      addLog({ entry_id: dune.id, date: '2026-02-01', rating: 10, notes: 'Reread' })
      const before = getEntries()

      // Back up, then wipe everything.
      await backupTo(bakPath)
      expect(validateBackupFile(bakPath)).toBe(true)
      before.forEach(e => deleteEntry(e.id))
      expect(getEntries()).toHaveLength(0)

      // Restore: close, overwrite the db file with the backup, reopen.
      closeDb()
      fs.copyFileSync(bakPath, getDbPath() ?? dbPath)
      initDb(dbPath)

      const after = getEntries()
      expect(after).toHaveLength(before.length)
      expect(after.map(e => e.title).sort()).toEqual(['Dune', 'Naruto'])
      expect(getAllSeries()).toHaveLength(1)
      expect(after.find(e => e.title === 'Dune').series).toBe('Dune')
      // the binary backup/restore path (unlike JSON export) is a full file copy,
      // so re-watch/re-read logs already survive it untouched
      const restoredDune = after.find(e => e.title === 'Dune')
      expect(restoredDune.log_count).toBe(1)
      expect(getLogs(restoredDune.id)[0].notes).toBe('Reread')
    } finally {
      closeDb()
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
    }
  })

  it('rejects a non-database file', () => {
    const os = require('os'), path = require('path'), fs = require('fs')
    const bad = path.join(os.tmpdir(), `chronicle-notadb-${Date.now()}.db`)
    fs.writeFileSync(bad, 'this is not sqlite')
    try {
      expect(validateBackupFile(bad)).toBe(false)
    } finally {
      try { fs.unlinkSync(bad) } catch {}
    }
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

  it('trims surrounding whitespace from the new name', () => {
    const s       = addSeries('book', 'Old Name')
    const updated = renameSeries(s.id, '  Spaced Out  ')
    expect(updated.name).toBe('Spaced Out')
  })

  it('renames only the target series, leaving siblings untouched', () => {
    const a = addSeries('book', 'Alpha')
    const b = addSeries('book', 'Beta')
    renameSeries(a.id, 'Alpha Renamed')
    const names = getSeries('book').map(s => s.name).sort()
    expect(names).toEqual(['Alpha Renamed', 'Beta'])
    expect(b.name).toBe('Beta')
  })
})

describe('re-watch / re-read logs', () => {
  beforeEach(() => initDb(':memory:'))

  function makeEntry() {
    return addEntry({ category: 'movie', title: 'Blade Runner', status: 'completed', rating: 8 })
  }

  it('addLog stores a log and getLogs returns it', () => {
    const e   = makeEntry()
    const log = addLog({ entry_id: e.id, date: '2026-01-02', rating: 9, notes: 'Even better' })
    expect(log.id).toBeGreaterThan(0)
    expect(log.entry_id).toBe(e.id)
    const logs = getLogs(e.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].rating).toBe(9)
    expect(logs[0].notes).toBe('Even better')
  })

  it('getLogs returns newest date first', () => {
    const e = makeEntry()
    addLog({ entry_id: e.id, date: '2026-01-01' })
    addLog({ entry_id: e.id, date: '2026-03-01' })
    addLog({ entry_id: e.id, date: '2026-02-01' })
    expect(getLogs(e.id).map(l => l.date)).toEqual(['2026-03-01', '2026-02-01', '2026-01-01'])
  })

  it('entries carry a log_count reflecting their logs', () => {
    const e = makeEntry()
    expect(getEntries('movie')[0].log_count).toBe(0)
    addLog({ entry_id: e.id, date: '2026-01-01' })
    addLog({ entry_id: e.id, date: '2026-02-01' })
    expect(getEntries('movie')[0].log_count).toBe(2)
  })

  it('deleteLog removes only the target log', () => {
    const e = makeEntry()
    const a = addLog({ entry_id: e.id, date: '2026-01-01' })
    addLog({ entry_id: e.id, date: '2026-02-01' })
    deleteLog(a.id)
    const logs = getLogs(e.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].date).toBe('2026-02-01')
  })

  it('deleting an entry cascades its logs', () => {
    const e = makeEntry()
    addLog({ entry_id: e.id, date: '2026-01-01' })
    deleteEntry(e.id)
    expect(getLogs(e.id)).toHaveLength(0)
  })

  it('getLogsByCategory returns logs for entries in that category only', () => {
    const movie = makeEntry()
    const book  = addEntry({ category: 'book', title: 'Dune', status: 'completed' })
    addLog({ entry_id: movie.id, date: '2026-01-01' })
    addLog({ entry_id: book.id,  date: '2026-01-02' })
    const movieLogs = getLogsByCategory('movie')
    expect(movieLogs).toHaveLength(1)
    expect(movieLogs[0].entry_id).toBe(movie.id)
  })
})
