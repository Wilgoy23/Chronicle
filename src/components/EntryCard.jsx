import { STATUS_LABELS } from '../App'
import Cover from './Cover'

const STATUS_COLORS = {
  completed:   '#4ade80',
  in_progress: '#facc15',
  planned:     '#94a3b8',
}

const STATUS_SHORT = {
  completed:   'Done',
  in_progress: 'Reading',
  planned:     'Planned',
}

export default function EntryCard({ entry, color, onDelete, onEdit }) {
  function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', String(entry.id))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className="card"
      style={{ '--accent': color }}
      draggable
      onDragStart={handleDragStart}
      onClick={() => onEdit?.(entry)}
    >
      <div className="card-cover-wrap">
        <Cover className="card-cover" src={entry.cover_url} alt={entry.title} />
        {/* Status chip */}
        <div className="cover-status">
          <span className="cover-status-dot" style={{ background: STATUS_COLORS[entry.status] }} />
          <span className="cover-status-label" style={{ color: STATUS_COLORS[entry.status] }}>
            {STATUS_SHORT[entry.status] ?? STATUS_LABELS[entry.status]}
          </span>
        </div>
        {/* Rating badge */}
        {entry.rating && (
          <div className="cover-rating">
            {entry.rating}<span className="cover-rating-max">/10</span>
          </div>
        )}
      </div>

      {/* Delete overlay */}
      <div className="card-actions">
        <button
          className="card-action-btn"
          onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
          title="Remove"
        >✕</button>
      </div>

      <div className="card-body">
        <h3 className="card-title">{entry.title}</h3>

        {entry.series && (
          <span className="card-series-tag">{entry.series}</span>
        )}

        {entry.notes && <p className="card-notes">{entry.notes}</p>}
      </div>
    </div>
  )
}
