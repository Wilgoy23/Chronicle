import { STATUS_LABELS } from '../App'

const STATUS_COLORS = {
  completed:   '#4ade80',
  in_progress: '#facc15',
  planned:     '#94a3b8',
}

export default function EntryCard({ entry, color, onDelete, onEdit }) {
  const displayDate = entry.date_read || entry.created_at?.slice(0, 10) || ''

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
      <div className="card-accent-bar" />

      {entry.cover_url && (
        <img
          className="card-cover"
          src={entry.cover_url}
          alt={entry.title}
          loading="lazy"
        />
      )}

      <div className="card-body">
        <div className="card-top">
          <h3 className="card-title">{entry.title}</h3>
          <button
            className="card-delete"
            onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
            title="Remove"
          >✕</button>
        </div>

        <div className="card-meta">
          <span className="status-badge" style={{ color: STATUS_COLORS[entry.status] }}>
            ● {STATUS_LABELS[entry.status] ?? entry.status}
          </span>
          {entry.rating && (
            <span className="rating-badge" style={{ '--accent': color }}>
              {entry.rating}<span className="rating-max">/10</span>
            </span>
          )}
        </div>

        {entry.series && <p className="card-series">{entry.series}</p>}
        {entry.notes && <p className="card-notes">{entry.notes}</p>}

        {displayDate && <time className="card-date">{displayDate}</time>}
      </div>
    </div>
  )
}
