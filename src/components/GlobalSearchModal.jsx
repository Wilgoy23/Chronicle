import { useEffect, useRef, useState } from 'react'
import Cover from './Cover'
import { STATUS_LABELS } from '../App'

// Cross-category search: fetches every entry (window.db.getEntries() with no
// category arg) and reuses the same title/series/notes match rule as the
// per-category filter strip, then groups matches by category.
export default function GlobalSearchModal({ open, categories = [], onSelect, onClose }) {
  const [query, setQuery]     = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setLoading(true)
    window.db.getEntries().then(rows => { setEntries(rows); setLoading(false) })
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])

  if (!open) return null

  const q = query.trim().toLowerCase()
  const matches = q
    ? entries.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.series && e.series.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)))
    : []

  const groups = categories
    .map(cat => ({ cat, rows: matches.filter(e => e.category === cat.id) }))
    .filter(g => g.rows.length > 0)
  const firstResult = groups[0]?.rows[0]

  return (
    <div className="search-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-modal">
        <div className="search-modal-header">
          <input
            ref={inputRef}
            className="search-modal-input"
            placeholder="Search across every category…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && firstResult) onSelect(firstResult) }}
          />
          {loading && <span className="search-spinner" />}
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <ul className="search-modal-results">
          {!q && <li className="search-modal-hint">Type to search every category at once</li>}
          {q && groups.length === 0 && !loading && (
            <li><p className="search-empty">No matches for &ldquo;{query}&rdquo;</p></li>
          )}
          {groups.map(({ cat, rows }) => (
            <li key={cat.id} className="gsearch-group">
              <div className="gsearch-group-label" style={{ '--accent': cat.color }}>
                {cat.label}
                <span className="gsearch-group-count">{rows.length}</span>
              </div>
              <ul className="gsearch-group-list">
                {rows.map(e => (
                  <li key={e.id} className="search-modal-result" onClick={() => onSelect(e)}>
                    <Cover className="search-modal-cover" src={e.cover_url} alt="" compact />
                    <div className="search-modal-info">
                      <strong className="search-modal-title">{e.title}</strong>
                      <span className="search-modal-sub">
                        {[e.series, STATUS_LABELS[e.status]].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
