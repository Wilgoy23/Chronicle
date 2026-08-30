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

const ENGINE_LABELS = {
  ollama:    'parsed by Ollama',
  heuristic: 'parsed offline',
  refined:   'filters edited',
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

function scorePct(score) {
  // Cosine similarity ~[0,1] for these models; clamp for display.
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

// An entry row: the row body opens the entry for editing (the panel stays put
// underneath, so closing the editor lands you back in your results), while the
// trailing action leaves the panel and reveals the entry in the library grid.
function ResultRow({ entry, subtitle, score, scoreTitle, onSelect, onReveal }) {
  return (
    <li className="ai-result">
      <button className="search-modal-result ai-row-btn" onClick={() => onSelect(entry)}>
        <Cover className="search-modal-cover" src={entry.cover_url} alt="" compact />
        <div className="search-modal-info">
          <strong className="search-modal-title">{entry.title}</strong>
          <span className="search-modal-sub">{subtitle}</span>
        </div>
        {score != null && (
          <span className="ai-score" title={scoreTitle}>
            <span className="ai-score-bar" style={{ width: `${scorePct(score)}%` }} />
            <span className="ai-score-num">{scorePct(score)}%</span>
          </span>
        )}
      </button>
      <button
        className="ai-row-action"
        onClick={() => onReveal(entry)}
        title="Show in library"
        aria-label={`Show ${entry.title} in library`}
      >
        ↗
      </button>
    </li>
  )
}

function AskTab({ categories, state, setState, onSelect, onReveal }) {
  const { query, response, busy } = state
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // `refine` re-runs the current filter with one facet cleared, so dismissing a
  // chip narrows the search without the user having to rewrite the sentence.
  async function runAsk(raw = query, refine = null) {
    const q = String(raw).trim()
    if (busy || (!q && !refine)) return
    setState(s => ({ ...s, query: q, busy: true }))
    try {
      const res = await window.ai.ask(q, {
        categories: categories.map(c => ({ id: c.id, label: c.label })),
        refine,
      })
      setState(s => ({ ...s, response: res, busy: false }))
    } catch {
      setState(s => ({ ...s, response: { error: 'Something went wrong running that query.' }, busy: false }))
    }
  }

  function removeChip(key) {
    if (!response?.filter) return
    runAsk(query, { filter: response.filter, remove: key })
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
            {response.chips.map(c => (
              <button
                key={c.key}
                className="ai-chip ai-chip-removable"
                onClick={() => removeChip(c.key)}
                disabled={busy}
                title={`Remove “${c.label}” from this search`}
                aria-label={`Remove filter ${c.label}`}
              >
                {c.label}
                <span className="ai-chip-x" aria-hidden="true">✕</span>
              </button>
            ))}
            <span className="ai-chip ai-chip-dim">
              {ENGINE_LABELS[response.engine] ?? response.engine}
              {response.semantic ? ' · semantic ranking' : ''}
            </span>
            <span className="ai-result-count">
              {count} {count === 1 ? 'result' : 'results'}
            </span>
          </div>
          {count === 0 ? (
            <p className="search-empty">
              {response.chips.length
                ? 'Nothing matches all of those filters — try removing one.'
                : 'Nothing in your library matches that.'}
            </p>
          ) : (
            <ul className="search-modal-results ai-results">
              {response.results.map(({ entry, score }) => {
                const cat = categories.find(c => c.id === entry.category)
                return (
                  <ResultRow
                    key={entry.id}
                    entry={entry}
                    subtitle={[cat?.label, entry.series, STATUS_LABELS[entry.status], entry.rating != null ? `★ ${entry.rating}` : null]
                      .filter(Boolean).join(' · ')}
                    score={score}
                    scoreTitle="Semantic match"
                    onSelect={onSelect}
                    onReveal={onReveal}
                  />
                )
              })}
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

function ForYouTab({ categories, activeCat, onSelect, onReveal, onAddTitle }) {
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
            <ResultRow
              key={entry.id}
              entry={entry}
              subtitle={because ? `Because you liked ${because}` : 'From your backlog'}
              score={score}
              scoreTitle="Match with your taste profile"
              onSelect={onSelect}
              onReveal={onReveal}
            />
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
                <div className="ai-fresh-text">
                  <strong>{s.title}</strong>
                  {s.reason && <span>{s.reason}</span>}
                </div>
                {/* A suggestion the user can't act on is just trivia — this hands
                    the title to the catalogue search so it can be added. */}
                <button
                  className="ai-secondary-btn"
                  onClick={() => onAddTitle(s.title, catId)}
                  aria-label={`Find and add ${s.title}`}
                >
                  Find &amp; add
                </button>
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
  const { catId, suggestions, undo } = state
  const [busy, setBusy]         = useState(false)
  const [applying, setApplying] = useState(null) // index being applied
  const [error, setError]       = useState(null)
  const scanning = useRef(false)

  // Scan as soon as the tab is shown for a category that hasn't been scanned —
  // the old "Scan for series" button made an automatic feature feel manual.
  // Terminates because scan() always leaves suggestions as an array; the ref
  // keeps StrictMode's double-invoked effect from firing two scans.
  useEffect(() => {
    if (suggestions == null && !scanning.current) scan()
  }, [catId, suggestions])

  async function scan() {
    if (scanning.current) return
    scanning.current = true
    setBusy(true)
    setError(null)
    try {
      const found = await window.ai.detectSeries({ category: catId })
      // Editable copies: the user may rename a group or untick members before
      // applying, and those edits must survive a tab switch like everything else.
      setState(s => ({
        ...s,
        undo: null,
        suggestions: found.map(f => ({ ...f, draftName: f.name, selected: [...f.entryIds] })),
      }))
    } catch {
      setState(s => ({ ...s, suggestions: [], undo: null }))
    }
    scanning.current = false
    setBusy(false)
  }

  function edit(i, patch) {
    setState(s => ({
      ...s,
      suggestions: s.suggestions.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
    }))
  }

  function toggleMember(i, id) {
    const s = suggestions[i]
    const next = s.selected.includes(id)
      ? s.selected.filter(x => x !== id)
      : [...s.selected, id]
    edit(i, { selected: next })
  }

  async function apply(s, i) {
    setApplying(i)
    setError(null)
    const res = await window.ai.applySeries({
      category: s.category,
      name: s.draftName,
      seriesId: s.seriesId,
      entryIds: s.selected,
    })
    setApplying(null)
    if (!res?.ok) { setError(res?.error ?? 'Could not apply that grouping.'); return }
    setState(prev => ({
      ...prev,
      suggestions: prev.suggestions.filter((_, idx) => idx !== i),
      undo: {
        name: s.draftName,
        count: s.selected.length,
        seriesId: res.seriesId,
        entryIds: s.selected,
        created: res.created,
      },
    }))
    onApplied?.()
  }

  async function undoLast() {
    if (!undo) return
    await window.ai.undoSeries({
      seriesId: undo.seriesId, entryIds: undo.entryIds, created: undo.created,
    })
    setState(s => ({ ...s, undo: null }))
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
          onChange={e => setState(s => ({ ...s, catId: e.target.value, suggestions: null, undo: null }))}
        >
          {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="ai-secondary-btn" onClick={scan} disabled={busy}>
          {busy ? 'Scanning…' : 'Rescan'}
        </button>
      </div>

      {undo && (
        <div className="ai-undo" role="status">
          <span>Grouped {undo.count} {undo.count === 1 ? 'entry' : 'entries'} under “{undo.name}”.</span>
          <button className="ai-undo-btn" onClick={undoLast}>Undo</button>
        </div>
      )}

      {error && <p className="search-empty">{error}</p>}

      {busy && <p className="ai-hint">Looking for installments of the same series…</p>}

      {suggestions != null && suggestions.length === 0 && !busy && (
        <p className="search-empty">No series groupings detected among unassigned entries.</p>
      )}

      {suggestions != null && suggestions.length > 0 && (
        <ul className="ai-series-list">
          {suggestions.map((s, i) => (
            <li key={`${s.name}-${i}`} className="ai-series-item">
              <div className="ai-series-info">
                {s.matchType === 'existing' ? (
                  <strong>{s.name}</strong>
                ) : (
                  <>
                    <label className="sr-only" htmlFor={`ai-series-name-${i}`}>Series name</label>
                    <input
                      id={`ai-series-name-${i}`}
                      className="ai-series-name"
                      value={s.draftName}
                      onChange={e => edit(i, { draftName: e.target.value })}
                    />
                  </>
                )}
                <span className="ai-series-kind">
                  {s.matchType === 'existing' ? 'add to existing series' : 'new series'} ·{' '}
                  {s.selected.length} of {s.entryIds.length} selected
                </span>
                {/* Ticking members off is the escape hatch for a heuristic that
                    over-grouped — better than discarding the whole suggestion. */}
                <ul className="ai-series-members">
                  {s.entryIds.map((id, j) => (
                    <li key={id}>
                      <label className="ai-series-member">
                        <input
                          type="checkbox"
                          checked={s.selected.includes(id)}
                          onChange={() => toggleMember(i, id)}
                        />
                        <span>{s.titles[j]}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                className="ai-primary-btn"
                disabled={applying != null || !s.selected.length || !s.draftName.trim()}
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

export default function AiPanel({
  open, categories = [], activeCat, color,
  onClose, onSelectEntry, onRevealEntry, onAddTitle, onLibraryChanged,
}) {
  const [tab, setTab] = useState('ask')
  const [ask, setAsk] = useState({ query: '', response: null, busy: false })
  const [series, setSeries] = useState({ catId: null, suggestions: null, undo: null })
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
            <AskTab
              categories={categories}
              state={ask}
              setState={setAsk}
              onSelect={onSelectEntry}
              onReveal={onRevealEntry}
            />
          )}
          {tab === 'foryou' && (
            <ForYouTab
              categories={categories}
              activeCat={activeCat}
              onSelect={onSelectEntry}
              onReveal={onRevealEntry}
              onAddTitle={onAddTitle}
            />
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
