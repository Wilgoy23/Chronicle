import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDb, addEntry, updateEntry, deleteEntry,
  getLists, createList, updateList, deleteList,
  getListItems, addToList, removeFromList, reorderList, setListItemNote, getEntryListIds,
  exportData, importData,
} from '../../electron/db.js'

const titles = (items) => items.map(i => i.title)

describe('custom lists', () => {
  let a, b, c
  beforeEach(() => {
    initDb(':memory:')
    a = addEntry({ category: 'movie', title: 'Paddington 2', status: 'completed', cover_url: 'a.jpg' })
    b = addEntry({ category: 'tv',    title: 'Bluey',        status: 'in_progress', cover_url: 'b.jpg' })
    c = addEntry({ category: 'book',  title: 'Piranesi',     status: 'planned' })
  })

  it('creates a list and requires a name', () => {
    expect(createList({ name: '  ' })).toEqual({ error: 'NAME_REQUIRED' })
    const l = createList({ name: ' Comfort rewatches ', description: ' cosy ' })
    expect(l).toMatchObject({ name: 'Comfort rewatches', description: 'cosy', item_count: 0, completed_count: 0, covers: [] })
  })

  it('mixes categories and keeps insertion order', () => {
    const l = createList({ name: 'Mixed' })
    expect(addToList(l.id, [b.id, a.id, c.id])).toEqual({ added: 3, skipped: 0 })
    const items = getListItems(l.id)
    expect(titles(items)).toEqual(['Bluey', 'Paddington 2', 'Piranesi'])
    expect(new Set(items.map(i => i.category))).toEqual(new Set(['tv', 'movie', 'book']))
    // Full entry rows, so the UI can open the editor straight from a list.
    expect(items[0]).toMatchObject({ id: b.id, status: 'in_progress', cover_url: 'b.jpg' })
  })

  it('skips entries already on the list and unknown ids', () => {
    const l = createList({ name: 'L' })
    addToList(l.id, [a.id])
    expect(addToList(l.id, [a.id, 9999, b.id])).toEqual({ added: 1, skipped: 2 })
    expect(titles(getListItems(l.id))).toEqual(['Paddington 2', 'Bluey'])
  })

  it('lets one entry belong to several lists', () => {
    const l1 = createList({ name: 'One' })
    const l2 = createList({ name: 'Two' })
    addToList(l1.id, [a.id])
    addToList(l2.id, [a.id])
    expect(getEntryListIds(a.id)).toEqual([l1.id, l2.id])
  })

  it('reorders, keeping unmentioned items after the given ones', () => {
    const l = createList({ name: 'Order' })
    addToList(l.id, [a.id, b.id, c.id])
    reorderList(l.id, [c.id, a.id, b.id])
    expect(titles(getListItems(l.id))).toEqual(['Piranesi', 'Paddington 2', 'Bluey'])
    reorderList(l.id, [b.id, 12345])
    expect(titles(getListItems(l.id))).toEqual(['Bluey', 'Piranesi', 'Paddington 2'])
  })

  it('appends after a reorder without colliding positions', () => {
    const l = createList({ name: 'L' })
    addToList(l.id, [a.id, b.id])
    removeFromList(l.id, a.id)
    addToList(l.id, [c.id, a.id])
    expect(titles(getListItems(l.id))).toEqual(['Bluey', 'Piranesi', 'Paddington 2'])
  })

  it('stores a per-list note on an item', () => {
    const l = createList({ name: 'L' })
    addToList(l.id, [a.id])
    setListItemNote(l.id, a.id, '  watch at Christmas ')
    expect(getListItems(l.id)[0].list_note).toBe('watch at Christmas')
    setListItemNote(l.id, a.id, '')
    expect(getListItems(l.id)[0].list_note).toBeNull()
  })

  it('summarises counts, completed items and covers in list order', () => {
    const l = createList({ name: 'L' })
    addToList(l.id, [c.id, b.id, a.id])
    const [summary] = getLists()
    expect(summary).toMatchObject({ item_count: 3, completed_count: 1, covers: ['b.jpg', 'a.jpg'] })
    updateEntry({ id: b.id, title: b.title, status: 'completed' })
    expect(getLists()[0].completed_count).toBe(2)
  })

  it('renames and redescribes, ignoring omitted fields', () => {
    const l = createList({ name: 'Old', description: 'keep me' })
    expect(updateList({ id: l.id, name: 'New' })).toMatchObject({ name: 'New', description: 'keep me' })
    expect(updateList({ id: l.id, description: '' })).toMatchObject({ name: 'New', description: null })
    expect(updateList({ id: l.id, name: '' })).toEqual({ error: 'NAME_REQUIRED' })
  })

  it('drops an entry from every list when the entry is deleted', () => {
    const l = createList({ name: 'L' })
    addToList(l.id, [a.id, b.id])
    deleteEntry(a.id)
    expect(titles(getListItems(l.id))).toEqual(['Bluey'])
  })

  it('deleting a list keeps its entries in the library', () => {
    const l = createList({ name: 'L' })
    addToList(l.id, [a.id])
    deleteList(l.id)
    expect(getLists()).toEqual([])
    expect(getEntryListIds(a.id)).toEqual([])
  })
})

describe('lists in export / import', () => {
  beforeEach(() => initDb(':memory:'))

  function seedExport() {
    const a = addEntry({ category: 'movie', title: 'Alien', status: 'completed' })
    const b = addEntry({ category: 'movie', title: 'Aliens', status: 'planned' })
    const l = createList({ name: 'Before the sequel', description: 'in order' })
    addToList(l.id, [b.id, a.id])
    setListItemNote(l.id, a.id, 'start here')
    return exportData()
  }

  it('exports lists and their items', () => {
    const data = seedExport()
    expect(data.lists).toEqual([expect.objectContaining({ name: 'Before the sequel', description: 'in order' })])
    expect(data.listItems.map(i => i.position)).toEqual([0, 1])
  })

  it('recreates lists in a fresh library with remapped entry ids', () => {
    const data = seedExport()
    initDb(':memory:')
    addEntry({ category: 'book', title: 'Filler', status: 'planned' }) // shift ids
    const res = importData(data)
    expect(res).toMatchObject({ ok: true, imported: 2, listsImported: 1 })
    const [l] = getLists()
    const items = getListItems(l.id)
    expect(titles(items)).toEqual(['Aliens', 'Alien'])
    expect(items[1].list_note).toBe('start here')
  })

  it('re-importing into the same library keeps membership via the existing entries', () => {
    const data = seedExport()
    // Same library: entries are skipped as duplicates and the list merges by name.
    const res = importData(data)
    expect(res).toMatchObject({ imported: 0, skipped: 2, listsImported: 0 })
    expect(getLists()).toHaveLength(1)
    expect(getLists()[0].item_count).toBe(2)
  })

  it('links skipped duplicates into a newly created list', () => {
    const data = seedExport()
    initDb(':memory:')
    addEntry({ category: 'movie', title: 'Alien', status: 'completed' })
    importData(data)
    const [l] = getLists()
    expect(titles(getListItems(l.id))).toEqual(['Aliens', 'Alien'])
  })

  it('accepts older exports without lists', () => {
    const data = seedExport()
    delete data.lists
    delete data.listItems
    initDb(':memory:')
    expect(importData(data)).toMatchObject({ ok: true, imported: 2, listsImported: 0 })
  })
})
