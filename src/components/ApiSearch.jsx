import { useEffect, useRef, useState } from 'react'
import HardcoverKeyPrompt from './HardcoverKeyPrompt'

export default function ApiSearch({ category, color, onPick }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [needsKey, setNeedsKey] = useState(false)
  const debounceRef = useRef(null)

  // Reset when category changes
  useEffect(() => {
    setQuery('')
    setResults([])
    setError(null)
    setNeedsKey(false)
  }, [category])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(null); return }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query.trim()), 420)
    return () => clearTimeout(debounceRef.current)
  }, [query, category])

  async function search(q) {
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

  if (needsKey) {
    return (
      <HardcoverKeyPrompt
        color={color}
        onSaved={() => { setNeedsKey(false); if (query.trim()) search(query.trim()) }}
      />
    )
  }

  return (
    <div className="api-search">
      <div className="search-input-wrap">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          placeholder={category === 'book' ? 'Search Hardcover…' : 'Search AniList…'}
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        {loading && <span className="search-spinner" />}
      </div>

      {error && <p className="search-error">{error}</p>}

      <ul className="search-results">
        {results.map(r => (
          <li key={r.id} className="search-result" onClick={() => onPick(r)}>
            {r.cover
              ? <img className="result-cover" src={r.cover} alt="" loading="lazy" />
              : <div className="result-cover result-cover--empty" />
            }
            <div className="result-info">
              <strong>{r.title}</strong>
              {(r.author || r.genres) && (
                <span className="result-sub">{r.author || r.genres}</span>
              )}
              {(r.episodes || r.year) && (
                <span className="result-meta">
                  {[r.episodes && `${r.episodes} eps`, r.year].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </li>
        ))}
        {!loading && query && results.length === 0 && !error && (
          <p className="search-empty">No results for "{query}"</p>
        )}
      </ul>
    </div>
  )
}
