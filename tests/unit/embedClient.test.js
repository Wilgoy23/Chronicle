import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  packVectors, unpackVectors, modelNameFor, hashEmbed,
  FALLBACK_DIM, FALLBACK_MODEL, TRANSFORMERS_MODEL,
} from '../../electron/ai/vector.js'

// The embedding model runs in a utilityProcess now. These cover the two halves
// that can be exercised without one: the wire format vectors travel in, and the
// client's behaviour when there is no worker to talk to — which is the case for
// every unit test, and for anything driving the service outside Electron.

describe('packVectors / unpackVectors', () => {
  it('round-trips a batch of vectors', () => {
    const vectors = ['alpha', 'beta', 'gamma'].map(hashEmbed)
    const { flat, dim } = packVectors(vectors)

    expect(dim).toBe(FALLBACK_DIM)
    expect(flat.length).toBe(3 * FALLBACK_DIM)
    expect(unpackVectors(flat, dim, 3)).toEqual(vectors)
  })

  it('hands back independent copies, not views into the shared buffer', () => {
    const { flat, dim } = packVectors([hashEmbed('one'), hashEmbed('two')])
    const [first] = unpackVectors(flat, dim, 2)
    first[0] = 42
    // Mutating an unpacked vector must not reach the next one along.
    expect(unpackVectors(flat, dim, 2)[0][0]).not.toBe(42)
  })

  it('survives an empty batch', () => {
    const { flat, dim } = packVectors([])
    expect(dim).toBe(0)
    expect(flat.length).toBe(0)
    expect(unpackVectors(flat, dim, 0)).toEqual([])
  })
})

describe('modelNameFor', () => {
  it('names a backend the same way on both sides of the boundary', () => {
    expect(modelNameFor('transformers')).toBe(TRANSFORMERS_MODEL)
    expect(modelNameFor('fallback')).toBe(FALLBACK_MODEL)
    expect(modelNameFor('loading')).toBeNull()
    expect(modelNameFor('uninitialized')).toBeNull()
  })
})

describe('embeddings client without a worker', () => {
  // Module-level spawn state, so each test gets its own copy of the module.
  let engine
  beforeEach(async () => {
    vi.resetModules()
    engine = await import('../../electron/ai/embeddings.js')
  })

  it('starts uninitialized and commits to nothing until asked', () => {
    expect(engine.getStatus()).toEqual({
      backend: 'uninitialized', model: null, error: null, workerPid: null,
    })
  })

  it('returns lexical vectors when there is no utilityProcess host', async () => {
    const out = await engine.embedTexts(['Dune', 'Dune Messiah'])
    expect(out).toEqual([hashEmbed('Dune'), hashEmbed('Dune Messiah')])
  })

  it('reports the fallback and why, so Settings can explain itself', async () => {
    await engine.embedTexts(['anything'])
    const status = engine.getStatus()
    expect(status.backend).toBe('fallback')
    expect(status.model).toBe(FALLBACK_MODEL)
    expect(status.error).toBe('no utilityProcess host')
  })

  it('names the fallback model so the index never mixes vector spaces', async () => {
    expect(await engine.activeModel()).toBe(FALLBACK_MODEL)
  })

  it('short-circuits an empty batch without deciding on a backend', async () => {
    expect(await engine.embedTexts([])).toEqual([])
    expect(engine.getStatus().backend).toBe('uninitialized')
  })

  it('shuts down cleanly when no worker was ever started', () => {
    expect(() => engine.shutdown()).not.toThrow()
  })
})
