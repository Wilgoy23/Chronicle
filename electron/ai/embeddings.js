// Client side of the embedding engine. The public API here is unchanged from
// when the model ran inline — callers still `await embedTexts(...)` and read
// `getStatus()` synchronously — but the work now happens in a utilityProcess
// (see ./embedWorker) so it can't freeze the window.
//
// Two things stay in this process on purpose: the pure vector helpers, which
// are used all over aiService and the unit tests, and the lexical fallback,
// which is fast enough that forking for it would cost more than it saves.

const path = require('path')
const {
  hashEmbed, cosine, toBuffer, fromBuffer, modelNameFor, unpackVectors,
  FALLBACK_MODEL, FALLBACK_DIM, TRANSFORMERS_MODEL,
} = require('./vector')

// A worker that dies twice is treated as broken rather than restarted forever.
const MAX_SPAWNS = 2

let cacheDir   = null
let onProgress = null

let child   = null
let spawned = false        // 'spawn' has fired; postMessage is safe
let outbox  = []           // messages queued until it does
let spawns  = 0
let nextId  = 1
const pending = new Map()  // request id → { resolve, reject }

let backend      = 'uninitialized'
let backendModel = null
let backendError = null
let workerPid    = null

function configure({ modelCacheDir, onModelProgress } = {}) {
  if (modelCacheDir) cacheDir = modelCacheDir
  if (onModelProgress) onProgress = onModelProgress
}

function setBackend(next, error = null) {
  backend      = next
  backendModel = modelNameFor(next)
  backendError = error
}

// ── Worker lifecycle ─────────────────────────────────────────────

// Fork on demand. Returns false when there is no worker to talk to — running
// outside Electron, running under test, or a fork that keeps dying — in which
// case the caller vectorizes lexically in this process instead.
function ensureChild() {
  if (child) return true
  if (backend === 'fallback' && spawns >= MAX_SPAWNS) return false

  // Required lazily and defensively: under vitest the `electron` package
  // resolves to a path string rather than the API surface, and there is no
  // utilityProcess to fork.
  let utilityProcess = null
  try { ({ utilityProcess } = require('electron')) } catch { /* not in Electron */ }
  if (typeof utilityProcess?.fork !== 'function') {
    setBackend('fallback', 'no utilityProcess host')
    return false
  }

  spawns++
  try {
    child = utilityProcess.fork(path.join(__dirname, 'embedWorker.js'), [], {
      serviceName: 'chronicle-embeddings',
    })
  } catch (err) {
    child = null
    setBackend('fallback', `worker fork failed: ${String(err?.message ?? err)}`)
    return false
  }

  setBackend('loading')
  child.on('spawn', () => { spawned = true; flush() })
  child.on('message', onMessage)
  child.on('exit', onExit)
  post({
    type: 'config',
    cacheDir,
    // E2E runs against a throwaway userData dir, so loading the real model would
    // mean a ~25 MB download per run and network-dependent timing. Forcing the
    // decision rather than skipping the fork keeps the worker round-trip itself
    // under test; the lexical vectorizer is deterministic and instant.
    lexical: process.env.CHRONICLE_TEST === '1',
  })
  return true
}

// A dead worker must not read as a successful empty result: reject everything
// in flight so ensureIndex aborts and retries later instead of writing half an
// index. The next call re-forks once; a second death latches the fallback, and
// from then on activeModel() and embedTexts() agree on the lexical backend.
function onExit(code) {
  child     = null
  spawned   = false
  outbox    = []
  workerPid = null
  const err = new Error(`embedding worker exited (code ${code})`)
  for (const p of pending.values()) p.reject(err)
  pending.clear()
  if (spawns >= MAX_SPAWNS) setBackend('fallback', 'embedding worker keeps exiting')
  else setBackend('uninitialized')
}

function onMessage(msg) {
  if (!msg) return
  if (msg.type === 'status') {
    setBackend(msg.backend, msg.error ?? null)
    workerPid = msg.pid ?? null
    return
  }
  if (msg.type === 'progress') {
    onProgress?.({ file: msg.file, loaded: msg.loaded, total: msg.total })
    return
  }
  if (msg.type === 'result') {
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg)
    else p.reject(new Error(msg.error || 'embedding worker failed'))
  }
}

function post(msg) {
  if (!child) return
  if (spawned) child.postMessage(msg)
  else outbox.push(msg)
}

function flush() {
  const queued = outbox
  outbox = []
  for (const m of queued) child?.postMessage(m)
}

function request(msg) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    post({ ...msg, id })
  })
}

// Stop the worker on app quit so it can't outlive the window it serves.
function shutdown() {
  if (!child) return
  const doomed = child
  child     = null
  spawned   = false
  outbox    = []
  workerPid = null
  pending.clear()
  try { doomed.kill() } catch { /* already gone */ }
}

// ── Public API ───────────────────────────────────────────────────

// Embed a list of strings → Float32Array[] (all same dim, L2-normalized).
//
// Worker failures deliberately reject rather than quietly returning lexical
// vectors: activeModel() has already told the caller which backend these belong
// to, and silently swapping backends mid-run would file two incompatible vector
// spaces under one model name.
async function embedTexts(texts) {
  if (!texts.length) return []
  if (!ensureChild()) return texts.map(hashEmbed)

  const { flat, dim } = await request({ type: 'embed', texts })
  return unpackVectors(flat, dim, texts.length)
}

// The model name active embeddings are stored under. Resolving it forces the
// backend decision, so the index never mixes vectors from different models.
async function activeModel() {
  if (!ensureChild()) return FALLBACK_MODEL
  const { model } = await request({ type: 'model' })
  return model ?? FALLBACK_MODEL
}

function getStatus() {
  return { backend, model: backendModel, error: backendError, workerPid }
}

module.exports = {
  configure, embedTexts, activeModel, getStatus, shutdown,
  cosine, toBuffer, fromBuffer, hashEmbed,
  FALLBACK_MODEL, FALLBACK_DIM, TRANSFORMERS_MODEL,
}
