import Cover from './Cover'

function formatDate(d) {
  if (!d) return 'Date TBA'
  const t = Date.parse(d)
  if (Number.isNaN(t)) return 'Date TBA'
  const date = new Date(t)
  const opts = { year: 'numeric', month: 'short', day: 'numeric' }
  const label = date.toLocaleDateString(undefined, opts)
  return t > Date.now() ? `Upcoming · ${label}` : label
}

export default function ReleasesPanel({ open, releases = [], color, onClose, onAdd, onDismiss }) {
  if (!open) return null

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
          <ul className="releases-list">
            {releases.map(r => (
              <li key={r.id} className="release-item">
                <Cover className="release-cover" src={r.cover_url} alt="" compact />
                <div className="release-info">
                  <strong className="release-title">{r.title}</strong>
                  {r.relation && <span className="release-relation">{r.relation}</span>}
                  {r.origin_title && <span className="release-origin">From {r.origin_title}</span>}
                  <span className="release-date">{formatDate(r.release_date)}</span>
                </div>
                <div className="release-actions">
                  <button className="release-add-btn" onClick={() => onAdd(r)}>+ Add</button>
                  <button className="release-dismiss-btn" onClick={() => onDismiss(r)}>Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
