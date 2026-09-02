import { describe, it, expect } from 'vitest'
import {
  selectSeeds, buildSuggestPrompt, hasGenre, SEED_LIMIT, MIN_SEEDS,
} from '../../electron/ai/suggestNew.js'

const entry = (over = {}) => ({
  title: 'Untitled', status: 'completed', rating: 8, genres: '', year: null, ...over,
})

describe('hasGenre', () => {
  it('matches one item of a comma-separated list', () => {
    expect(hasGenre(entry({ genres: 'Fantasy, Adventure, Epic' }), 'Adventure')).toBe(true)
  })

  it('ignores casing and surrounding whitespace', () => {
    expect(hasGenre(entry({ genres: '  Science Fiction ,Drama' }), 'science fiction')).toBe(true)
  })

  it('matches whole items, not substrings', () => {
    // The vocabulary can offer both, so picking one must not drag in the other.
    expect(hasGenre(entry({ genres: 'Dark Romance' }), 'Romance')).toBe(false)
  })

  it('treats an empty genre as no constraint', () => {
    expect(hasGenre(entry({ genres: '' }), '')).toBe(true)
    expect(hasGenre(entry({ genres: '' }), '   ')).toBe(true)
  })

  it('does not match an entry with no genres recorded', () => {
    expect(hasGenre(entry({ genres: null }), 'Horror')).toBe(false)
  })
})

describe('selectSeeds', () => {
  it('excludes unrated entries', () => {
    const { seeds } = selectSeeds([
      entry({ title: 'Rated', rating: 7 }),
      entry({ title: 'Unrated', rating: null }),
    ])
    expect(seeds.map(s => s.title)).toEqual(['Rated'])
  })

  it('orders by rating, highest first', () => {
    const { seeds } = selectSeeds([
      entry({ title: 'Mid', rating: 6 }),
      entry({ title: 'Best', rating: 10 }),
      entry({ title: 'Low', rating: 2 }),
    ])
    expect(seeds.map(s => s.title)).toEqual(['Best', 'Mid', 'Low'])
  })

  it('caps the seed set', () => {
    const many = Array.from({ length: SEED_LIMIT + 8 }, (_, i) =>
      entry({ title: `T${i}`, rating: 10 - (i % 10) }))
    expect(selectSeeds(many).seeds).toHaveLength(SEED_LIMIT)
  })

  it('filters to a single status when asked', () => {
    const entries = [
      entry({ title: 'Done', status: 'completed' }),
      entry({ title: 'Reading', status: 'in_progress' }),
      entry({ title: 'Queued', status: 'planned' }),
    ]
    expect(selectSeeds(entries, { status: 'in_progress' }).seeds.map(s => s.title))
      .toEqual(['Reading'])
  })

  it('returns nothing when a status has no rated entries, rather than falling back', () => {
    // Status is a hard filter: the control says "based on completed", so
    // quietly seeding from everything would make it a lie.
    const entries = [entry({ title: 'Reading', status: 'in_progress' })]
    expect(selectSeeds(entries, { status: 'completed' }).seeds).toEqual([])
  })

  it('narrows the seeds to a genre once enough entries carry it', () => {
    const entries = [
      ...Array.from({ length: MIN_SEEDS }, (_, i) =>
        entry({ title: `H${i}`, genres: 'Horror', rating: 9 })),
      entry({ title: 'Other', genres: 'Comedy', rating: 10 }),
    ]
    const { seeds, genreSeeded } = selectSeeds(entries, { genre: 'Horror' })
    expect(genreSeeded).toBe(true)
    expect(seeds.map(s => s.title)).not.toContain('Other')
  })

  it('falls back to overall taste when too few entries carry the genre', () => {
    const entries = [
      entry({ title: 'OneHorror', genres: 'Horror', rating: 9 }),
      entry({ title: 'Other',     genres: 'Comedy', rating: 10 }),
    ]
    const { seeds, genreSeeded } = selectSeeds(entries, { genre: 'Horror' })
    expect(genreSeeded).toBe(false)
    expect(seeds.map(s => s.title)).toEqual(['Other', 'OneHorror'])
  })

  it('reports genreSeeded false when no genre was asked for', () => {
    expect(selectSeeds([entry()], { genre: '  ' }).genreSeeded).toBe(false)
  })

  it('applies status and genre together', () => {
    const entries = [
      ...Array.from({ length: MIN_SEEDS }, (_, i) =>
        entry({ title: `D${i}`, status: 'completed', genres: 'Horror' })),
      entry({ title: 'ReadingHorror', status: 'in_progress', genres: 'Horror' }),
    ]
    const { seeds } = selectSeeds(entries, { genre: 'Horror', status: 'completed' })
    expect(seeds.map(s => s.title)).not.toContain('ReadingHorror')
  })
})

describe('buildSuggestPrompt', () => {
  const seeds = [
    entry({ title: 'Dune', year: 1965, rating: 10 }),
    entry({ title: 'Neuromancer', rating: 8 }),
  ]

  it('lists the seeds with ratings, and years when known', () => {
    const p = buildSuggestPrompt({ seeds, categoryLabel: 'books' })
    expect(p).toContain('- Dune (1965): 10/10')
    expect(p).toContain('- Neuromancer: 8/10')
  })

  it('adds a genre constraint only when a genre was given', () => {
    expect(buildSuggestPrompt({ seeds, categoryLabel: 'books' }))
      .not.toMatch(/Every suggestion must be/)

    const p = buildSuggestPrompt({ seeds, categoryLabel: 'books', genre: 'Horror' })
    expect(p).toContain('Every suggestion must be Horror')
    expect(p).toContain('5 real, well-known Horror books titles')
  })

  it('tells the model to return fewer rather than drift off-genre', () => {
    expect(buildSuggestPrompt({ seeds, categoryLabel: 'books', genre: 'Horror' }))
      .toContain('return fewer rather than including something that is not Horror')
  })

  it('describes the seeds differently per status', () => {
    const label = status => buildSuggestPrompt({ seeds, categoryLabel: 'books', status }).split('\n')[0]
    expect(label('all')).toContain('Their top-rated titles')
    expect(label('completed')).toContain('finished and rated')
    expect(label('in_progress')).toContain('partway through and rated')
  })

  it('ignores whitespace-only genre input', () => {
    expect(buildSuggestPrompt({ seeds, categoryLabel: 'books', genre: '   ' }))
      .not.toMatch(/Every suggestion must be/)
  })

  it('always asks for JSON only', () => {
    expect(buildSuggestPrompt({ seeds, categoryLabel: 'books' })).toContain('Return ONLY JSON')
  })
})
