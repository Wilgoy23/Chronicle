import { useEffect, useRef, useState } from 'react'
import { STATUS_LABELS } from '../App'
import SeriesSelect from './SeriesSelect'

export default function EditEntryPanel({ entry, color, seriesList = [], onClose, onUpdate, onDelete }) {
  const [form, setForm]     = useState(null)
  const [saving, setSaving] = useState(false)
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
      })
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [entry?.id])

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
    })
    setSaving(false)
    onUpdate(updated)
    onClose()
  }

  async function handleDelete() {
    await window.db.deleteEntry(entry.id)
    onDelete(entry.id)
    onClose()
  }

  const heroStyle = form.cover_url
    ? { backgroundImage: `linear-gradient(to bottom, rgba(8,8,15,0) 0%, var(--bg2) 100%), url(${form.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center top' }
    : { background: `linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--bg3)), var(--bg3))` }

  return (
    <div className="edit-modal-backdrop" onClick={onClose}>
      <aside className="edit-modal" style={{ '--accent': color }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="panel-header">
          <h2>Edit Entry</h2>
          <div className="panel-header-actions">
            <button type="button" className="edit-delete-btn" onClick={handleDelete} title="Delete entry">
              Delete
            </button>
            <button className="panel-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <form className="edit-form" onSubmit={handleSubmit}>
          {/* Hero banner */}
          <div className="edit-hero" style={heroStyle}>
            {form.cover_url && (
              <img src={form.cover_url} alt={form.title} className="edit-hero-cover" />
            )}
            {!form.cover_url && (
              <div className="edit-hero-cover edit-hero-cover--empty" />
            )}
          </div>

          {/* Scrollable fields */}
          <div className="edit-fields">

            {/* Details section */}
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
                  onMouseEnter={e => { if (form.rating === '') set('rating', e.target.value) }}
                />
                <span className="edit-slider-bound">10</span>
                {form.rating !== '' && (
                  <button type="button" className="edit-clear-rating" onClick={() => set('rating', '')} title="Clear rating">
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Extra section */}
            <div className="edit-section-label edit-section-label--extra">Extra</div>

            <div className="edit-two-col">
              <label className="edit-label">
                Date Read
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
              Notes
              <textarea
                className="edit-input edit-notes"
                placeholder="Thoughts, recommendations…"
                rows={4}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </label>

          </div>

          {/* Sticky footer */}
          <div className="edit-footer">
            <button type="submit" className="submit-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
        </aside>
    </div>
  )
}
