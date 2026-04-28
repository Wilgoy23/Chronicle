import { useEffect, useRef, useState } from 'react'
import HardcoverKeyPrompt from './HardcoverKeyPrompt'
import SeriesSelect from './SeriesSelect'
import { STATUS_LABELS } from '../App'

const today = () => new Date().toISOString().slice(0, 10)

export default function SearchModal({ open, category, color, seriesList, onAdd, onClose }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [needsKey, setNeedsKey] = useState(false)
  const [addedIds, setAddedIds] = useState(new Set())
  const [addCount, setAddCount] = useState(0)
  const [defSeries, setDefSeries] = useState('')
  const [defStatus, setDefStatus] = useState('completed')
  const debounceRef = useRef(null)
  const inputRef    = useRef(null)

  // Reset state when opening or switching category
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setError(null)
      setNeedsKey(false)
      setAddedIds(new Set())
      setAddCount(0)
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open, category])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(null); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 420)
    return () => clearTimeout(debounceRef.current)
  }, [query, category])

  async function doSearch(q) {
    setLoading(true)
    setError(null)
    setNeedsKey(false)
    const result = category === 'book'
      ? await window.api.searchBooks(q)
      : await window.api.searchAnime(q)
    setLoading(false)
    if (result?.error === 'NO_TOKEN') { setNeedsKey(true); return }
    if (result?.error)                { setError(result.error); return }
    setResults(result ?? [])
  }

  async function handleAdd(r) {
    if (addedIds.has(r.id)) return
    const entry = await window.db.addEntry({
      category,
      title:     r.title,
      status:    defStatus,
      rating:    r.score ?? null,
      notes:     r.description ?? '',
      cover_url: r.cover || null,
      series:    defSeries.trim() || null,
      date_read: today(),
    })
    setAddedIds(prev => new Set([...prev, r.id]))
    setAddCount(c => c + 1)
    onAdd(entry)
  }

  if (!open) return null

  return (
    <div
      className="search-modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="search-modal" style={{ '--accent': color }}>

        {/* ── Search bar ─────────────────────────────── */}
        <div className="search-modal-header">
          <span className="search-icon">🔍</span>
          <input
            ref={inputRef}
            className="search-modal-input"
            placeholder={category === 'book' ? 'Search Hardcover…' : 'Search AniList…'}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {loading && <span className="search-spinner" />}
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        {needsKey ? (
          <div style={{ padding: '1rem' }}>
            <HardcoverKeyPrompt
              color={color}
              onSaved={() => { setNeedsKey(false); if (query.trim()) doSearch(query.trim()) }}
            />
          </div>
        ) : (
          <>
            {/* ── Batch defaults ─────────────────────── */}
            <div className="search-modal-options">
              <div className="search-opt-group">
                <span className="search-opt-label">Series</span>
                <SeriesSelect
                  value={defSeries}
                  onChange={setDefSeries}
                  series={seriesList}
                  placeholder="No series"
                />
              </div>
              <div className="search-opt-group">
                <span className="search-opt-label">Status</span>
                <select
                  className="search-opt-select"
                  value={defStatus}
                  onChange={e => setDefStatus(e.target.value)}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              {addCount > 0 && (
                <span className="search-added-count">
                  {addCount} {addCount === 1 ? 'entry' : 'entries'} added
                </span>
              )}
            </div>

            {/* ── Results ────────────────────────────── */}
            <ul className="search-modal-results">
              {error && (
                <li style={{ padding: '1rem' }}>
                  <p className="search-error">{error}</p>
                </li>
              )}
              {!loading && query && results.length === 0 && !error && (
                <li>
                  <p className="search-empty">No results for &ldquo;{query}&rdquo;</p>
                </li>
              )}
              {!query && (
                <li className="search-modal-hint">
                  Type above to search {category === 'book' ? 'Hardcover' : 'AniList'}
                </li>
              )}
              {results.map(r => {
                const added = addedIds.has(r.id)
                return (
                  <li key={r.id} className={`search-modal-result${added ? ' added' : ''}`}>
                    {r.cover
                      ? <img className="search-modal-cover" src={r.cover} alt="" loading="lazy" />
                      : <div className="search-modal-cover search-modal-cover--empty" />
                    }
                    <div className="search-modal-info">
                      <strong className="search-modal-title">{r.title}</strong>
                      {(r.author || r.genres) && (
                        <span className="search-modal-sub">{r.author || r.genres}</span>
                      )}
                      {(r.episodes || r.year) && (
                        <span className="search-modal-meta">
                          {[r.episodes && `${r.episodes} eps`, r.year].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    <button
                      className={`search-add-btn${added ? ' search-add-btn--added' : ''}`}
                      onClick={() => handleAdd(r)}
                      disabled={added}
                    >
                      {added ? '✓ Added' : '+ Add'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
