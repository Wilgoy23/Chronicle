// Minimal client for a locally running Ollama server (https://ollama.com).
// Strictly optional: nothing in the AI layer requires it, and every call is
// wrapped in a timeout so a stopped daemon degrades to the offline paths.

const DEFAULT_URL   = 'http://127.0.0.1:11434'
const DEFAULT_MODEL = 'llama3.2'
const RETRY_AFTER_MS = 60_000

// Circuit breaker: after a connection-level failure the server is considered
// down for a minute, so an enabled-but-stopped Ollama doesn't cost a failed
// fetch (and a warning log) on every single query. HTTP errors don't trip it —
// the server is up, the request itself is the problem. ping() always runs and
// resets the breaker on success, so Settings → "Save & test" recovers early.
let downUntil = 0

function available() {
  return Date.now() >= downUntil
}

function isConnectionError(err) {
  return err?.name === 'AbortError' || err?.name === 'TypeError'
}

function markDown() { downUntil = Date.now() + RETRY_AFTER_MS }
function markUp()   { downUntil = 0 }

function baseUrl(settings) {
  return (settings?.ai?.ollamaUrl || DEFAULT_URL).replace(/\/+$/, '')
}

function modelName(settings) {
  return settings?.ai?.ollamaModel || DEFAULT_MODEL
}

function enabled(settings) {
  return settings?.ai?.ollamaEnabled === true
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// Is the daemon up, and which models does it have pulled?
async function ping(settings) {
  try {
    const res = await fetchWithTimeout(`${baseUrl(settings)}/api/tags`, {}, 3000)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    markUp()
    return { ok: true, models: (data.models ?? []).map(m => m.name) }
  } catch (err) {
    markDown()
    return { ok: false, error: String(err?.message ?? err) }
  }
}

// One-shot JSON generation. Ollama's format:'json' constrains decoding to
// valid JSON; temperature 0 keeps parses deterministic.
async function generateJson(settings, prompt, { timeoutMs = 30000 } = {}) {
  let res
  try {
    res = await fetchWithTimeout(`${baseUrl(settings)}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName(settings),
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
      }),
    }, timeoutMs)
  } catch (err) {
    if (isConnectionError(err)) markDown()
    throw err
  }
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = await res.json()
  markUp()
  return JSON.parse(data.response)
}

module.exports = { ping, generateJson, enabled, available, baseUrl, modelName, DEFAULT_URL, DEFAULT_MODEL }
