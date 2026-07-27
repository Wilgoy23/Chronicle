import { STATUS_LABELS, categoryVerbs } from '../App'
import Cover from './Cover'

const STATUS_COLORS = {
  completed:   '#4ade80',
  in_progress: '#facc15',
  planned:     '#94a3b8',
}

const STATUS_SHORT = {
  completed:   'Done',
  planned:     'Planned',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function shortStatus(entry) {
  if (entry.status === 'in_progress') return categoryVerbs(entry.category).active
  return STATUS_SHORT[entry.status] ?? STATUS_LABELS[entry.status]
}

// Prefer the consumed date (date_read), fall back to when it was added.
function rowDate(entry) {
  return entry.date_read || entry.created_at?.slice(0, 10) || null
}

function formatDate(iso) {
  if (!iso) return '—'
  const y = iso.slice(0, 4)
  const m = parseInt(iso.slice(5, 7), 10) - 1
  const d = parseInt(iso.slice(8, 10), 10)
  if (Number.isNaN(m) || m < 0) return y
  return Number.isNaN(d) ? `${MONTHS[m]} ${y}` : `${MONTHS[m]} ${d}, ${y}`
}

// Dense, sortable rows for large collections (5.5). Flat list — series appears
// as a column rather than a group, so the current sort order reads top-to-bottom.
export default function ListView({ entries, color, onDelete, onEdit, onIncrement }) {
  if (entries.length === 0) return null

  return (
    <div className="list-view" style={{ '--accent': color }}>
      <div className="list-head">
        <span className="list-col-cover" />
        <span className="list-col-title">Title</span>
        <span className="list-col-series">Series</span>
        <span className="list-col-status">Status</span>
        <span className="list-col-rating">Rating</span>
        <span className="list-col-date">Date</span>
        <span className="list-col-actions" />
      </div>

      {entries.map(entry => {
        const total       = entry.progress_total
        const showProgress = entry.status === 'in_progress' && total > 0
        const progress    = Math.min(entry.progress ?? 0, total ?? 0)

        return (
          <div
            key={entry.id}
            className="list-row"
            onClick={() => onEdit?.(entry)}
          >
            <Cover className="list-cover" src={entry.cover_url} alt={entry.title} compact />

            <div className="list-title-cell">
              <span className="list-title">{entry.title}</span>
              {entry.log_count > 0 && (
                <span className="list-rewatch" title={`Logged ${entry.log_count + 1} times`}>
                  ×{entry.log_count + 1}
                </span>
              )}
            </div>

            <span className="list-series">{entry.series || ''}</span>

            <span className="list-status">
              <span className="list-status-dot" style={{ background: STATUS_COLORS[entry.status] }} />
              <span className="list-status-label" style={{ color: STATUS_COLORS[entry.status] }}>
                {shortStatus(entry)}
              </span>
              {showProgress && (
                <button
                  className="list-progress"
                  onClick={e => { e.stopPropagation(); onIncrement?.(entry) }}
                  title="Log one more"
                >
                  {progress} / {total} <span className="list-progress-inc">+1</span>
                </button>
              )}
            </span>

            <span className="list-rating">
              {entry.rating && entry.status !== 'planned'
                ? <><b>{entry.rating}</b><span className="list-rating-max">/10</span></>
                : <span className="list-dash">—</span>}
            </span>

            <span className="list-date">{formatDate(rowDate(entry))}</span>

            <button
              className="list-delete"
              onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
              title="Remove"
            >✕</button>
          </div>
        )
      })}
    </div>
  )
}
