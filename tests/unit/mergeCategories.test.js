import { describe, it, expect } from 'vitest'
import { mergeCategories, DEFAULT_CATEGORIES } from '../../src/App.jsx'

describe('mergeCategories', () => {
  it('returns the full defaults when nothing is stored', () => {
    expect(mergeCategories(undefined)).toBe(DEFAULT_CATEGORIES)
    expect(mergeCategories(null)).toBe(DEFAULT_CATEGORIES)
    expect(mergeCategories([])).toBe(DEFAULT_CATEGORIES)
  })

  it('appends newly-shipped defaults (Manga, TV Shows) to a legacy 4-category list', () => {
    const legacy = [
      { id: 'book',  label: 'Books',  color: '#000', enabled: true },
      { id: 'anime', label: 'Anime',  color: '#111', enabled: false },
      { id: 'movie', label: 'Movies', color: '#222', enabled: true },
      { id: 'game',  label: 'Games',  color: '#333', enabled: true },
    ]
    const merged = mergeCategories(legacy)
    // Stored order is preserved; missing defaults append in DEFAULT_CATEGORIES order.
    expect(merged.map(c => c.id)).toEqual(['book', 'anime', 'movie', 'game', 'manga', 'tv'])
    // The appended ones come straight from defaults, untouched.
    expect(merged.find(c => c.id === 'tv')).toEqual(DEFAULT_CATEGORIES.find(c => c.id === 'tv'))
    expect(merged.find(c => c.id === 'manga')).toEqual(DEFAULT_CATEGORIES.find(c => c.id === 'manga'))
  })

  it("preserves the user's stored color and enabled choices", () => {
    const legacy = [{ id: 'book', label: 'Books', color: '#abcdef', enabled: false }]
    const merged = mergeCategories(legacy)
    expect(merged[0]).toEqual({ id: 'book', label: 'Books', color: '#abcdef', enabled: false })
  })

  it('does not duplicate a category the user already has', () => {
    const merged = mergeCategories(DEFAULT_CATEGORIES)
    const ids = merged.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('tv')
  })
})
