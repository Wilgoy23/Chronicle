import { useEffect, useRef, useState } from 'react'

// series = [{id, name}]
// value  = series_id (integer) or null
// onChange(id | null)
export default function SeriesSelect({ value, onChange, series = [], category, placeholder }) {
  const selectedName = series.find(s => s.id === value)?.name ?? ''
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState(selectedName)
  const ref               = useRef(null)
  const inputRef          = useRef(null)

  useEffect(() => {
    setQuery(series.find(s => s.id === value)?.name ?? '')
  }, [value, series])

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const trimmed  = query.trim()
  const filtered = series.filter(s => s.name.toLowerCase().includes(trimmed.toLowerCase()))
  const isNew    = trimmed && !series.some(s => s.name.toLowerCase() === trimmed.toLowerCase())

  function select(s) {
    onChange(s.id)
    setQuery(s.name)
    setOpen(false)
  }

  function clear(e) {
    e.stopPropagation()
    onChange(null)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleInput(e) {
    setQuery(e.target.value)
    // If text no longer matches the selected series, deselect
    if (value !== null) onChange(null)
    setOpen(true)
  }

  async function handleCreate() {
    if (!trimmed || !category) return
    const created = await window.db.addSeries(category, trimmed)
    onChange(created.id)
    setQuery(created.name)
    setOpen(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Enter' && open) {
      e.preventDefault()
      if (isNew) handleCreate()
      else if (filtered.length === 1) select(filtered[0])
    }
  }

  return (
    <div className="series-select" ref={ref}>
      <div className="series-select-box" onClick={() => { setOpen(o => !o); inputRef.current?.focus() }}>
        <input
          ref={inputRef}
          type="text"
          className="series-select-input"
          value={query}
          placeholder={placeholder || 'Select or create a series…'}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {trimmed && (
          <button type="button" className="series-select-clear" onClick={clear} tabIndex={-1}>✕</button>
        )}
        <span className="series-select-arrow" aria-hidden>▾</span>
      </div>

      {open && (
        <ul className="series-dropdown" role="listbox">
          {!trimmed && value && (
            <li role="option" className="series-option series-option--none" onClick={() => { onChange(null); setQuery(''); setOpen(false) }}>
              — None
            </li>
          )}
          {filtered.length === 0 && !isNew && (
            <li className="series-option series-option--empty">No matches</li>
          )}
          {filtered.map(s => (
            <li
              key={s.id}
              role="option"
              aria-selected={s.id === value}
              className={`series-option${s.id === value ? ' series-option--active' : ''}`}
              onClick={() => select(s)}
            >
              {s.name}
            </li>
          ))}
          {isNew && (
            <li role="option" className="series-option series-option--new" onClick={handleCreate}>
              + Create &ldquo;{trimmed}&rdquo;
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
