import { STATUS_LABELS, categoryVerbs } from '../App'
import Cover from './Cover'

const STATUS_COLORS = {
  completed:   '#4ade80',
  in_progress: '#facc15',
  planned:     '#94a3b8',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function entryDate(entry) {
  return entry.date_read || entry.created_at?.slice(0, 10) || null
}

// Expand entries into occurrences: the entry's own record (occurrence #1) plus
// one occurrence per re-watch/re-read log, each carrying its own date + rating.
function buildOccurrences(entries, logsByEntry) {
  const occ = []
  for (const entry of entries) {
    occ.push({
      key:     `entry-${entry.id}`,
      entry,
      date:    entryDate(entry),
      rating:  entry.rating,
      logId:   null,
      isRelog: false,
    })
    for (const log of (logsByEntry[entry.id] ?? [])) {
      occ.push({
        key:     `log-${log.id}`,
        entry,
        date:    log.date || entryDate(entry),
        rating:  log.rating,
        notes:   log.notes,
        logId:   log.id,
        isRelog: true,
      })
    }
  }
  return occ
}

// Group occurrences into { year -> { month -> occurrences[] } }, newest first
function buildTimeline(occurrences) {
  const years = new Map()

  const sorted = [...occurrences].sort((a, b) => {
    const da = a.date ?? '0000-00-00'
    const db2 = b.date ?? '0000-00-00'
    return db2.localeCompare(da)
  })

  for (const o of sorted) {
    const d = o.date
    const year  = d ? d.slice(0, 4) : 'Unknown'
    const month = d ? parseInt(d.slice(5, 7), 10) - 1 : -1 // 0-indexed

    if (!years.has(year)) years.set(year, new Map())
    const months = years.get(year)
    if (!months.has(month)) months.set(month, [])
    months.get(month).push(o)
  }

  return years
}

export default function TimelineView({ entries, logsByEntry = {}, color, onDelete, onDeleteLog, onEdit }) {
  const timeline = buildTimeline(buildOccurrences(entries, logsByEntry))

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
                  {items.map(o => (
                    <TimelineCard
                      key={o.key}
                      occ={o}
                      color={color}
                      onDelete={onDelete}
                      onDeleteLog={onDeleteLog}
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

function TimelineCard({ occ, color, onDelete, onDeleteLog, onEdit }) {
  const { entry, rating, isRelog, logId } = occ
  const verb = categoryVerbs(entry.category)

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
          {isRelog ? (
            <span className="tl-status tl-relog">↻ {verb.past} again</span>
          ) : (
            <span className="tl-status" style={{ color: STATUS_COLORS[entry.status] }}>
              ● {entry.status === 'in_progress'
                  ? verb.active
                  : STATUS_LABELS[entry.status] ?? entry.status}
            </span>
          )}
          {!isRelog && entry.status === 'in_progress' && entry.progress_total > 0 && (
            <span className="tl-progress">
              {Math.min(entry.progress ?? 0, entry.progress_total)} / {entry.progress_total}
            </span>
          )}
          {rating && (isRelog || entry.status !== 'planned') && (
            <span className="tl-rating" style={{ '--accent': color }}>
              {rating}/10
            </span>
          )}
        </div>
      </div>
      <button
        className="tl-delete"
        onClick={e => {
          e.stopPropagation()
          isRelog ? onDeleteLog?.(logId) : onDelete(entry.id)
        }}
        title={isRelog ? 'Remove this log' : 'Remove'}
      >✕</button>
    </div>
  )
}
