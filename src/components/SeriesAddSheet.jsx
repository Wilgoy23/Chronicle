import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover'
import { STATUS_LABELS } from '../App'

const today = () => new Date().toISOString().slice(0, 10)

const ERROR_TEXT = {
  NOT_IN_SERIES: 'This title isn’t part of a series on the source site.',
  NO_TOKEN:      'An API key is required — add it in Settings → API Keys.',
  UNSUPPORTED:   'Series lookup isn’t available for this category.',
}

// Stages a whole series for review: every installment gets a checkbox and its
// own status, then one click inserts the checked ones in a single transaction.
export default function SeriesAddSheet({
  open, category, color, seed, source, seriesList = [], defaultSeriesId = null,
  existingEntries = [], onAdded, onClose,
}) {
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [rows, setRows]             = useState([])
  const [seriesName, setSeriesName] = useState('')
  const [saving, setSaving]         = useState(false)
  const [summary, setSummary]       = useState(null)

  const existingSourceIds = useMemo(() => new Set(
    existingEntries.filter(e => e.source_id != null).map(e => String(e.source_id))
  ), [existingEntries])

  useEffect(() => {
    if (!open || !seed) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setRows([])
    setSummary(null)
    window.api.getSeriesMembers(category, seed.id).then(res => {
      if (cancelled) return
      setLoading(false)
      if (res?.error) { setError(ERROR_TEXT[res.error] ?? res.error); return }
      const preset = seriesList.find(s => s.id === defaultSeriesId)
      setSeriesName(preset?.name ?? res.seriesName ?? '')
      setRows(res.members.map(m => {
        const inLibrary = existingSourceIds.has(String(m.source_id))
        return {
          ...m,
          inLibrary,
          // Released main-line items start checked; unreleased, side stories
          // and anything already in the library start unchecked.
          checked: !inLibrary && !m.unreleased && !m.optional,
          status:  'planned',
        }
      }))
    })
    return () => { cancelled = true }
  }, [open, seed?.id, category])

  if (!open || !seed) return null

  const selectable = rows.filter(r => !r.inLibrary)
  const checked    = rows.filter(r => r.checked && !r.inLibrary)
  const allChecked = selectable.length > 0 && selectable.every(r => r.checked)
  const matchedSeries = seriesList.find(
    s => s.name.toLowerCase() === seriesName.trim().toLowerCase()
  )

  function update(idx, patch) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  // "I'm up to here": this row and everything before it become Completed
  // (and checked); everything after goes back to Planned.
  function completedUpTo(idx) {
    setRows(prev => prev.map((r, i) => {
      if (r.inLibrary) return r
      if (i <= idx) return { ...r, checked: true, status: 'completed' }
      return { ...r, status: 'planned' }
    }))
  }

  function setAll(status) {
    if (!status) return
    setRows(prev => prev.map(r => r.checked && !r.inLibrary ? { ...r, status } : r))
  }

  function toggleAll() {
    const next = !allChecked
    setRows(prev => prev.map(r => r.inLibrary ? r : { ...r, checked: next }))
  }

  async function save() {
    if (!checked.length || saving) return
    setSaving(true)
    const res = await window.db.addEntriesBatch({
      category,
      seriesName: seriesName.trim(),
      source,
      entries: checked.map(r => ({
        title:          r.title,
        status:         r.status,
        cover_url:      r.cover_url,
        source_id:      r.source_id,
        year:           r.year,
        // Only finished items belong on the timeline.
        date_read:      r.status === 'completed' ? today() : null,
        progress:       0,
        progress_total: r.progress_total,
      })),
    })
    setSaving(false)
    const added = (res?.results ?? []).filter(x => x.status === 'added').map(x => x.entry)
    const dupes = (res?.results ?? []).filter(x => x.status === 'duplicate').length
    if (added.length) onAdded(added)
    if (dupes) {
      setSummary(`${added.length} added · ${dupes} skipped (already in your library)`)
      setRows(prev => prev.map(r => r.checked ? { ...r, inLibrary: true, checked: false } : r))
    } else {
      onClose()
    }
  }

  return (
    <div className="search-modal-backdrop series-sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-modal series-sheet" style={{ '--accent': color }} role="dialog" aria-label="Add series">
        <div className="search-modal-header">
          <div className="series-sheet-heading">
            <span className="series-sheet-kicker">Add series from</span>
            <strong className="series-sheet-seed">{seed.title}</strong>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading && <div className="series-sheet-state"><span className="search-spinner" /> Looking up the series…</div>}
        {error && <div className="series-sheet-state"><p className="search-error">{error}</p></div>}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="search-modal-options">
              <label className="search-opt-group">
                <span className="search-opt-label">Series</span>
                <input
                  className="search-opt-select series-sheet-name"
                  value={seriesName}
                  onChange={e => setSeriesName(e.target.value)}
                  placeholder="No series"
                />
              </label>
              {seriesName.trim() && (
                <span className="series-sheet-hint">
                  {matchedSeries ? 'Adds to your existing series' : 'Creates a new series'}
                </span>
              )}
              <label className="search-opt-group series-sheet-setall">
                <span className="search-opt-label">Set checked to</span>
                <select className="search-opt-select" value="" onChange={e => setAll(e.target.value)}>
                  <option value="">—</option>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>

            <div className="series-sheet-listhead">
              <label className="series-sheet-check">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                <span>{checked.length} of {selectable.length} selected</span>
              </label>
              {summary && <span className="series-sheet-summary">{summary}</span>}
            </div>

            <ul className="search-modal-results series-sheet-list">
              {rows.map((r, i) => (
                <li
                  key={r.source_id}
                  className={`search-modal-result series-sheet-row${r.inLibrary ? ' added' : ''}${!r.checked && !r.inLibrary ? ' series-sheet-row--off' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="series-sheet-rowcheck"
                    checked={r.checked}
                    disabled={r.inLibrary}
                    onChange={e => update(i, { checked: e.target.checked })}
                    aria-label={`Include ${r.title}`}
                  />
                  <span className="series-sheet-pos">{r.position != null ? `#${r.position}` : '—'}</span>
                  <Cover className="search-modal-cover" src={r.cover_url} alt="" compact />
                  <div className="search-modal-info">
                    <strong className="search-modal-title">{r.title}</strong>
                    <span className="search-modal-meta">
                      {[
                        r.year,
                        r.progress_total && `${r.progress_total} ${category === 'manga' ? 'ch' : 'eps'}`,
                        r.relation,
                        r.unreleased && 'Unreleased',
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {r.inLibrary ? (
                    <span className="search-add-btn search-add-btn--added">In Library</span>
                  ) : (
                    <div className="series-sheet-controls">
                      <button
                        type="button"
                        className="series-sheet-upto"
                        onClick={() => completedUpTo(i)}
                        title="Mark this and everything before it Completed, the rest Planned"
                      >
                        Done up to here
                      </button>
                      <select
                        className="search-opt-select"
                        value={r.status}
                        onChange={e => update(i, { status: e.target.value, checked: true })}
                        aria-label={`Status for ${r.title}`}
                      >
                        {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="search-modal-footer series-sheet-footer">
              <button className="search-manual-btn" onClick={onClose}>Cancel</button>
              <button
                className="search-add-btn series-sheet-save"
                disabled={!checked.length || saving}
                onClick={save}
              >
                {saving ? 'Adding…' : `Add ${checked.length} to library`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
