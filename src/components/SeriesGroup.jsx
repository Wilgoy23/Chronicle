import { useState } from 'react'
import EntryCard from './EntryCard'
import { STATUS_LABELS } from '../App'

export default function SeriesGroup({ name, entries, color, onDelete, onUpdate, onEdit, onDropEntry }) {
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
    if (!isNaN(entryId)) onDropEntry?.(entryId, name)
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
              ? <img key={i} src={url} alt="" className="series-thumb" loading="lazy" />
              : <div key={i} className="series-thumb-empty" />
          )}
        </div>

        <div className="series-info">
          <div className="series-header-top">
            <span className="series-name">{name}</span>
            <span className="series-chevron">{expanded ? '▲' : '▼'}</span>
          </div>
          <div className="series-sub">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · {summary}
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
