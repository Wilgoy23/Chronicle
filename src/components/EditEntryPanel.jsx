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
        series:    entry.series    ?? '',
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
      series:    form.series.trim() || null,
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

  const open = !!entry

  return (
    <>
      <div className={`panel-backdrop ${open ? 'visible' : ''}`} onClick={onClose} />

      <aside className={`add-panel ${open ? 'open' : ''}`} style={{ '--accent': color }}>
        <div className="panel-header">
          <h2>Edit Entry</h2>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        {/* Cover preview */}
        {form.cover_url && (
          <div className="edit-cover-preview">
            <img src={form.cover_url} alt={form.title} />
          </div>
        )}

        <form className="panel-form" onSubmit={handleSubmit}>
          <label>
            Title <span className="required">*</span>
            <input
              ref={titleRef}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              required
            />
          </label>

          <label>
            Series <span className="subtle">(optional)</span>
            <SeriesSelect
              value={form.series}
              onChange={val => set('series', val)}
              series={seriesList}
            />
          </label>

          <label>
            Status
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            Rating <span className="subtle">(1 – 10)</span>
            <input
              type="number"
              min={1} max={10}
              placeholder="—"
              value={form.rating}
              onChange={e => set('rating', e.target.value)}
            />
          </label>

          <label>
            Date Read
            <input
              type="date"
              value={form.date_read}
              onChange={e => set('date_read', e.target.value)}
            />
          </label>

          <label>
            Notes
            <textarea
              placeholder="Thoughts, recommendations…"
              rows={5}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </label>

          <label>
            Cover URL <span className="subtle">(optional)</span>
            <input
              placeholder="https://…"
              value={form.cover_url}
              onChange={e => set('cover_url', e.target.value)}
            />
          </label>

          <button type="submit" className="submit-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>

          <button type="button" className="delete-btn" onClick={handleDelete}>
            Delete Entry
          </button>
        </form>
      </aside>
    </>
  )
}
