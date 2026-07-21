import { useState } from 'react'
import EntryCard from './EntryCard'
import Cover from './Cover'
import { STATUS_LABELS } from '../App'

export default function SeriesGroup({ seriesId, name, entries, color, onDelete, onUpdate, onEdit, onIncrement, onDropEntry, onDeleteSeries }) {
  const [expanded, setExpanded] = useState(false)
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

  const statusCounts = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1
    return acc
  }, {})
  const summary = Object.entries(statusCounts)
    .map(([s, n]) => `${n} ${STATUS_LABELS[s]?.toLowerCase() ?? s}`)
    .join(' · ')

  const coverUrls = entries.map(e => e.cover_url).filter(Boolean)
  const covers    = [coverUrls[0] ?? null, coverUrls[1] ?? null, coverUrls[2] ?? null]

  return (
    <div
      className={`series-card ${expanded ? 'expanded' : ''} ${dragOver ? 'drag-over' : ''}`}
      style={{ '--accent': color }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button className="series-header" onClick={() => setExpanded(e => !e)}>
        <div className="series-covers">
          {covers.map((url, i) =>
            url
              ? <Cover key={i} src={url} alt="" className="series-thumb" compact />
              : <div key={i} className="series-thumb-empty" />
          )}
        </div>

        <div className="series-info">
          <div className="series-header-top">
            <span className="series-name">{name}</span>
            <div className="series-header-actions">
              <button
                className="series-delete-btn"
                onClick={e => { e.stopPropagation(); onDeleteSeries?.(seriesId, name) }}
                title={`Delete ${name}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
              <span className="series-chevron">{expanded ? '▲' : '▼'}</span>
            </div>
          </div>
          <div className="series-sub">
            {entries.length === 0
              ? 'Empty · drag an entry here'
              : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · ${summary}`}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="series-entries">
          {entries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              color={color}
              onDelete={onDelete}
              onEdit={onEdit}
              onIncrement={onIncrement}
            />
          ))}
        </div>
      )}
    </div>
  )
}
