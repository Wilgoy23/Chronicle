// Local embedding engine. Prefers a real sentence-embedding model running
// fully on-device via Transformers.js (@huggingface/transformers + ONNX
// runtime); the model file (~25 MB) is fetched once into `cacheDir` and every
// run after that is completely offline. When the package or model can't be
// loaded (offline first run, unsupported platform, stripped install) it falls
// back to a deterministic hashed word/character-trigram vectorizer, so
// semantic search / recommendations keep working with purely lexical
// similarity instead of failing.

const TRANSFORMERS_MODEL = 'Xenova/all-MiniLM-L6-v2'
const FALLBACK_MODEL     = 'chronicle-hash-v1'
const FALLBACK_DIM       = 512
const BATCH_SIZE         = 16

let cacheDir     = null
let pipePromise  = null   // in-flight/loaded transformers pipeline
let backend      = 'uninitialized' // 'uninitialized' | 'loading' | 'transformers' | 'fallback'
let backendError = null

function configure({ modelCacheDir } = {}) {
  if (modelCacheDir) cacheDir = modelCacheDir
}

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

async function loadPipeline() {
  // Dynamic import: the package is ESM-only and also genuinely optional —
  // a missing/broken install downgrades to the fallback instead of crashing.
  const { pipeline, env } = await import('@huggingface/transformers')
  if (cacheDir) env.cacheDir = cacheDir
  return pipeline('feature-extraction', TRANSFORMERS_MODEL, { dtype: 'q8' })
}

async function getPipeline() {
  if (backend === 'fallback') return null
  // E2E runs against a throwaway userData dir, so loading the real model would
  // mean a ~25 MB download per run and network-dependent timing. The fallback
  // vectorizer is deterministic and instant, and exercises the same code paths.
  if (process.env.CHRONICLE_TEST === '1') {
    backend = 'fallback'
    backendError = 'forced by CHRONICLE_TEST'
    return null
  }
  if (!pipePromise) {
    backend = 'loading'
    pipePromise = loadPipeline().then(
      p => { backend = 'transformers'; backendError = null; return p },
      err => {
        backend = 'fallback'
        backendError = String(err?.message ?? err)
        return null
      },
    )
  }
  return pipePromise
}

// Embed a list of strings → Float32Array[] (all same dim, L2-normalized).
async function embedTexts(texts) {
  if (!texts.length) return []
  const pipe = await getPipeline()
  if (!pipe) return texts.map(hashEmbed)

  const out = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const tensor = await pipe(batch, { pooling: 'mean', normalize: true })
    const [rows, dim] = tensor.dims.length === 2 ? tensor.dims : [1, tensor.dims[0]]
    const data = tensor.data
    for (let r = 0; r < rows; r++) {
      out.push(Float32Array.from(data.slice(r * dim, (r + 1) * dim)))
    }
  }
  return out
}

// The model name active embeddings are stored under. Resolving it forces the
// backend decision, so the index never mixes vectors from different models.
async function activeModel() {
  const pipe = await getPipeline()
  return pipe ? TRANSFORMERS_MODEL : FALLBACK_MODEL
}

function getStatus() {
  return {
    backend,
    model: backend === 'transformers' ? TRANSFORMERS_MODEL
         : backend === 'fallback'     ? FALLBACK_MODEL
         : null,
    error: backendError,
  }
}

// ── Vector helpers ───────────────────────────────────────────────

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

module.exports = {
  configure, embedTexts, activeModel, getStatus,
  cosine, toBuffer, fromBuffer, hashEmbed,
  FALLBACK_MODEL, FALLBACK_DIM, TRANSFORMERS_MODEL,
}
