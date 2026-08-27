import { describe, it, expect } from 'vitest'
import { buildTasteProfile, rankCandidates, nearestLiked, ratingWeight } from '../../electron/ai/recommend.js'
import { hashEmbed, cosine } from '../../electron/ai/embeddings.js'

describe('ratingWeight', () => {
  it('is positive above the neutral rating, negative below', () => {
    expect(ratingWeight({ rating: 10 })).toBeGreaterThan(0)
    expect(ratingWeight({ rating: 2 })).toBeLessThan(0)
  })

  it('gives unrated completed entries a small positive nudge', () => {
    const w = ratingWeight({ rating: null, status: 'completed' })
    expect(w).toBeGreaterThan(0)
    expect(w).toBeLessThan(ratingWeight({ rating: 10 }))
  })

  it('gives unrated planned entries no weight', () => {
    expect(ratingWeight({ rating: null, status: 'planned' })).toBe(0)
  })
})

describe('buildTasteProfile + rankCandidates', () => {
  it('ranks backlog items similar to loved entries above dissimilar ones', () => {
    const loved = [
      { title: 'Space opera epic galactic empire war', rating: 10 },
      { title: 'Starship fleet space battle saga', rating: 9 },
    ].map(e => ({ ...e, status: 'completed', vector: hashEmbed(e.title) }))

    const profile = buildTasteProfile(loved)
    expect(profile).not.toBeNull()

    const backlog = [
      { id: 1, title: 'Galactic empire starship war chronicles', status: 'planned' },
      { id: 2, title: 'Cozy village bakery romance', status: 'planned' },
    ].map(e => ({ ...e, vector: hashEmbed(e.title) }))

    const ranked = rankCandidates(profile, backlog)
    expect(ranked[0].id).toBe(1)
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })

  it('returns null when there is no rating signal', () => {
    const items = [{ rating: null, status: 'planned', vector: hashEmbed('whatever') }]
    expect(buildTasteProfile(items)).toBeNull()
  })

  it('returns null for an empty library', () => {
    expect(buildTasteProfile([])).toBeNull()
  })

  it('is pushed away from hated entries', () => {
    const items = [
      { title: 'Zombie horror gore fest', rating: 1, status: 'completed' },
      { title: 'Gentle watercolor painting course', rating: 10, status: 'completed' },
    ].map(e => ({ ...e, vector: hashEmbed(e.title) }))
    const profile = buildTasteProfile(items)
    const horror = hashEmbed('Zombie horror gore fest')
    const gentle = hashEmbed('Gentle watercolor painting course')
    expect(cosine(profile, gentle)).toBeGreaterThan(cosine(profile, horror))
  })
})

describe('nearestLiked', () => {
  it('finds the most similar liked title', () => {
    const liked = [
      { title: 'Space opera epic', vector: hashEmbed('Space opera epic galactic war') },
      { title: 'Bakery romance', vector: hashEmbed('Cozy village bakery romance') },
    ]
    const pick = hashEmbed('Galactic space war epic')
    expect(nearestLiked(pick, liked).title).toBe('Space opera epic')
  })

  it('returns null with no liked entries', () => {
    expect(nearestLiked(hashEmbed('anything'), [])).toBeNull()
  })
})
