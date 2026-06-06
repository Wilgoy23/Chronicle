import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CATEGORIES, STATUS_LABELS } from '../App'
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

  const catLabel   = DEFAULT_CATEGORIES.find(c => c.id === entry.category)?.label ?? entry.category
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
            {form.cover_url ? (
              <img src={form.cover_url} alt={form.title} className="edit-hero-cover" />
            ) : (
              <div className="edit-hero-cover edit-hero-cover--empty" />
            )}
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
