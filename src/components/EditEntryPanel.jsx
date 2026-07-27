import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CATEGORIES, STATUS_LABELS, progressUnit, categoryVerbs } from '../App'
import SeriesSelect from './SeriesSelect'
import Cover from './Cover'

// Noun for the "Log another …" button, per category.
function logNoun(category) {
  if (category === 'game') return 'playthrough'
  if (category === 'book' || category === 'manga') return 're-read'
  if (['anime', 'movie', 'tv'].includes(category)) return 're-watch'
  return 'entry'
}

const today = () => new Date().toISOString().slice(0, 10)

export default function EditEntryPanel({ entry, color, seriesList = [], onClose, onUpdate, onDelete, onLogsChanged }) {
  const [form, setForm]     = useState(null)
  const [saving, setSaving] = useState(false)
  const [logs, setLogs]     = useState([])
  const [logOpen, setLogOpen]     = useState(false)
  const [logDate, setLogDate]     = useState('')
  const [logRating, setLogRating] = useState('')
  const [logNotes, setLogNotes]   = useState('')
  const titleRef = useRef(null)

  useEffect(() => {
    if (entry) {
      setForm({
        title:     entry.title     ?? '',
        status:    entry.status    ?? 'completed',
        rating:    entry.rating    != null ? String(entry.rating) : '',
        notes:     entry.notes     ?? '',
        cover_url: entry.cover_url ?? '',
        series_id: entry.series_id ?? null,
        date_read: entry.date_read ?? '',
        progress:       entry.progress != null ? String(entry.progress) : '',
        progress_total: entry.progress_total != null ? String(entry.progress_total) : '',
        genres:    entry.genres ?? '',
      })
      window.db.getLogs(entry.id).then(setLogs)
      setLogOpen(false)
      setLogDate(today())
      setLogRating('')
      setLogNotes('')
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [entry?.id])

  async function submitLog() {
    const created = await window.db.addLog({
      entry_id: entry.id,
      date:     logDate || null,
      rating:   logRating !== '' ? Number(logRating) : null,
      notes:    logNotes.trim(),
    })
    setLogs(prev => [created, ...prev])
    setLogOpen(false)
    setLogDate(today())
    setLogRating('')
    setLogNotes('')
    onLogsChanged?.()
  }

  async function removeLog(id) {
    await window.db.deleteLog(id)
    setLogs(prev => prev.filter(l => l.id !== id))
    onLogsChanged?.()
  }

  if (!entry || !form) return null

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const updated = await window.db.updateEntry({
      id:        entry.id,
      title:     form.title.trim(),
      status:    form.status,
      rating:    form.rating !== '' ? Number(form.rating) : null,
      notes:     form.notes.trim(),
      series_id: form.series_id ?? null,
      date_read: form.date_read || null,
      progress:       form.progress !== '' ? Number(form.progress) : 0,
      progress_total: form.progress_total !== '' ? Number(form.progress_total) : null,
      genres:    form.genres.trim() || null,
    })
    setSaving(false)
    onUpdate(updated)
    onClose()
  }

  function handleDelete() {
    // Defer the DB delete to the parent's undo flow — just signal + close here.
    onDelete(entry.id)
    onClose()
  }

  const catLabel   = DEFAULT_CATEGORIES.find(c => c.id === entry.category)?.label ?? entry.category
  const catVerbs   = categoryVerbs(entry.category)
  const seriesName = form.series_id ? seriesList.find(s => s.id === form.series_id)?.name : null
  const heroMeta   = [seriesName, catLabel].filter(Boolean).join(' · ')

  const heroStyle = {
    background: `linear-gradient(135deg, color-mix(in srgb, var(--accent) 20%, #0d0d1c) 0%, color-mix(in srgb, var(--accent) 8%, #111122) 100%)`,
  }

  return (
    <div className="edit-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <aside className="edit-modal" style={{ '--accent': color }}>
        {/* Header */}
        <div className="panel-header">
          <h2>Edit Entry</h2>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <form className="edit-form" onSubmit={handleSubmit}>
          {/* Hero banner — cover pokes up from bottom, title + meta alongside */}
          <div className="edit-hero" style={heroStyle}>
            <Cover src={form.cover_url} alt={form.title} className="edit-hero-cover" />
            <div className="edit-hero-info">
              <div className="edit-hero-title">{form.title || entry.title}</div>
              <div className="edit-hero-meta">{heroMeta}</div>
            </div>
          </div>

          {/* Scrollable fields */}
          <div className="edit-fields">

            <div className="edit-section-label">Details</div>

            <label className="edit-label">
              Title <span className="required">*</span>
              <input
                ref={titleRef}
                className="edit-input edit-input--title"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                required
              />
            </label>

            <label className="edit-label">
              Series <span className="subtle">(optional)</span>
              <SeriesSelect
                value={form.series_id}
                onChange={val => set('series_id', val)}
                series={seriesList}
                category={entry.category}
              />
            </label>

            <div className="edit-label">
              Status
              <div className="edit-segment">
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    className={`edit-seg-btn ${form.status === val ? 'active' : ''}`}
                    onClick={() => set('status', val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {form.status === 'in_progress' && (
              <div className="edit-label">
                Progress
                <div className="edit-progress-row">
                  <input
                    type="number"
                    min={0}
                    className="edit-input edit-progress-input"
                    value={form.progress}
                    onChange={e => set('progress', e.target.value)}
                    placeholder="0"
                  />
                  <span className="edit-progress-sep">/</span>
                  <input
                    type="number"
                    min={0}
                    className="edit-input edit-progress-input"
                    value={form.progress_total}
                    onChange={e => set('progress_total', e.target.value)}
                    placeholder="total"
                  />
                  <span className="edit-progress-unit">{progressUnit(entry.category)}</span>
                </div>
              </div>
            )}

            <div className="edit-label">
              Rating
              {form.rating !== '' && (
                <span className="edit-rating-val">{form.rating} / 10</span>
              )}
              <div className="edit-slider-row">
                <span className="edit-slider-bound">1</span>
                <input
                  type="range"
                  className="edit-slider"
                  min={1} max={10} step={1}
                  value={form.rating !== '' ? form.rating : 5}
                  onChange={e => set('rating', e.target.value)}
                  // Commit the displayed value on explicit press, so a click landing
                  // exactly on the default (which fires no change event) still rates.
                  // Arrow/Home/End keys change the value and fire onChange on their own.
                  onPointerDown={() => { if (form.rating === '') set('rating', '5') }}
                />
                <span className="edit-slider-bound">10</span>
                {form.rating !== '' && (
                  <button type="button" className="edit-clear-rating" onClick={() => set('rating', '')} title="Clear rating">
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="edit-section-label edit-section-label--extra">Extra</div>

            <div className="edit-two-col">
              <label className="edit-label">
                Date {categoryVerbs(entry.category).past}
                <input
                  type="date"
                  className="edit-input"
                  value={form.date_read}
                  onChange={e => set('date_read', e.target.value)}
                />
              </label>

              <label className="edit-label">
                Cover URL
                <input
                  className="edit-input"
                  placeholder="https://…"
                  value={form.cover_url}
                  onChange={e => set('cover_url', e.target.value)}
                />
              </label>
            </div>

            <label className="edit-label">
              Tags <span className="subtle">(comma-separated)</span>
              <input
                className="edit-input"
                placeholder="e.g. Action, Fantasy, Favorites"
                value={form.genres}
                onChange={e => set('genres', e.target.value)}
              />
            </label>

            {entry.description && (
              <details className="edit-desc">
                <summary className="edit-desc-summary">Synopsis</summary>
                <p className="edit-desc-text">{entry.description}</p>
              </details>
            )}

            <label className="edit-label">
              Notes
              <textarea
                className="edit-input edit-notes"
                placeholder="Thoughts, recommendations…"
                rows={4}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </label>

            <div className="edit-section-label edit-section-label--extra">History</div>

            <div className="edit-log-list">
              {/* Occurrence #1 — the entry's own record. */}
              <div className="edit-log-row edit-log-row--first">
                <span className="edit-log-date">{entry.date_read || '—'}</span>
                <span className="edit-log-label">First {catVerbs.past.toLowerCase()}</span>
                {entry.rating != null && <span className="edit-log-rating">{entry.rating}/10</span>}
              </div>

              {logs.map(l => (
                <div className="edit-log-row" key={l.id}>
                  <span className="edit-log-date">{l.date || '—'}</span>
                  <span className="edit-log-label">↻ {catVerbs.past}</span>
                  {l.rating != null && <span className="edit-log-rating">{l.rating}/10</span>}
                  {l.notes && <span className="edit-log-note">{l.notes}</span>}
                  <button
                    type="button"
                    className="edit-log-del"
                    onClick={() => removeLog(l.id)}
                    title="Remove this log"
                  >✕</button>
                </div>
              ))}
            </div>

            {logOpen ? (
              <div className="edit-log-form">
                <div className="edit-log-form-row">
                  <input
                    type="date"
                    className="edit-input edit-log-date-input"
                    value={logDate}
                    onChange={e => setLogDate(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitLog() } }}
                  />
                  <input
                    type="number"
                    min={1} max={10}
                    className="edit-input edit-log-rating-input"
                    placeholder="rating"
                    value={logRating}
                    onChange={e => setLogRating(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitLog() } }}
                  />
                </div>
                <input
                  className="edit-input"
                  placeholder="Notes (optional)"
                  value={logNotes}
                  onChange={e => setLogNotes(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitLog() } }}
                />
                <div className="edit-log-form-actions">
                  <button type="button" className="submit-btn edit-log-add" onClick={submitLog}>Add</button>
                  <button type="button" className="edit-log-cancel" onClick={() => setLogOpen(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="edit-log-add-btn" onClick={() => setLogOpen(true)}>
                + Log another {logNoun(entry.category)}
              </button>
            )}

          </div>

          {/* Sticky footer — Save + Delete */}
          <div className="edit-footer">
            <button type="submit" className="submit-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" className="edit-delete-btn" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
