import { useEffect, useRef, useState } from 'react'
import { STATUS_LABELS } from '../App'
import SeriesSelect from './SeriesSelect'

const today = () => new Date().toISOString().slice(0, 10)
const DEFAULT = { title: '', status: 'completed', rating: '', notes: '', cover_url: '', series: '', date_read: today() }

export default function AddEntryPanel({ open, category, color, seriesList = [], onClose, onAdded }) {
  const [form, setForm] = useState(DEFAULT)
  const titleRef = useRef(null)

  useEffect(() => {
    if (open) {
      setForm(DEFAULT)
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [open, category])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    const entry = await window.db.addEntry({
      category,
      title:     form.title.trim(),
      status:    form.status,
      rating:    form.rating !== '' ? Number(form.rating) : null,
      notes:     form.notes.trim(),
      cover_url: form.cover_url || null,
      series:    form.series.trim() || null,
      date_read: form.date_read || null,
    })
    onAdded(entry)
    setForm(DEFAULT)
  }

  return (
    <>
      <div className={`panel-backdrop ${open ? 'visible' : ''}`} onClick={onClose} />

      <aside className={`add-panel ${open ? 'open' : ''}`} style={{ '--accent': color }}>
        <div className="panel-header">
          <h2>New Entry</h2>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <form className="panel-form" onSubmit={handleSubmit}>
          <label>
            Title <span className="required">*</span>
            <input
              ref={titleRef}
              placeholder="e.g. Berserk"
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
              rows={4}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </label>

          <button type="submit" className="submit-btn">Save Entry</button>
        </form>
      </aside>
    </>
  )
}
