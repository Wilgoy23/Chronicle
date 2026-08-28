import { useEffect, useRef, useState } from 'react'
import Cover from './Cover'
import { STATUS_LABELS } from '../App'

// The offline AI hub: "Ask" (natural-language + semantic search over the
// library), "For You" (taste-profile ranked backlog, plus optional Ollama
// fresh picks), and "Series" (automatic series-detection suggestions).
// Everything runs on-device via window.ai → the Electron main process.

const TABS = [
  { id: 'ask',    label: 'Ask' },
  { id: 'foryou', label: 'For You' },
  { id: 'series', label: 'Series' },
]

function scorePct(score) {
  // Cosine similarity ~[0,1] for these models; clamp for display.
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

function ResultRow({ entry, score, categories, onSelect }) {
  const cat = categories.find(c => c.id === entry.category)
  return (
    <li className="search-modal-result" onClick={() => onSelect(entry)}>
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
    </li>
  )
}

function AskTab({ categories, onSelect }) {
  const [query, setQuery]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [response, setResponse] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60) }, [])

  async function runAsk() {
    const q = query.trim()
    if (!q || busy) return
    setBusy(true)
    try {
      const res = await window.ai.ask(q, { categories: categories.map(c => ({ id: c.id, label: c.label })) })
      setResponse(res)
    } catch {
      setResponse({ error: 'Something went wrong running that query.' })
    }
    setBusy(false)
  }

  return (
    <div className="ai-tab">
      <div className="ai-ask-row">
        <input
          ref={inputRef}
          className="search-modal-input"
          placeholder='Try “highly rated anime I watched last year” or “cozy books about friendship”…'
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runAsk() }}
        />
        <button className="ai-primary-btn" onClick={runAsk} disabled={busy || !query.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      {response?.error && <p className="search-empty">{response.error}</p>}

      {response && !response.error && (
        <>
          <div className="ai-chip-row">
            {response.chips.map((c, i) => <span key={i} className="ai-chip">{c}</span>)}
            <span className="ai-chip ai-chip-dim">
              {response.engine === 'ollama' ? 'parsed by Ollama' : 'parsed offline'}
              {response.semantic ? ' · semantic ranking' : ''}
            </span>
          </div>
          {response.results.length === 0 ? (
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

      {!response && (
        <p className="ai-hint">
          Ask in plain language — filters like category, rating, status, genre and year are
          understood offline, and whatever remains is matched by meaning, not keywords.
        </p>
      )}
    </div>
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
    <div className="ai-tab">
      <div className="ai-ask-row">
        <select className="sort-select ai-cat-select" value={catId} onChange={e => setCatId(e.target.value)}>
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
            <li key={entry.id} className="search-modal-result" onClick={() => onSelect(entry)}>
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
              <li key={i} className="ai-fresh-item">
                <strong>{s.title}</strong>
                {s.reason && <span>{s.reason}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <button className="ai-primary-btn" onClick={loadFresh}>Suggest new titles</button>
        )}
      </div>
    </div>
  )
}

function SeriesTab({ categories, activeCat, onApplied }) {
  const [catId, setCatId] = useState(activeCat?.id ?? categories[0]?.id)
  const [busy, setBusy]   = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [applying, setApplying] = useState(null) // suggestion index being applied

  async function scan(id = catId) {
    setBusy(true)
    try {
      setSuggestions(await window.ai.detectSeries({ category: id }))
    } catch {
      setSuggestions([])
    }
    setBusy(false)
  }

  useEffect(() => { setSuggestions(null) }, [catId])

  async function apply(s, i) {
    setApplying(i)
    await window.ai.applySeries({
      category: s.category, name: s.name, seriesId: s.seriesId, entryIds: s.entryIds,
    })
    setApplying(null)
    setSuggestions(prev => prev.filter((_, idx) => idx !== i))
    onApplied?.()
  }

  return (
    <div className="ai-tab">
      <div className="ai-ask-row">
        <select className="sort-select ai-cat-select" value={catId} onChange={e => setCatId(e.target.value)}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="ai-primary-btn" onClick={() => scan()} disabled={busy}>
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
    </div>
  )
}

export default function AiPanel({ open, categories = [], activeCat, color, onClose, onSelectEntry, onLibraryChanged }) {
  const [tab, setTab] = useState('ask')

  useEffect(() => { if (open) setTab('ask') }, [open])

  if (!open) return null

  return (
    <div className="search-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-modal ai-panel" style={{ '--accent': color }}>
        <div className="ai-panel-header">
          <div className="ai-panel-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`ai-tab-btn ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        {tab === 'ask'    && <AskTab categories={categories} onSelect={onSelectEntry} />}
        {tab === 'foryou' && <ForYouTab categories={categories} activeCat={activeCat} onSelect={onSelectEntry} />}
        {tab === 'series' && <SeriesTab categories={categories} activeCat={activeCat} onApplied={onLibraryChanged} />}
      </div>
    </div>
  )
}
