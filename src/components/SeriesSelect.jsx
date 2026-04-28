import { useEffect, useRef, useState } from 'react'

export default function SeriesSelect({ value, onChange, series, placeholder }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState(value || '')
  const ref               = useRef(null)
  const inputRef          = useRef(null)

  // Sync query when value changes externally (e.g. panel reset)
  useEffect(() => { setQuery(value || '') }, [value])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const trimmed  = query.trim()
  const filtered = series.filter(s => s.toLowerCase().includes(trimmed.toLowerCase()))
  const isNew    = trimmed && !series.some(s => s.toLowerCase() === trimmed.toLowerCase())

  function select(val) {
    onChange(val)
    setQuery(val)
    setOpen(false)
  }

  function clear(e) {
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleInput(e) {
    setQuery(e.target.value)
    onChange(e.target.value)
    setOpen(true)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Enter' && open) e.preventDefault() // don't submit form
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
          {/* "None" to clear selection — show only when not filtering */}
          {!trimmed && value && (
            <li role="option" className="series-option series-option--none" onClick={() => select('')}>
              — None
            </li>
          )}

          {filtered.length === 0 && !isNew && (
            <li className="series-option series-option--empty">No matches</li>
          )}

          {filtered.map(s => (
            <li
              key={s}
              role="option"
              aria-selected={s === value}
              className={`series-option${s === value ? ' series-option--active' : ''}`}
              onClick={() => select(s)}
            >
              {s}
            </li>
          ))}

          {isNew && (
            <li role="option" className="series-option series-option--new" onClick={() => select(trimmed)}>
              + Create &ldquo;{trimmed}&rdquo;
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
