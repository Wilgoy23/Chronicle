import { useEffect, useRef, useState } from 'react'
import SeriesSelect from './SeriesSelect'
import Cover from './Cover'
import { STATUS_LABELS } from '../App'

const today = () => new Date().toISOString().slice(0, 10)

const API_LABELS = {
  book:  'Hardcover',
  anime: 'AniList',
  manga: 'AniList',
  movie: 'TMDB',
  tv:    'TMDB',
  game:  'RAWG',
}

// Stable source keys persisted with each entry so releases can be looked up later.
const SOURCE_KEYS = {
  book:  'hardcover',
  anime: 'anilist',
  manga: 'anilist',
  movie: 'tmdb',
  tv:    'tmdb',
  game:  'rawg',
}

const KEY_HINTS = {
  book:  'hardcover.app → Settings → API',
  movie: 'themoviedb.org → Settings → API → API Key (v3)',
  tv:    'themoviedb.org → Settings → API → API Key (v3)',
  game:  'rawg.io → API Key (free account)',
}

async function doApiSearch(category, query) {
  if (category === 'book')  return window.api.searchBooks(query)
  if (category === 'anime') return window.api.searchAnime(query)
  if (category === 'manga') return window.api.searchManga(query)
  if (category === 'movie') return window.api.searchMovies(query)
  if (category === 'tv')    return window.api.searchTv(query)
  if (category === 'game')  return window.api.searchGames(query)
  return []
}

export default function SearchModal({
  open, category, color, seriesList = [], existingEntries = [],
  defaultSeriesId = null, defaultQuery = '', onAdd, onAddManually, onClose,
}) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [needsKey, setNeedsKey]   = useState(false)
  const [defSeriesId, setDefSeriesId] = useState(defaultSeriesId)
  const [defStatus, setDefStatus] = useState('completed')
  const [addedIds, setAddedIds]   = useState(new Set())
  const [dupIds, setDupIds]       = useState(new Set()) // results flagged as duplicates, awaiting "Add anyway"
  const [addCount, setAddCount]   = useState(0)
  const debounceRef = useRef(null)
  const inputRef    = useRef(null)

  // "In Library" is keyed on the external source id (5.7), so a same-title remake
  // with a different id is still addable. All results here share this category's source.
  const existingSourceIds = new Set(
    existingEntries.filter(e => e.source_id != null).map(e => String(e.source_id))
  )

  useEffect(() => {
    if (open) {
      // Normally blank; seeded when something else (an AI "fresh pick") already
      // knows the title being looked for, so the search runs on its own.
      setQuery(defaultQuery)
      setResults([])
      setError(null)
      setNeedsKey(false)
      setAddedIds(new Set())
      setDupIds(new Set())
      setAddCount(0)
      setDefSeriesId(defaultSeriesId)
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open, category])

  // Keep defaultSeriesId in sync if parent changes it while modal is open
  useEffect(() => { setDefSeriesId(defaultSeriesId) }, [defaultSeriesId])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(null); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query.trim()), 420)
    return () => clearTimeout(debounceRef.current)
  }, [query, category])

  async function runSearch(q) {
    setLoading(true)
    setError(null)
    setNeedsKey(false)
    const result = await doApiSearch(category, q)
    setLoading(false)
    if (result?.error === 'NO_TOKEN') { setNeedsKey(true); return }
    if (result?.error) { setError(result.error); return }
    setResults(result ?? [])
  }

  async function handleAdd(r, allowDuplicate = false) {
    if (addedIds.has(r.id)) return
    const entry = await window.db.addEntry({
      category,
      title:     r.title,
      status:    defStatus,
      rating:    r.score ?? null,
      notes:     '',
      description: r.description ?? null,
      genres:    r.genres || null,
      cover_url: r.cover || null,
      series_id: defSeriesId ?? null,
      date_read: today(),
      source:    SOURCE_KEYS[category] ?? null,
      source_id: r.id ?? null,
      year:      r.year ?? null,
      // Episode/chapter counts from the API seed the progress total.
      progress:       0,
      progress_total: r.episodes ?? r.chapters ?? null,
      allowDuplicate,
    })
    // A title/year-tier match (not caught by the source-id "In Library" gate):
    // flag the row so the button offers an explicit "Add anyway".
    if (entry?.error === 'DUPLICATE') {
      setDupIds(prev => new Set([...prev, r.id]))
      return
    }
    setDupIds(prev => { const n = new Set(prev); n.delete(r.id); return n })
    setAddedIds(prev => new Set([...prev, r.id]))
    setAddCount(c => c + 1)
    onAdd(entry)
  }

  if (!open) return null

  const apiLabel = API_LABELS[category] ?? 'external API'

  return (
    <div className="search-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-modal" style={{ '--accent': color }}>

        <div className="search-modal-header">
          <input
            ref={inputRef}
            className="search-modal-input"
            placeholder={`Search ${apiLabel}…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {loading && <span className="search-spinner" />}
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        {needsKey ? (
          <div className="search-needs-key">
            <p className="search-needs-key-msg">
              <strong>{apiLabel} API key required.</strong>
              {KEY_HINTS[category] && (
                <span> Get yours at <em>{KEY_HINTS[category]}</em> and add it in Settings → API Keys.</span>
              )}
            </p>
            <div className="search-needs-key-actions">
              <button className="add-btn" style={{ '--accent': color }} onClick={onAddManually}>
                Add manually instead
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="search-modal-options">
              <div className="search-opt-group">
                <span className="search-opt-label">Series</span>
                <SeriesSelect
                  value={defSeriesId}
                  onChange={setDefSeriesId}
                  series={seriesList}
                  category={category}
                  placeholder="No series"
                />
              </div>
              <div className="search-opt-group">
                <span className="search-opt-label">Status</span>
                <select className="search-opt-select" value={defStatus} onChange={e => setDefStatus(e.target.value)}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              {addCount > 0 && (
                <span className="search-added-count">{addCount} added</span>
              )}
            </div>

            <ul className="search-modal-results">
              {error && <li style={{ padding: '1rem' }}><p className="search-error">{error}</p></li>}
              {!loading && query && results.length === 0 && !error && (
                <li><p className="search-empty">No results for &ldquo;{query}&rdquo;</p></li>
              )}
              {!query && (
                <li className="search-modal-hint">Type to search {apiLabel}</li>
              )}
              {results.map(r => {
                const inLibrary = existingSourceIds.has(String(r.id))
                const added = addedIds.has(r.id)
                const isDup = dupIds.has(r.id)
                return (
                  <li key={r.id} className={`search-modal-result${added || inLibrary ? ' added' : ''}`}>
                    <Cover className="search-modal-cover" src={r.cover} alt="" compact />
                    <div className="search-modal-info">
                      <strong className="search-modal-title">{r.title}</strong>
                      {(r.author || r.genres) && (
                        <span className="search-modal-sub">{r.author || r.genres}</span>
                      )}
                      {(r.episodes || r.chapters || r.year) && (
                        <span className="search-modal-meta">
                          {[
                            r.episodes && `${r.episodes} eps`,
                            r.chapters && `${r.chapters} ch`,
                            r.year,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    <button
                      className={`search-add-btn${added || inLibrary ? ' search-add-btn--added' : ''}${isDup ? ' search-add-btn--dup' : ''}`}
                      onClick={() => handleAdd(r, isDup)}
                      disabled={added || inLibrary}
                      title={isDup ? 'A similar title is already in your library' : undefined}
                    >
                      {inLibrary ? 'In Library' : added ? '✓ Added' : isDup ? 'Add anyway' : '+ Add'}
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="search-modal-footer">
              <button className="search-manual-btn" onClick={onAddManually}>
                Can&rsquo;t find it? Add manually
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
