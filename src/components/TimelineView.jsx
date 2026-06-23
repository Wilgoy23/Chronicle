import { STATUS_LABELS } from '../App'
import Cover from './Cover'

const STATUS_COLORS = {
  completed:   '#4ade80',
  in_progress: '#facc15',
  planned:     '#94a3b8',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getDate(entry) {
  return entry.date_read || entry.created_at?.slice(0, 10) || null
}

// Group entries into { year -> { month -> entries[] } }, sorted newest first
function buildTimeline(entries) {
  const years = new Map()

  const sorted = [...entries].sort((a, b) => {
    const da = getDate(a) ?? '0000-00-00'
    const db2 = getDate(b) ?? '0000-00-00'
    return db2.localeCompare(da)
  })

  for (const entry of sorted) {
    const d = getDate(entry)
    const year  = d ? d.slice(0, 4) : 'Unknown'
    const month = d ? parseInt(d.slice(5, 7), 10) - 1 : -1 // 0-indexed

    if (!years.has(year)) years.set(year, new Map())
    const months = years.get(year)
    if (!months.has(month)) months.set(month, [])
    months.get(month).push(entry)
  }

  return years
}

export default function TimelineView({ entries, color, onDelete, onUpdate, onEdit }) {
  const timeline = buildTimeline(entries)

  if (entries.length === 0) return null

  return (
    <div className="timeline">
      {[...timeline.entries()].map(([year, months]) => (
        <div key={year} className="timeline-year">
          <div className="timeline-year-label">{year}</div>

          <div className="timeline-year-body">
            {[...months.entries()].map(([monthIdx, items]) => (
              <div key={monthIdx} className="timeline-month">
                <div className="timeline-month-label">
                  {monthIdx >= 0 ? MONTHS[monthIdx] : '—'}
                </div>

                <div className="timeline-items">
                  {items.map(entry => (
                    <TimelineCard
                      key={entry.id}
                      entry={entry}
                      color={color}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                      onEdit={onEdit}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function TimelineCard({ entry, color, onDelete, onEdit }) {
  return (
    <div
      className="tl-card"
      style={{ '--accent': color, cursor: 'pointer' }}
      onClick={() => onEdit?.(entry)}
    >
      <Cover className="tl-cover" src={entry.cover_url} alt={entry.title} compact />
      <div className="tl-info">
        <span className="tl-title">{entry.title}</span>
        {entry.series && <span className="tl-series">{entry.series}</span>}
        <div className="tl-meta">
          <span className="tl-status" style={{ color: STATUS_COLORS[entry.status] }}>
            ● {STATUS_LABELS[entry.status] ?? entry.status}
          </span>
          {entry.rating && entry.status !== 'planned' && (
            <span className="tl-rating" style={{ '--accent': color }}>
              {entry.rating}/10
            </span>
          )}
        </div>
      </div>
      <button
        className="tl-delete"
        onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
        title="Remove"
      >✕</button>
    </div>
  )
}
