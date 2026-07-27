import Cover from './Cover'

const DAY = 24 * 60 * 60 * 1000

// Absolute date, e.g. "Aug 12, 2026". Undated/unreleased items read "Date TBA".
function formatDate(d) {
  if (!d) return 'Date TBA'
  const t = Date.parse(d)
  if (Number.isNaN(t)) return 'Date TBA'
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Human "releases in N days" label for a future timestamp.
function countdown(ts) {
  if (ts == null) return null
  const days = Math.ceil((ts - Date.now()) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 14) return 'in 1 week'
  if (days < 60) return `in ${Math.round(days / 7)} weeks`
  return `in ${Math.round(days / 30)} months`
}

function ReleaseRow({ r, ts, onAdd, onDismiss }) {
  const label = countdown(ts)
  return (
    <li className="release-item">
      <Cover className="release-cover" src={r.cover_url} alt="" compact />
      <div className="release-info">
        <strong className="release-title">{r.title}</strong>
        {r.relation && <span className="release-relation">{r.relation}</span>}
        {r.origin_title && <span className="release-origin">From {r.origin_title}</span>}
        <span className="release-date">
          {formatDate(r.release_date)}
          {label && <span className="release-countdown">{label}</span>}
        </span>
      </div>
      <div className="release-actions">
        <button className="release-add-btn" onClick={() => onAdd(r)}>+ Add</button>
        <button className="release-dismiss-btn" onClick={() => onDismiss(r)}>Dismiss</button>
      </div>
    </li>
  )
}

export default function ReleasesPanel({ open, releases = [], color, onClose, onAdd, onDismiss }) {
  if (!open) return null

  // Split by release date: out now (dated, <= today) vs upcoming (future date or TBA).
  const now = []
  const upcoming = []
  for (const r of releases) {
    const t = r.release_date ? Date.parse(r.release_date) : NaN
    if (!Number.isNaN(t) && t <= Date.now()) now.push({ r, ts: t })
    else upcoming.push({ r, ts: Number.isNaN(t) ? null : t })
  }
  now.sort((a, b) => b.ts - a.ts)            // most recently out first
  upcoming.sort((a, b) => {                   // soonest first, TBA last
    if (a.ts == null) return 1
    if (b.ts == null) return -1
    return a.ts - b.ts
  })

  return (
    <div className="releases-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <aside className="releases-panel" style={{ '--accent': color }}>
        <div className="releases-header">
          <h2>What&rsquo;s New</h2>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        {releases.length === 0 ? (
          <div className="releases-empty">
            <p>No new releases detected.</p>
            <span>We check series in your library for sequels and new installments.</span>
          </div>
        ) : (
          <div className="releases-scroll">
            {now.length > 0 && (
              <section className="releases-section">
                <div className="releases-section-head">
                  <span className="releases-section-title">Out now</span>
                  <span className="releases-section-count">{now.length}</span>
                </div>
                <ul className="releases-list">
                  {now.map(({ r }) => (
                    <ReleaseRow key={r.id} r={r} ts={null} onAdd={onAdd} onDismiss={onDismiss} />
                  ))}
                </ul>
              </section>
            )}

            {upcoming.length > 0 && (
              <section className="releases-section">
                <div className="releases-section-head">
                  <span className="releases-section-title">Upcoming</span>
                  <span className="releases-section-count">{upcoming.length}</span>
                </div>
                <ul className="releases-list">
                  {upcoming.map(({ r, ts }) => (
                    <ReleaseRow key={r.id} r={r} ts={ts} onAdd={onAdd} onDismiss={onDismiss} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
