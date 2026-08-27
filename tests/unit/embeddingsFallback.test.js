import { describe, it, expect } from 'vitest'
import { hashEmbed, cosine, toBuffer, fromBuffer, FALLBACK_DIM } from '../../electron/ai/embeddings.js'

// These cover the offline fallback vectorizer and the vector plumbing — the
// Transformers.js path is exercised at runtime, not in unit tests (it would
// download a model).

describe('hashEmbed', () => {
  it('is deterministic', () => {
    expect(hashEmbed('The Lord of the Rings')).toEqual(hashEmbed('The Lord of the Rings'))
  })

  it('returns a unit vector of the fallback dimension', () => {
    const v = hashEmbed('Dune Messiah')
    expect(v.length).toBe(FALLBACK_DIM)
    let len = 0
    for (const x of v) len += x * x
    expect(Math.sqrt(len)).toBeCloseTo(1, 5)
  })

  it('scores lexically similar strings higher than unrelated ones', () => {
    const a = cosine(hashEmbed('Attack on Titan Season 2'), hashEmbed('Attack on Titan Season 3'))
    const b = cosine(hashEmbed('Attack on Titan Season 2'), hashEmbed('Pride and Prejudice'))
    expect(a).toBeGreaterThan(b)
    expect(a).toBeGreaterThan(0.5)
    expect(b).toBeLessThan(0.3)
  })

  it('ignores case and punctuation', () => {
    expect(cosine(hashEmbed('spider-man!'), hashEmbed('Spider Man'))).toBeCloseTo(1, 5)
  })

  it('handles empty strings without NaN', () => {
    const v = hashEmbed('')
    expect([...v].every(x => x === 0)).toBe(true)
    expect(cosine(v, hashEmbed('something'))).toBe(0)
  })
})

describe('vector serialization', () => {
  it('round-trips through a Buffer', () => {
    const v = hashEmbed('round trip')
    const back = fromBuffer(toBuffer(v))
    expect(back).toEqual(v)
  })
})

describe('cosine', () => {
  it('returns 0 for mismatched dimensions', () => {
    expect(cosine(new Float32Array(3), new Float32Array(4))).toBe(0)
    expect(cosine(null, new Float32Array(4))).toBe(0)
  })
})
