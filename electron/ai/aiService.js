// Orchestrates Chronicle's offline-first AI layer: keeps the SQLite embedding
// index in sync with the library, and serves semantic search, natural-language
// queries, recommendations, and series detection over IPC. Embeddings come
// from ./embeddings (local Transformers.js model, lexical fallback); Ollama
// is consulted only when the user enabled it in Settings, and every Ollama
// path falls back to the offline implementation on any failure.

const crypto = require('crypto')
const dbApi  = require('../db')
const engine = require('./embeddings')
const { parseQuery, sanitizeFilter, applyFilter, describeFilter, removeFilterKey } = require('./nlFilter')
const { detectSeries } = require('./seriesDetect')
const { buildTasteProfile, rankCandidates, nearestLiked } = require('./recommend')
const { selectSeeds, buildSuggestPrompt, SEED_STATUS_TEXT } = require('./suggestNew')
const ollama = require('./ollama')

let broadcast = () => {}          // (channel, payload) → renderer
let getSettings = () => ({})
let indexPromise = null           // serializes index runs
let dirtyTimer = null
let lastIndex = { total: 0, indexed: 0, at: null }

// The text a vector represents. Notes are included on purpose: "that movie
// about dreams I loved" should match what the user wrote about it.
function entryText(e) {
  return [
    e.title,
    e.series,
    e.genres,
    e.category,
    e.year,
    e.description ? String(e.description).slice(0, 600) : null,
    e.notes ? String(e.notes).slice(0, 600) : null,
  ].filter(Boolean).join('. ')
}

function textHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex')
}

// ── Indexing ─────────────────────────────────────────────────────

// Bring the index up to date: embed new/changed entries, drop orphans and
// vectors from a different backend. Incremental — a clean library is a no-op.
async function ensureIndex() {
  if (indexPromise) return indexPromise
  indexPromise = (async () => {
    const model = await engine.activeModel()
    dbApi.deleteEmbeddingsForOtherModels(model)
    dbApi.pruneOrphanEmbeddings()

    const entries = dbApi.getEntries()
    const existing = new Map(dbApi.getEmbeddingIndex().map(r => [r.entry_id, r]))
    const pending = []
    for (const e of entries) {
      const text = entryText(e)
      const hash = textHash(text)
      const row = existing.get(e.id)
      if (!row || row.text_hash !== hash) pending.push({ id: e.id, text, hash })
    }

    lastIndex = { total: entries.length, indexed: entries.length - pending.length, at: new Date().toISOString() }
    if (pending.length) {
      const CHUNK = 32
      for (let i = 0; i < pending.length; i += CHUNK) {
        const chunk = pending.slice(i, i + CHUNK)
        const vectors = await engine.embedTexts(chunk.map(p => p.text))
        chunk.forEach((p, j) => {
          const vec = vectors[j]
          dbApi.upsertEmbedding({
            entry_id: p.id, model, dim: vec.length,
            vector: engine.toBuffer(vec), text_hash: p.hash,
          })
        })
        lastIndex.indexed += chunk.length
        broadcast('ai:indexProgress', { ...lastIndex, backend: engine.getStatus().backend })
      }
    }
    broadcast('ai:indexProgress', { ...lastIndex, done: true, backend: engine.getStatus().backend })
    return lastIndex
  })()
  try {
    return await indexPromise
  } finally {
    indexPromise = null
  }
}

// Mutations mark the index dirty; the reindex happens shortly after, off the
// critical path of the write that triggered it.
function markLibraryDirty() {
  clearTimeout(dirtyTimer)
  dirtyTimer = setTimeout(() => {
    ensureIndex().catch(err => console.error('[ai] index failed:', err))
  }, 2500)
  if (dirtyTimer.unref) dirtyTimer.unref()
}

// entry_id → Float32Array for every indexed entry.
function loadVectors() {
  const map = new Map()
  for (const r of dbApi.getEmbeddingIndex()) {
    map.set(r.entry_id, engine.fromBuffer(r.vector))
  }
  return map
}

// ── Semantic search ──────────────────────────────────────────────

async function semanticSearch(query, { category = null, limit = 20 } = {}) {
  await ensureIndex()
  const [qvec] = await engine.embedTexts([query])
  const vectors = loadVectors()
  const scored = []
  for (const e of dbApi.getEntries(category ?? undefined)) {
    const v = vectors.get(e.id)
    if (!v) continue
    scored.push({ entry: e, score: engine.cosine(qvec, v) })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

// Distinct genre vocabulary across the library, for the NL parser.
function genreVocab(entries) {
  const seen = new Set()
  for (const e of entries) {
    for (const g of String(e.genres || '').split(',')) {
      const t = g.trim()
      if (t) seen.add(t)
    }
  }
  return [...seen]
}

// ── Natural-language querying ("Ask") ────────────────────────────

function llmFilterPrompt(query, { categories, genres }) {
  return [
    'Convert the user query about their personal media library into a JSON filter.',
    'Return ONLY JSON with these keys (use null when not specified):',
    '{"category": string|null, "status": "completed"|"in_progress"|"planned"|null,',
    ' "ratingMin": 1-10|null, "ratingMax": 1-10|null, "unrated": boolean,',
    ' "yearMin": int|null, "yearMax": int|null,  // release year',
    ' "dateYearMin": int|null, "dateYearMax": int|null,  // year the user watched/read/played it',
    ' "genres": string[], "text": string  // text = remaining thematic search phrase, may be ""',
    '}',
    `Valid category ids: ${categories.map(c => `${c.id} (${c.label})`).join(', ')}.`,
    `Known genres: ${genres.slice(0, 60).join(', ') || '(none)'}.`,
    `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
    `User query: ${JSON.stringify(query)}`,
  ].join('\n')
}

// Parse the query (Ollama if enabled, offline heuristics otherwise), filter
// the library with it, and semantically rank the remainder when the query
// has a thematic component.
//
// `refine` lets the panel narrow an existing result set without rephrasing:
// { filter, remove } re-uses the filter already shown as chips and clears one
// facet by its chip key. The filter still crosses IPC from the renderer, so it
// is re-sanitized here rather than trusted — but full-range rating bounds are
// preserved, since a filter we produced meant them literally.
async function askLibrary(query, { categories = [], refine = null } = {}) {
  await ensureIndex()
  const entries = dbApi.getEntries()
  const genres = genreVocab(entries)
  const settings = getSettings()

  let filter = null
  let engineUsed = 'heuristic'

  if (refine?.filter) {
    const base = sanitizeFilter(refine.filter, { categories, genres, dropFullRangeBounds: false })
    if (base) {
      filter = refine.remove ? removeFilterKey(base, refine.remove) : base
      engineUsed = 'refined'
    }
  }

  // available() is the circuit breaker — an unreachable server is skipped
  // silently for a minute rather than re-failing on every query.
  if (!filter && ollama.enabled(settings) && ollama.available()) {
    try {
      const raw = await ollama.generateJson(settings, llmFilterPrompt(query, { categories, genres }))
      filter = sanitizeFilter(raw, { categories, genres })
      if (filter) engineUsed = 'ollama'
    } catch (err) {
      console.warn(
        `[ai] Ollama parse failed (${String(err?.message ?? err)}) — using offline parser` +
        (ollama.available() ? '' : ', will retry in 60s'))
    }
  }
  if (!filter) filter = parseQuery(query, { categories, genres })

  let matched = applyFilter(entries, filter)
  let semantic = false
  if (filter.text) {
    const [qvec] = await engine.embedTexts([filter.text])
    const vectors = loadVectors()
    matched = matched
      .map(e => ({ ...e, _score: engine.cosine(qvec, vectors.get(e.id) ?? null) }))
      .sort((a, b) => b._score - a._score)
    semantic = true
  } else {
    matched = [...matched].sort((a, b) =>
      (b.rating ?? -1) - (a.rating ?? -1) ||
      String(b.date_read ?? b.created_at ?? '').localeCompare(String(a.date_read ?? a.created_at ?? '')))
  }

  return {
    filter,
    chips: describeFilter(filter, categories),
    engine: engineUsed,
    semantic,
    results: matched.slice(0, 40).map(e => ({
      entry: stripScore(e),
      score: semantic ? (e._score ?? 0) : null,
    })),
  }
}

function stripScore(e) {
  const { _score, ...rest } = e
  return rest
}

// ── Recommendations ──────────────────────────────────────────────

async function recommend({ category = null, limit = 10 } = {}) {
  await ensureIndex()
  const entries = dbApi.getEntries(category ?? undefined)
  const vectors = loadVectors()
  const withVec = entries.map(e => ({ ...e, vector: vectors.get(e.id) ?? null }))

  const profile = buildTasteProfile(withVec)
  const backlog = withVec.filter(e => e.status === 'planned')
  if (!profile) {
    return { picks: [], reason: backlog.length ? 'no-signal' : 'no-backlog', profileSize: 0 }
  }

  const liked = withVec.filter(e => e.rating != null && e.rating >= 8)
  const picks = rankCandidates(profile, backlog).slice(0, limit).map(p => {
    const because = nearestLiked(p.vector, liked.filter(l => l.id !== p.id))
    const { vector, score, ...entry } = p
    return { entry, score, because: because?.title ?? null }
  })
  return { picks, reason: picks.length ? null : 'no-backlog', profileSize: liked.length }
}

// Fresh titles the library doesn't have — the one feature that genuinely
// needs a generative model, hence Ollama-only.
async function suggestNewTitles({ category, categoryLabel, genre = '', status = 'all' }) {
  const settings = getSettings()
  if (!ollama.enabled(settings)) return { ok: false, error: 'Ollama is not enabled in Settings → AI.' }
  if (!ollama.available()) {
    return { ok: false, error: 'Ollama looks offline — start the server (or fix the URL in Settings → AI) and try again.' }
  }

  const entries = dbApi.getEntries(category)
  // Deduped against the whole library, not the seed set: a title is already
  // owned whatever genre or status was used to ask for it.
  const owned = new Set(entries.map(e => e.title.toLowerCase()))
  const { seeds, genreSeeded } = selectSeeds(entries, { genre, status })
  if (!seeds.length) {
    return {
      ok: false,
      error: status === 'all'
        ? 'Rate a few entries first so there is taste to go on.'
        : `No rated ${SEED_STATUS_TEXT[status] ?? status} entries to go on — rate a few, or switch “Based on” to everything.`,
    }
  }

  const prompt = buildSuggestPrompt({
    seeds, categoryLabel: categoryLabel || category, genre, status,
  })

  try {
    const raw = await ollama.generateJson(settings, prompt, { timeoutMs: 60000 })
    const list = Array.isArray(raw?.suggestions) ? raw.suggestions : []
    const suggestions = list
      .filter(s => s && typeof s.title === 'string' && s.title.trim())
      .map(s => ({ title: s.title.trim(), reason: typeof s.reason === 'string' ? s.reason.trim() : '' }))
      .filter(s => !owned.has(s.title.toLowerCase()))
      .slice(0, 5)
    return { ok: true, suggestions, seedCount: seeds.length, genreSeeded }
  } catch (err) {
    return { ok: false, error: `Ollama request failed: ${String(err?.message ?? err)}` }
  }
}

// ── Series detection ─────────────────────────────────────────────

async function detectSeriesSuggestions({ category }) {
  const entries = dbApi.getEntries(category).filter(e => e.series_id == null)
  const existingSeries = dbApi.getSeries(category).map(s => ({ ...s, category }))
  let suggestions = detectSeries({ entries, existingSeries })

  // Embedding cohesion check: drop proposed groups whose members are not
  // actually similar (guards against coincidental shared prefixes). Skipped
  // when vectors aren't ready — the string heuristics alone are conservative.
  try {
    await ensureIndex()
    const vectors = loadVectors()
    suggestions = suggestions.filter(s => {
      if (s.matchType === 'existing') return true
      const vecs = s.entryIds.map(id => vectors.get(id)).filter(Boolean)
      if (vecs.length < 2) return true
      let sum = 0, n = 0
      for (let i = 0; i < vecs.length; i++) {
        for (let j = i + 1; j < vecs.length; j++) { sum += engine.cosine(vecs[i], vecs[j]); n++ }
      }
      return n === 0 || (sum / n) >= 0.3
    })
  } catch { /* cohesion check is best-effort */ }

  return suggestions
}

// Create/reuse the series and assign every suggested entry to it. The panel may
// have renamed the group or unticked members first, so nothing here assumes the
// payload still matches what detectSeries proposed. `created` is reported back
// so undo knows whether the series is ours to delete.
function applySeriesSuggestion({ category, name, seriesId, entryIds }) {
  const ids = (Array.isArray(entryIds) ? entryIds : []).filter(id => Number.isInteger(id))
  if (!ids.length) return { ok: false, error: 'Nothing selected to group.' }

  let target = seriesId
  let created = false
  if (target == null) {
    const label = String(name ?? '').trim()
    if (!label) return { ok: false, error: 'A new series needs a name.' }
    const before = new Set(dbApi.getSeries(category).map(s => s.id))
    const row = dbApi.addSeries(category, label)
    target = row.id
    // addSeries returns the existing row on a UNIQUE conflict; only a genuinely
    // new id may be deleted on undo.
    created = !before.has(row.id)
  }
  for (const id of ids) dbApi.setEntrySeries(id, target)
  markLibraryDirty() // series name is part of the embed text
  return { ok: true, seriesId: target, assigned: ids.length, created }
}

// Reverse an apply: detach the entries we just assigned, and drop the series if
// this apply is what created it. Entries eligible for detection always had a
// null series_id, so unassigning restores their prior state exactly.
function undoSeriesSuggestion({ seriesId, entryIds, created }) {
  const ids = (Array.isArray(entryIds) ? entryIds : []).filter(id => Number.isInteger(id))
  for (const id of ids) dbApi.setEntrySeries(id, null)
  if (created && seriesId != null) dbApi.deleteSeries(seriesId)
  markLibraryDirty()
  return { ok: true, detached: ids.length }
}

// ── Status + registration ────────────────────────────────────────

function status() {
  return {
    ...engine.getStatus(),
    index: { ...lastIndex, stored: dbApi.countEmbeddings() },
    ollama: {
      enabled: ollama.enabled(getSettings()),
      url: ollama.baseUrl(getSettings()),
      model: ollama.modelName(getSettings()),
    },
  }
}

// Wire up the service's collaborators. Split out of registerAiHandlers so the
// service can be driven (and tested) outside Electron, where ipcMain is absent.
function configure({ readSettings, send, modelCacheDir } = {}) {
  if (readSettings) getSettings = readSettings
  if (send) broadcast = send
  engine.configure({
    modelCacheDir,
    // The first-run model download no longer blocks the window, which means an
    // idle-looking minute is now the failure mode to avoid rather than a freeze.
    onModelProgress: p => broadcast('ai:modelProgress', p),
  })
}

function registerAiHandlers({ readSettings, send, modelCacheDir }) {
  const { ipcMain } = require('electron')
  configure({ readSettings, send, modelCacheDir })

  ipcMain.handle('ai:status',       () => status())
  ipcMain.handle('ai:rebuildIndex', async () => {
    dbApi.clearEmbeddings()
    return ensureIndex()
  })
  ipcMain.handle('ai:search',       (_e, query, opts)   => semanticSearch(query, opts ?? {}))
  ipcMain.handle('ai:ask',          (_e, query, opts)   => askLibrary(query, opts ?? {}))
  ipcMain.handle('ai:recommend',    (_e, opts)          => recommend(opts ?? {}))
  ipcMain.handle('ai:suggestNew',   (_e, opts)          => suggestNewTitles(opts ?? {}))
  // The genre vocabulary the Fresh picks field offers. Needed before the
  // suggest call, and for any category — not just the one on screen — so it
  // can't be derived from what the renderer already holds.
  ipcMain.handle('ai:genres',       (_e, category)      => genreVocab(dbApi.getEntries(category)).sort())
  ipcMain.handle('ai:detectSeries', (_e, opts)          => detectSeriesSuggestions(opts ?? {}))
  ipcMain.handle('ai:applySeries',  (_e, payload)       => applySeriesSuggestion(payload))
  ipcMain.handle('ai:undoSeries',   (_e, payload)       => undoSeriesSuggestion(payload ?? {}))
  ipcMain.handle('ai:ollamaTest',   ()                  => ollama.ping(readSettings()))
}

// Called on quit: the embedding worker is a child process, so it needs telling.
function shutdownAi() {
  clearTimeout(dirtyTimer)
  engine.shutdown()
}

module.exports = {
  configure, registerAiHandlers, markLibraryDirty, ensureIndex, shutdownAi,
  semanticSearch, askLibrary, recommend, suggestNewTitles, detectSeriesSuggestions,
  applySeriesSuggestion, undoSeriesSuggestion, entryText, status,
}
