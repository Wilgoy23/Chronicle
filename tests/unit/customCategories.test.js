import { describe, it, expect } from 'vitest'
import { categoryHasSearch, createCustomCategory, mergeCategories } from '../../src/App.jsx'

describe('categoryHasSearch', () => {
  it('is true for the built-in, search-backed categories', () => {
    for (const id of ['book', 'anime', 'manga', 'movie', 'tv', 'game']) {
      expect(categoryHasSearch({ id })).toBe(true)
    }
  })

  it('is false for custom and unknown categories', () => {
    expect(categoryHasSearch({ id: 'custom-abc' })).toBe(false)
    expect(categoryHasSearch({ id: 'vinyl' })).toBe(false)
  })

  it('is false for nullish input', () => {
    expect(categoryHasSearch(null)).toBe(false)
    expect(categoryHasSearch(undefined)).toBe(false)
  })
})

describe('createCustomCategory', () => {
  it('builds a custom category with a namespaced id and trimmed label', () => {
    const c = createCustomCategory({ name: '  Vinyl  ', icon: '🎵', color: '#123456' })
    expect(c.id.startsWith('custom-')).toBe(true)
    expect(c.label).toBe('Vinyl')
    expect(c.icon).toBe('🎵')
    expect(c.color).toBe('#123456')
    expect(c.enabled).toBe(true)
    expect(c.custom).toBe(true)
  })

  it('falls back to a default glyph and color when omitted', () => {
    const c = createCustomCategory({ name: 'Podcasts' })
    expect(c.icon).toBe('🏷')
    expect(c.color).toBe('#a78bfa')
  })

  it('has no search source and survives mergeCategories', () => {
    const c = createCustomCategory({ name: 'Vinyl' })
    expect(categoryHasSearch(c)).toBe(false)
    const merged = mergeCategories([c])
    expect(merged.some(x => x.id === c.id)).toBe(true)   // custom kept
    expect(merged.some(x => x.id === 'book')).toBe(true) // defaults still appended
  })

  it('generates unique ids across many calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createCustomCategory({ name: 'x' }).id))
    expect(ids.size).toBe(50)
  })
})
