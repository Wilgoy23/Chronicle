import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDb, addEntry, deleteEntry,
  getEmbeddingIndex, upsertEmbedding, deleteEmbeddingsForOtherModels,
  pruneOrphanEmbeddings, clearEmbeddings, countEmbeddings, setEntrySeries, addSeries,
} from '../../electron/db.js'
import { hashEmbed, toBuffer, fromBuffer } from '../../electron/ai/embeddings.js'

function embed(entryId, text, model = 'test-model') {
  const vec = hashEmbed(text)
  upsertEmbedding({ entry_id: entryId, model, dim: vec.length, vector: toBuffer(vec), text_hash: `h:${text}` })
  return vec
}

describe('embedding store', () => {
  beforeEach(() => initDb(':memory:'))

  it('stores and retrieves a vector losslessly', () => {
    const e = addEntry({ category: 'book', title: 'Dune' })
    const vec = embed(e.id, 'Dune')
    const rows = getEmbeddingIndex()
    expect(rows).toHaveLength(1)
    expect(rows[0].entry_id).toBe(e.id)
    expect(rows[0].model).toBe('test-model')
    expect(fromBuffer(rows[0].vector)).toEqual(vec)
  })

  it('upsert replaces the previous vector for the same entry', () => {
    const e = addEntry({ category: 'book', title: 'Dune' })
    embed(e.id, 'Dune')
    embed(e.id, 'Dune Messiah')
    const rows = getEmbeddingIndex()
    expect(rows).toHaveLength(1)
    expect(rows[0].text_hash).toBe('h:Dune Messiah')
  })

  it('deleteEntry removes the embedding with the entry', () => {
    const e = addEntry({ category: 'book', title: 'Dune' })
    embed(e.id, 'Dune')
    deleteEntry(e.id)
    expect(countEmbeddings()).toBe(0)
  })

  it('deleteEmbeddingsForOtherModels wipes stale backends only', () => {
    const a = addEntry({ category: 'book', title: 'A' })
    const b = addEntry({ category: 'book', title: 'B' })
    embed(a.id, 'A', 'old-model')
    embed(b.id, 'B', 'new-model')
    deleteEmbeddingsForOtherModels('new-model')
    const rows = getEmbeddingIndex()
    expect(rows).toHaveLength(1)
    expect(rows[0].entry_id).toBe(b.id)
  })

  it('rejects embeddings for entries that do not exist (FK enforced)', () => {
    // better-sqlite3 enforces foreign keys, so orphan vectors can't be created
    // through this API — pruneOrphanEmbeddings stays as a defensive no-op.
    expect(() => embed(9999, 'ghost')).toThrow()
  })

  it('pruneOrphanEmbeddings leaves a consistent index untouched', () => {
    const e = addEntry({ category: 'book', title: 'Dune' })
    embed(e.id, 'Dune')
    pruneOrphanEmbeddings()
    const rows = getEmbeddingIndex()
    expect(rows).toHaveLength(1)
    expect(rows[0].entry_id).toBe(e.id)
  })

  it('clearEmbeddings empties the table', () => {
    const e = addEntry({ category: 'book', title: 'Dune' })
    embed(e.id, 'Dune')
    clearEmbeddings()
    expect(countEmbeddings()).toBe(0)
  })
})

describe('setEntrySeries', () => {
  beforeEach(() => initDb(':memory:'))

  it('assigns an entry to a series and returns the joined row', () => {
    const s = addSeries('manga', 'Vagabond')
    const e = addEntry({ category: 'manga', title: 'Vagabond, Vol. 1' })
    const updated = setEntrySeries(e.id, s.id)
    expect(updated.series_id).toBe(s.id)
    expect(updated.series).toBe('Vagabond')
  })

  it('clears the series with null', () => {
    const s = addSeries('manga', 'Vagabond')
    const e = addEntry({ category: 'manga', title: 'Vagabond, Vol. 1', series_id: s.id })
    const updated = setEntrySeries(e.id, null)
    expect(updated.series_id).toBeNull()
  })
})
