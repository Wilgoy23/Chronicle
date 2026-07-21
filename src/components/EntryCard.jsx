import { STATUS_LABELS, categoryVerbs } from '../App'
import Cover from './Cover'

const STATUS_COLORS = {
  completed:   '#4ade80',
  in_progress: '#facc15',
  planned:     '#94a3b8',
}

// 'in_progress' wording is per-category (Reading / Watching / Playing).
const STATUS_SHORT = {
  completed:   'Done',
  planned:     'Planned',
}

function shortStatus(entry) {
  if (entry.status === 'in_progress') return categoryVerbs(entry.category).active
  return STATUS_SHORT[entry.status] ?? STATUS_LABELS[entry.status]
}

export default function EntryCard({ entry, color, onDelete, onEdit, onIncrement }) {
  function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', String(entry.id))
    e.dataTransfer.effectAllowed = 'move'
  }

  // Progress UI only applies to in-progress entries that have a known total.
  const total       = entry.progress_total
  const showProgress = entry.status === 'in_progress' && total > 0
  const progress    = Math.min(entry.progress ?? 0, total ?? 0)
  const pct         = showProgress ? Math.round((progress / total) * 100) : 0

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
            {shortStatus(entry)}
          </span>
        </div>
        {/* Rating badge — hidden for planned entries (not consumed yet) */}
        {entry.rating && entry.status !== 'planned' && (
          <div className="cover-rating">
            {entry.rating}<span className="cover-rating-max">/10</span>
          </div>
        )}

        {/* Progress bar + quick increment (in-progress with a known total) */}
        {showProgress && (
          <div className="cover-progress">
            <div className="cover-progress-track">
              <div className="cover-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="cover-progress-row">
              <span className="cover-progress-label">{progress} / {total}</span>
              <button
                className="cover-progress-inc"
                onClick={e => { e.stopPropagation(); onIncrement?.(entry) }}
                title="Log one more"
              >+1</button>
            </div>
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
