// Runs the sentence-embedding model in its own process.
//
// Loading Transformers.js and running ONNX inference are both long stretches of
// mostly-synchronous work. Hosted in the main process they froze the window —
// seconds on the first query while the model loaded, and again on every large
// reindex. A utilityProcess gives them their own event loop, so the UI stays
// live throughout and a crash inside the native runtime takes down only this.
//
// Protocol. The parent sends { type, id, ... } and gets back exactly one
// { type: 'result', id, ok, ... } per request; { type: 'status' } and
// { type: 'progress' } are pushed unsolicited whenever the situation changes.
//
// Note the asymmetry in Electron's message API: here messages arrive wrapped in
// a MessageEvent (`e.data`), while on the parent side UtilityProcess hands the
// listener the message itself.

const { hashEmbed, modelNameFor, packVectors, TRANSFORMERS_MODEL } = require('./vector')

const BATCH_SIZE = 16

const port = process.parentPort

let cacheDir     = null
let pipePromise  = null
let backend      = 'uninitialized' // 'uninitialized' | 'loading' | 'transformers' | 'fallback'
let backendError = null

function send(msg) {
  port.postMessage(msg)
}

function setBackend(next, error = null) {
  backend = next
  backendError = error
  // pid rides along so the parent (and the e2e suite) can confirm the model is
  // genuinely somewhere else, which is the entire point of this file.
  send({ type: 'status', backend, model: modelNameFor(backend), error, pid: process.pid })
}

async function loadPipeline() {
  // Dynamic import: the package is ESM-only and also genuinely optional — a
  // missing/broken install downgrades to the fallback instead of crashing.
  const { pipeline, env } = await import('@huggingface/transformers')
  if (cacheDir) env.cacheDir = cacheDir
  return pipeline('feature-extraction', TRANSFORMERS_MODEL, {
    dtype: 'q8',
    // Fires per file while the ~25 MB model downloads. Now that this no longer
    // blocks the window, an idle-looking minute is the failure mode to avoid,
    // so the parent turns these into a visible progress line.
    progress_callback: p => {
      if (p?.status === 'progress' && p.total) {
        send({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total })
      }
    },
  })
}

function getPipeline() {
  if (backend === 'fallback') return Promise.resolve(null)
  if (!pipePromise) {
    setBackend('loading')
    pipePromise = loadPipeline().then(
      p   => { setBackend('transformers'); return p },
      err => { setBackend('fallback', String(err?.message ?? err)); return null },
    )
  }
  return pipePromise
}

// Embed a list of strings -> Float32Array[] (all same dim, L2-normalized).
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

// ONNX sessions are not re-entrant, and the parent will happily ask for a query
// vector while a reindex batch is still in flight. One chain keeps them apart;
// the two-argument then() means a rejected job doesn't stall the queue behind it.
let chain = Promise.resolve()
function enqueue(fn) {
  const run = chain.then(fn, fn)
  chain = run.then(() => {}, () => {})
  return run
}

// Every request answers exactly once, so a parent-side promise can never be
// left hanging on a job that threw somewhere inside the runtime.
function reply(id, work) {
  enqueue(work).then(
    value => send({ type: 'result', id, ok: true, ...value }),
    err   => send({ type: 'result', id, ok: false, error: String(err?.message ?? err) }),
  )
}

port.on('message', e => {
  const msg = e.data ?? {}
  switch (msg.type) {
    case 'config':
      if (msg.cacheDir) cacheDir = msg.cacheDir
      // Arrives before any request, so committing to the fallback here means
      // the model is never reached for. See the parent's note on why tests
      // force this rather than declining to fork.
      if (msg.lexical) setBackend('fallback', 'forced by CHRONICLE_TEST')
      break
    case 'embed':
      reply(msg.id, async () => packVectors(await embedTexts(msg.texts ?? [])))
      break
    // Resolving the model name forces the backend decision, which is what keeps
    // the index from mixing vectors produced by different backends.
    case 'model':
      reply(msg.id, async () => {
        await getPipeline()
        return { model: modelNameFor(backend), error: backendError }
      })
      break
  }
})
