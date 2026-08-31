// Pure vector helpers, shared verbatim by the main process and the embedding
// worker. Everything here is synchronous and dependency-free, so it can be
// required from either side (and from unit tests running under plain Node)
// without dragging the ONNX runtime along. The model itself lives in
// ./embedWorker; ./embeddings is the client that talks to it.

const TRANSFORMERS_MODEL = 'Xenova/all-MiniLM-L6-v2'
const FALLBACK_MODEL     = 'chronicle-hash-v1'
const FALLBACK_DIM       = 512

// FNV-1a 32-bit — cheap, deterministic hash for the fallback vectorizer.
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Hashed bag of word unigrams + character trigrams, signed and L2-normalized.
function hashEmbed(text) {
  const v = new Float32Array(FALLBACK_DIM)
  const norm = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const words = norm.split(/\s+/).filter(Boolean)
  const grams = []
  for (const w of words) {
    grams.push(`w:${w}`)
    const padded = `^${w}$`
    for (let i = 0; i + 3 <= padded.length; i++) grams.push(padded.slice(i, i + 3))
  }
  for (const g of grams) {
    const h = fnv1a(g)
    const idx = h % FALLBACK_DIM
    const sign = (fnv1a(`${g}#`) & 1) === 0 ? 1 : -1
    v[idx] += sign
  }
  let len = 0
  for (let i = 0; i < FALLBACK_DIM; i++) len += v[i] * v[i]
  len = Math.sqrt(len)
  if (len > 0) for (let i = 0; i < FALLBACK_DIM; i++) v[i] /= len
  return v
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot // inputs are L2-normalized
}

function toBuffer(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)
}

function fromBuffer(buf) {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

// The name a backend stores its vectors under. Kept here so the worker and the
// main process can never disagree about it — a mismatch would let two vector
// spaces share a label, and cosine scores across them are meaningless.
function modelNameFor(backend) {
  return backend === 'transformers' ? TRANSFORMERS_MODEL
       : backend === 'fallback'     ? FALLBACK_MODEL
       : null
}

// Vectors cross the process boundary as one flat Float32Array plus a row width,
// so the structured clone behind postMessage copies a single buffer instead of
// one per entry. Pack and unpack live together because a disagreement between
// them would corrupt every vector silently rather than throwing.
function packVectors(vectors) {
  const dim  = vectors.length ? vectors[0].length : 0
  const flat = new Float32Array(vectors.length * dim)
  vectors.forEach((v, i) => flat.set(v, i * dim))
  return { flat, dim }
}

function unpackVectors(flat, dim, count) {
  const out = []
  if (!dim) return out
  for (let i = 0; i < count; i++) out.push(flat.slice(i * dim, (i + 1) * dim))
  return out
}

module.exports = {
  hashEmbed, cosine, toBuffer, fromBuffer, modelNameFor,
  packVectors, unpackVectors,
  FALLBACK_MODEL, FALLBACK_DIM, TRANSFORMERS_MODEL,
}
