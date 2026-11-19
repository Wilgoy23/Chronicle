import { useState } from 'react'
import Cover from './Cover'
import { categoryVerbs } from '../App'

// Up to `max` distinct cover URLs, in entry order (series often reuse one image).
export function distinctCovers(entries, max = 3) {
  const seen = new Set()
  for (const e of entries) {
    if (e.cover_url && !seen.has(e.cover_url)) seen.add(e.cover_url)
    if (seen.size === max) break
  }
  return [...seen]
}

// Completed / in-progress / total counts for a series' entries.
export function seriesProgress(entries) {
  let done = 0
  let active = 0
  for (const e of entries) {
    if (e.status === 'completed') done++
    else if (e.status === 'in_progress') active++
  }
  return { done, active, total: entries.length }
}

// A series shown as one tile in the library grid. Clicking it opens the series
// (the grid then shows only its entries); entries can be dragged onto it.
export default function SeriesGroup({ seriesId, name, entries, color, onOpen, onDropEntry, onDeleteSeries }) {
  const [dragOver, setDragOver] = useState(false)

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDragEnter(e) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const entryId = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!isNaN(entryId)) onDropEntry?.(entryId, seriesId)
  }

  const verbs = categoryVerbs(entries[0]?.category)
  const { done, active, total } = seriesProgress(entries)
  const covers = distinctCovers(entries)
  const complete = total > 0 && done === total

  let badge = null
  if (complete) badge = { label: 'Complete', color: '#4ade80' }
  else if (active > 0) badge = { label: verbs.active, color: '#facc15' }

  const open = () => onOpen?.(seriesId)

  return (
    <div
      className={`series-tile ${dragOver ? 'drag-over' : ''}`}
      style={{ '--accent': color }}
      role="button"
      tabIndex={0}
      aria-label={`Open series ${name}`}
      onClick={open}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
      }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`series-stack series-stack--${Math.max(covers.length, 1)}`}>
        {covers.length === 0 ? (
          <Cover className="series-stack-cover series-stack-cover--0" src={null} />
        ) : (
          // Render back-to-front so the first cover sits on top.
          covers.map((url, i) => ({ url, i })).reverse().map(({ url, i }) => (
            <Cover key={url} className={`series-stack-cover series-stack-cover--${i}`} src={url} alt="" />
          ))
        )}
        {badge && (
          <div className="cover-status series-tile-badge">
            <span className="cover-status-dot" style={{ background: badge.color }} />
            <span className="cover-status-label" style={{ color: badge.color }}>{badge.label}</span>
          </div>
        )}
        <button
          className="series-tile-delete"
          onClick={e => { e.stopPropagation(); onDeleteSeries?.(seriesId, name) }}
          title={`Delete ${name}`}
          aria-label={`Delete ${name}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>

      <div className="series-tile-body">
        <span className="series-tile-name" title={name}>{name}</span>
        {total === 0 ? (
          <span className="series-tile-sub">Empty · drag an entry here</span>
        ) : (
          <>
            <SeriesProgressBar done={done} active={active} total={total} />
            <span className="series-tile-sub">
              {done}/{total} {verbs.past.toLowerCase()}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// Dashed tile at the end of the series tiles; turns into a name field when clicked.
export function NewSeriesTile({ color, onCreate }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  function close() {
    setEditing(false)
    setName('')
  }

  async function submit() {
    if (!name.trim()) { close(); return }
    await onCreate?.(name)
    close()
  }

  if (!editing) {
    return (
      <button className="series-tile series-tile--new" style={{ '--accent': color }} onClick={() => setEditing(true)}>
        <span className="series-tile-new-plus" aria-hidden="true">+</span>
        <span className="series-tile-new-label">New series</span>
      </button>
    )
  }

  return (
    <div className="series-tile series-tile--new series-tile--editing" style={{ '--accent': color }}>
      <label className="series-tile-new-label" htmlFor="new-series-name">New series</label>
      <input
        id="new-series-name"
        autoFocus
        className="series-tile-new-input"
        placeholder="Series name…"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') close()
        }}
        onBlur={() => { if (!name.trim()) close() }}
      />
      <div className="series-tile-new-actions">
        <button className="series-tile-new-cancel" onMouseDown={e => e.preventDefault()} onClick={close}>Cancel</button>
        <button className="series-tile-new-create" onMouseDown={e => e.preventDefault()} onClick={submit} disabled={!name.trim()}>Create</button>
      </div>
    </div>
  )
}

export function SeriesProgressBar({ done, active, total }) {
  if (!total) return null
  return (
    <div
      className="series-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <div className="series-progress-done" style={{ width: `${(done / total) * 100}%` }} />
      <div className="series-progress-active" style={{ width: `${(active / total) * 100}%` }} />
    </div>
  )
}
