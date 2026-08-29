import { useEffect, useRef, useState } from 'react'
import Cover from './Cover'
import { STATUS_LABELS } from '../App'

// The offline AI hub: "Ask" (natural-language + semantic search over the
// library), "For You" (taste-profile ranked backlog, plus optional Ollama
// fresh picks), and "Series" (automatic series-detection suggestions).
// Everything runs on-device via window.ai → the Electron main process.
//
// Ask and Series state lives in the parent so switching tabs (or reopening
// the panel) doesn't discard a query and its results.

const TABS = [
  { id: 'ask',    label: 'Ask' },
  { id: 'foryou', label: 'For You' },
  { id: 'series', label: 'Series' },
]

// Concrete starting points — the parser understands each of these offline.
const EXAMPLE_PROMPTS = [
  'highly rated sci-fi',
  'things I never finished',
  'what I finished last year',
  'unrated items in my backlog',
  'cozy stories about friendship',
]

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

function scorePct(score) {
  // Cosine similarity ~[0,1] for these models; clamp for display.
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

function ResultRow({ entry, score, categories, onSelect }) {
  const cat = categories.find(c => c.id === entry.category)
  return (
    <li>
      <button className="search-modal-result ai-row-btn" onClick={() => onSelect(entry)}>
        <Cover className="search-modal-cover" src={entry.cover_url} alt="" compact />
        <div className="search-modal-info">
          <strong className="search-modal-title">{entry.title}</strong>
          <span className="search-modal-sub">
            {[cat?.label, entry.series, STATUS_LABELS[entry.status], entry.rating != null ? `★ ${entry.rating}` : null]
              .filter(Boolean).join(' · ')}
          </span>
        </div>
        {score != null && (
          <span className="ai-score" title="Semantic match">
            <span className="ai-score-bar" style={{ width: `${scorePct(score)}%` }} />
            <span className="ai-score-num">{scorePct(score)}%</span>
          </span>
        )}
      </button>
    </li>
  )
}

function AskTab({ categories, state, setState, onSelect }) {
  const { query, response, busy } = state
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function runAsk(raw = query) {
    const q = String(raw).trim()
    if (!q || busy) return
    setState(s => ({ ...s, query: q, busy: true }))
    try {
      const res = await window.ai.ask(q, {
        categories: categories.map(c => ({ id: c.id, label: c.label })),
      })
      setState(s => ({ ...s, response: res, busy: false }))
    } catch {
      setState(s => ({ ...s, response: { error: 'Something went wrong running that query.' }, busy: false }))
    }
  }

  const count = response && !response.error ? response.results.length : null

  return (
    <>
      {/* Persistent live region so results are announced, not just rendered. */}
      <p className="sr-only" role="status" aria-live="polite">
        {busy ? 'Searching your library…'
          : count == null ? ''
          : `${count} ${count === 1 ? 'result' : 'results'}`}
      </p>

      <div className="ai-ask-row">
        <label className="sr-only" htmlFor="ai-ask-input">Ask about your library</label>
        <input
          id="ai-ask-input"
          ref={inputRef}
          className="search-modal-input"
          placeholder="Ask about your library…"
          value={query}
          onChange={e => setState(s => ({ ...s, query: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') runAsk() }}
        />
        <button className="ai-primary-btn" onClick={() => runAsk()} disabled={busy || !query.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      {response?.error && <p className="search-empty">{response.error}</p>}

      {response && !response.error && (
        <>
          <div className="ai-chip-row">
            {response.chips.map((c, i) => <span key={`${c}-${i}`} className="ai-chip">{c}</span>)}
            <span className="ai-chip ai-chip-dim">
              {response.engine === 'ollama' ? 'parsed by Ollama' : 'parsed offline'}
              {response.semantic ? ' · semantic ranking' : ''}
            </span>
            <span className="ai-result-count">
              {count} {count === 1 ? 'result' : 'results'}
            </span>
          </div>
          {count === 0 ? (
            <p className="search-empty">Nothing in your library matches that.</p>
          ) : (
            <ul className="search-modal-results ai-results">
              {response.results.map(({ entry, score }) => (
                <ResultRow key={entry.id} entry={entry} score={score} categories={categories} onSelect={onSelect} />
              ))}
            </ul>
          )}
        </>
      )}

      {!response && !busy && (
        <div className="ai-examples">
          <span className="ai-examples-label">Try one of these</span>
          <div className="ai-example-list">
            {EXAMPLE_PROMPTS.map(p => (
              <button key={p} className="ai-example" onClick={() => runAsk(p)}>{p}</button>
            ))}
          </div>
          <p className="ai-hint">
            Ask in plain language — filters like category, rating, status, genre and year are
            understood offline, and whatever remains is matched by meaning, not keywords.
          </p>
        </div>
      )}
    </>
  )
}

function ForYouTab({ categories, activeCat, onSelect }) {
  const [catId, setCatId]   = useState(activeCat?.id ?? categories[0]?.id)
  const [busy, setBusy]     = useState(false)
  const [recs, setRecs]     = useState(null)
  const [fresh, setFresh]   = useState(null)   // { loading, suggestions?, error? }
  const [ollamaOn, setOllamaOn] = useState(false)

  useEffect(() => {
    window.ai.status().then(s => setOllamaOn(!!s.ollama?.enabled)).catch(() => {})
  }, [])

  useEffect(() => {
    let stale = false
    setBusy(true)
    setFresh(null)
    window.ai.recommend({ category: catId, limit: 10 })
      .then(r => { if (!stale) setRecs(r) })
      .catch(() => { if (!stale) setRecs({ picks: [], reason: 'error' }) })
      .finally(() => { if (!stale) setBusy(false) })
    return () => { stale = true }
  }, [catId])

  async function loadFresh() {
    const cat = categories.find(c => c.id === catId)
    setFresh({ loading: true })
    const res = await window.ai.suggestNew({ category: catId, categoryLabel: cat?.label })
    setFresh(res.ok ? { suggestions: res.suggestions } : { error: res.error })
  }

  const emptyText = {
    'no-backlog': 'Your backlog is empty — add some Planned entries and they’ll be ranked here.',
    'no-signal':  'Rate a few entries first so there’s a taste profile to rank against.',
    'error':      'Recommendations failed to load.',
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {busy ? 'Ranking your backlog…' : recs ? `${recs.picks.length} recommendations` : ''}
      </p>

      <div className="ai-ask-row">
        <label className="sr-only" htmlFor="ai-foryou-cat">Category to recommend from</label>
        <select
          id="ai-foryou-cat"
          className="sort-select ai-cat-select"
          value={catId}
          onChange={e => setCatId(e.target.value)}
        >
          {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span className="ai-hint-inline">What to pick next, ranked against what you loved.</span>
      </div>

      {busy && <p className="ai-hint">Ranking your backlog…</p>}
      {!busy && recs && recs.picks.length === 0 && (
        <p className="search-empty">{emptyText[recs.reason] ?? 'No picks yet.'}</p>
      )}
      {!busy && recs && recs.picks.length > 0 && (
        <ul className="search-modal-results ai-results">
          {recs.picks.map(({ entry, score, because }) => (
            <li key={entry.id}>
              <button className="search-modal-result ai-row-btn" onClick={() => onSelect(entry)}>
                <Cover className="search-modal-cover" src={entry.cover_url} alt="" compact />
                <div className="search-modal-info">
                  <strong className="search-modal-title">{entry.title}</strong>
                  <span className="search-modal-sub">
                    {because ? `Because you liked ${because}` : 'From your backlog'}
                  </span>
                </div>
                <span className="ai-score" title="Match with your taste profile">
                  <span className="ai-score-bar" style={{ width: `${scorePct(score)}%` }} />
                  <span className="ai-score-num">{scorePct(score)}%</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="ai-fresh">
        <div className="ai-fresh-head">
          <h3>Fresh picks</h3>
          <span className="ai-hint-inline">New titles you don’t have yet — needs Ollama.</span>
        </div>
        {!ollamaOn ? (
          <p className="ai-hint">Enable Ollama in Settings → AI to get brand-new suggestions from a local LLM.</p>
        ) : fresh?.loading ? (
          <p className="ai-hint">Asking your local model…</p>
        ) : fresh?.error ? (
          <p className="search-empty">{fresh.error}</p>
        ) : fresh?.suggestions ? (
          <ul className="ai-fresh-list">
            {fresh.suggestions.map((s, i) => (
              <li key={`${s.title}-${i}`} className="ai-fresh-item">
                <strong>{s.title}</strong>
                {s.reason && <span>{s.reason}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <button className="ai-primary-btn" onClick={loadFresh}>Suggest new titles</button>
        )}
      </div>
    </>
  )
}

function SeriesTab({ categories, state, setState, onApplied }) {
  const { catId, suggestions } = state
  const [busy, setBusy]         = useState(false)
  const [applying, setApplying] = useState(null) // index being applied

  async function scan() {
    setBusy(true)
    try {
      const found = await window.ai.detectSeries({ category: catId })
      setState(s => ({ ...s, suggestions: found }))
    } catch {
      setState(s => ({ ...s, suggestions: [] }))
    }
    setBusy(false)
  }

  async function apply(s, i) {
    setApplying(i)
    await window.ai.applySeries({
      category: s.category, name: s.name, seriesId: s.seriesId, entryIds: s.entryIds,
    })
    setApplying(null)
    setState(prev => ({ ...prev, suggestions: prev.suggestions.filter((_, idx) => idx !== i) }))
    onApplied?.()
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {busy ? 'Scanning for series…'
          : suggestions ? `${suggestions.length} series suggestions` : ''}
      </p>

      <div className="ai-ask-row">
        <label className="sr-only" htmlFor="ai-series-cat">Category to scan</label>
        <select
          id="ai-series-cat"
          className="sort-select ai-cat-select"
          value={catId}
          onChange={e => setState(s => ({ ...s, catId: e.target.value, suggestions: null }))}
        >
          {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="ai-primary-btn" onClick={scan} disabled={busy}>
          {busy ? 'Scanning…' : 'Scan for series'}
        </button>
      </div>

      {suggestions == null && !busy && (
        <p className="ai-hint">
          Finds entries that look like installments of the same series — “Vol. 2”,
          “Season 3”, shared subtitles — and groups them for you. Nothing is changed
          until you apply a suggestion.
        </p>
      )}
      {suggestions != null && suggestions.length === 0 && !busy && (
        <p className="search-empty">No series groupings detected among unassigned entries.</p>
      )}
      {suggestions != null && suggestions.length > 0 && (
        <ul className="ai-series-list">
          {suggestions.map((s, i) => (
            <li key={`${s.name}-${i}`} className="ai-series-item">
              <div className="ai-series-info">
                <strong>{s.name}</strong>
                <span className="ai-series-kind">
                  {s.matchType === 'existing' ? 'add to existing series' : 'new series'} · {s.entryIds.length} entries
                </span>
                <span className="ai-series-titles">{s.titles.join(' · ')}</span>
              </div>
              <button
                className="ai-primary-btn"
                disabled={applying != null}
                onClick={() => apply(s, i)}
              >
                {applying === i ? 'Applying…' : 'Apply'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function AiPanel({ open, categories = [], activeCat, color, onClose, onSelectEntry, onLibraryChanged }) {
  const [tab, setTab] = useState('ask')
  const [ask, setAsk] = useState({ query: '', response: null, busy: false })
  const [series, setSeries] = useState({ catId: null, suggestions: null })
  const [index, setIndex] = useState(null)
  const dialogRef  = useRef(null)
  const restoreRef = useRef(null)

  // Default the Series category to whatever tab the user is on, until they pick.
  const seriesState = {
    ...series,
    catId: series.catId ?? activeCat?.id ?? categories[0]?.id,
  }

  // Opening always lands on Ask — the trigger is labelled "Ask AI", so resuming
  // on a different tab is disorienting. Tab *contents* still survive (they live
  // here, not in the tab components), so nothing the user typed is lost.
  useEffect(() => { if (open) setTab('ask') }, [open])

  // Restore focus to whatever opened the panel once it closes.
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    return () => {
      const el = restoreRef.current
      if (el && typeof el.focus === 'function') el.focus()
    }
  }, [open])

  // Track index progress so the panel can warn that results may be partial.
  useEffect(() => {
    if (!open || !window.ai) return
    let alive = true
    window.ai.status().then(s => { if (alive) setIndex(s.index) }).catch(() => {})
    const off = window.ai.onIndexProgress(p => { if (alive) setIndex(p) })
    return () => { alive = false; off?.() }
  }, [open])

  if (!open) return null

  const indexing = !!index && index.done !== true && index.total > 0 && index.indexed < index.total

  // Keep Tab focus inside the dialog.
  function onKeyDown(e) {
    if (e.key !== 'Tab') return
    const nodes = dialogRef.current?.querySelectorAll(FOCUSABLE)
    if (!nodes?.length) return
    const list = [...nodes].filter(n => n.offsetParent !== null)
    if (!list.length) return
    const first = list[0]
    const last  = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  function onTabKeyDown(e) {
    const i = TABS.findIndex(t => t.id === tab)
    let next = null
    if (e.key === 'ArrowRight')     next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home')      next = 0
    else if (e.key === 'End')       next = TABS.length - 1
    if (next == null) return
    e.preventDefault()
    const id = TABS[next].id
    setTab(id)
    requestAnimationFrame(() => dialogRef.current?.querySelector(`#ai-tab-${id}`)?.focus())
  }

  return (
    <div className="search-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="search-modal ai-panel"
        style={{ '--accent': color }}
        role="dialog"
        aria-modal="true"
        aria-label="Ask AI"
        onKeyDown={onKeyDown}
      >
        <div className="ai-panel-header">
          <div className="ai-panel-tabs" role="tablist" aria-label="AI tools">
            {TABS.map(t => (
              <button
                key={t.id}
                id={`ai-tab-${t.id}`}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`ai-tabpanel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className={`ai-tab-btn ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
                onKeyDown={onTabKeyDown}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close AI panel">✕</button>
        </div>

        <div
          className="ai-tab"
          role="tabpanel"
          id={`ai-tabpanel-${tab}`}
          aria-labelledby={`ai-tab-${tab}`}
          tabIndex={0}
        >
          {indexing && (
            <div className="ai-index-note">
              <span className="ai-index-dot" aria-hidden="true" />
              Building the search index — {index.indexed} of {index.total} indexed. Results may be incomplete.
            </div>
          )}

          {tab === 'ask' && (
            <AskTab categories={categories} state={ask} setState={setAsk} onSelect={onSelectEntry} />
          )}
          {tab === 'foryou' && (
            <ForYouTab categories={categories} activeCat={activeCat} onSelect={onSelectEntry} />
          )}
          {tab === 'series' && (
            <SeriesTab
              categories={categories}
              state={seriesState}
              setState={setSeries}
              onApplied={onLibraryChanged}
            />
          )}
        </div>
      </div>
    </div>
  )
}
