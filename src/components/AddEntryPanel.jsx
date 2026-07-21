import { useEffect, useRef, useState } from 'react'
import { STATUS_LABELS, categoryVerbs } from '../App'
import SeriesSelect from './SeriesSelect'

const today = () => new Date().toISOString().slice(0, 10)
const DEFAULT = { title: '', status: 'completed', rating: '', notes: '', cover_url: '', series_id: null, date_read: today() }

export default function AddEntryPanel({ open, category, color, seriesList = [], defaultSeriesId = null, onClose, onAdded }) {
  const [form, setForm]   = useState(DEFAULT)
  const [dupError, setDupError] = useState(false)
  const titleRef = useRef(null)

  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULT, series_id: defaultSeriesId })
      setDupError(false)
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [open, category])

  useEffect(() => {
    if (open) setForm(prev => ({ ...prev, series_id: defaultSeriesId }))
  }, [defaultSeriesId])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    const result = await window.db.addEntry({
      category,
      title:     form.title.trim(),
      status:    form.status,
      rating:    form.rating !== '' ? Number(form.rating) : null,
      notes:     form.notes.trim(),
      cover_url: form.cover_url || null,
      series_id: form.series_id ?? null,
      date_read: form.date_read || null,
    })
    if (result?.error === 'DUPLICATE') {
      setDupError(true)
      return
    }
    setDupError(false)
    onAdded(result)
    setForm(DEFAULT)
  }

  if (!open) return null

  return (
    <div className="add-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="add-modal" style={{ '--accent': color }}>
        <div className="panel-header">
          <h2>Add Manually</h2>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>

        <form className="panel-form" onSubmit={handleSubmit}>
          <label>
            Title <span className="required">*</span>
            <input
              ref={titleRef}
              placeholder="e.g. Berserk"
              value={form.title}
              onChange={e => { set('title', e.target.value); setDupError(false) }}
              required
            />
          </label>
          {dupError && (
            <p className="add-dup-error">"{form.title.trim()}" is already in your library.</p>
          )}

          <label>
            Series <span className="subtle">(optional)</span>
            <SeriesSelect
              value={form.series_id}
              onChange={val => set('series_id', val)}
              series={seriesList}
              category={category}
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
            Date {categoryVerbs(category).past}
            <input
              type="date"
              value={form.date_read}
              onChange={e => set('date_read', e.target.value)}
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
      </div>
    </div>
  )
}
