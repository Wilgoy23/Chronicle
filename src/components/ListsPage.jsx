import { useEffect, useMemo, useRef, useState } from 'react'
import Cover from './Cover'
import ConfirmDialog from './ConfirmDialog'
import { ICONS, STATUS_LABELS, catGlyph } from '../App'

// Custom lists (8.1): ordered, cross-category collections that sit alongside
// status ("Comfort rewatches", "Before the sequel comes out").

const STATUS_COLORS = { completed: '#4ade80', in_progress: '#facc15', planned: '#94a3b8' }

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function ListsPage({ categories, version = 0, hiddenIds = [], onOpenEntry, initialListId = null }) {
  const [lists, setLists] = useState(null)
  const [openId, setOpenId] = useState(initialListId)

  function refresh() {
    return window.lists.getAll().then(setLists)
  }

  useEffect(() => { refresh() }, [version])

  const open = lists?.find(l => l.id === openId) ?? null

  if (!lists) return <div className="lists-page"><p className="upnext-loading">Loading…</p></div>

  if (open) {
    return (
      <ListDetail
        key={open.id}
        list={open}
        categories={categories}
        version={version}
        hiddenIds={hiddenIds}
        onBack={() => { setOpenId(null); refresh() }}
        onChanged={refresh}
        onDeleted={() => { setOpenId(null); refresh() }}
        onOpenEntry={onOpenEntry}
      />
    )
  }

  return <ListIndex lists={lists} onOpen={setOpenId} onCreated={(l) => { refresh(); setOpenId(l.id) }} />
}

// ── Index ─────────────────────────────────────────────────────────

function ListIndex({ lists, onOpen, onCreated }) {
  const [creating, setCreating] = useState(false)

  return (
    <div className="lists-page">
      <div className="lists-head">
        <p className="lists-intro">
          Ordered lists that can mix books, shows, games and anything else, separate from status.
        </p>
        {!creating && (
          <button className="add-btn" onClick={() => setCreating(true)}>{ICONS.plus}&nbsp; New list</button>
        )}
      </div>

      {creating && <NewListForm onCancel={() => setCreating(false)} onCreated={l => { setCreating(false); onCreated(l) }} />}

      {lists.length === 0 && !creating ? (
        <div className="upnext-empty">
          <h2>No lists yet</h2>
          <p>
            Make one for a rewatch rotation, a reading order, or everything to catch up on before a
            sequel. Lists can hold titles from any category, in whatever order you like.
          </p>
          <div className="upnext-empty-actions">
            <button className="add-btn" onClick={() => setCreating(true)}>Create your first list</button>
          </div>
        </div>
      ) : (
        <div className="lists-grid">
          {lists.map(l => (
            <button key={l.id} className="list-card" onClick={() => onOpen(l.id)}>
              <ListMosaic covers={l.covers} />
              <span className="list-card-name">{l.name}</span>
              <span className="list-card-meta">
                {plural(l.item_count, 'title')}
                {l.item_count > 0 && ` · ${l.completed_count} done`}
              </span>
              {l.description && <span className="list-card-desc">{l.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Up to four covers in a 2×2 grid; a single cover fills the tile. Covers that
// fail to load drop out rather than showing a broken image.
function ListMosaic({ covers }) {
  const [failed, setFailed] = useState(() => new Set())
  const ok = covers.filter(src => !failed.has(src))
  const fail = (src) => setFailed(prev => new Set(prev).add(src))

  if (ok.length === 0) {
    return (
      <div className="list-mosaic list-mosaic--empty" aria-hidden="true">
        <span className="list-mosaic-icon">{ICONS.lists}</span>
      </div>
    )
  }
  if (ok.length === 1) {
    return (
      <div className="list-mosaic list-mosaic--single" aria-hidden="true">
        <img src={ok[0]} alt="" loading="lazy" onError={() => fail(ok[0])} />
      </div>
    )
  }
  return (
    <div className="list-mosaic" aria-hidden="true">
      {[0, 1, 2, 3].map(i => ok[i]
        ? <img key={ok[i]} src={ok[i]} alt="" loading="lazy" onError={() => fail(ok[i])} />
        : <span key={`blank-${i}`} className="list-mosaic-blank" />)}
    </div>
  )
}

function NewListForm({ onCancel, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const created = await window.lists.create({ name, description })
    setBusy(false)
    if (created && !created.error) onCreated(created)
  }

  return (
    <form className="list-new-form" onSubmit={submit}>
      <input
        autoFocus
        className="edit-input"
        placeholder="List name, e.g. Comfort rewatches"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        aria-label="List name"
      />
      <input
        className="edit-input"
        placeholder="Description (optional)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        aria-label="List description"
      />
      <div className="list-new-actions">
        <button type="submit" className="upnext-btn upnext-btn--primary" disabled={busy || !name.trim()}>Create list</button>
        <button type="button" className="upnext-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

// ── Detail ────────────────────────────────────────────────────────

function ListDetail({ list, categories, version, hiddenIds, onBack, onChanged, onDeleted, onOpenEntry }) {
  const [items, setItems] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingMeta, setEditingMeta] = useState(false)
  const [hideDone, setHideDone] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const hidden = useMemo(() => new Set(hiddenIds), [hiddenIds])

  function loadItems() {
    return window.lists.getItems(list.id).then(setItems)
  }
  useEffect(() => { loadItems() }, [list.id, version])

  const all = (items ?? []).filter(i => !hidden.has(i.id))
  const shown = hideDone ? all.filter(i => i.status !== 'completed') : all
  const done = all.filter(i => i.status === 'completed').length
  const pct = all.length ? Math.round((done / all.length) * 100) : 0

  async function persistOrder(next) {
    setItems(next)
    await window.lists.reorder(list.id, next.map(i => i.id))
    onChanged()
  }

  function move(entryId, delta) {
    const idx = items.findIndex(i => i.id === entryId)
    const to = idx + delta
    if (idx < 0 || to < 0 || to >= items.length) return
    const next = [...items]
    const [it] = next.splice(idx, 1)
    next.splice(to, 0, it)
    persistOrder(next)
  }

  // Drop position is an index into the full list (hidden "done" rows keep their slots).
  function dropAt(targetId, after) {
    if (dragId == null || dragId === targetId) return
    const next = items.filter(i => i.id !== dragId)
    const dragged = items.find(i => i.id === dragId)
    let idx = next.findIndex(i => i.id === targetId)
    if (idx < 0) return
    if (after) idx += 1
    next.splice(idx, 0, dragged)
    persistOrder(next)
  }

  async function remove(entryId) {
    setItems(prev => prev.filter(i => i.id !== entryId))
    await window.lists.removeItem(list.id, entryId)
    onChanged()
  }

  async function saveNote(entryId, note) {
    setItems(prev => prev.map(i => i.id === entryId ? { ...i, list_note: note.trim() || null } : i))
    await window.lists.setNote(list.id, entryId, note)
  }

  async function addEntries(ids) {
    const res = await window.lists.addItems(list.id, ids)
    await loadItems()
    onChanged()
    return res
  }

  async function removeList() {
    await window.lists.remove(list.id)
    setConfirmDelete(false)
    onDeleted()
  }

  return (
    <div className="lists-page">
      <button className="list-back" onClick={onBack}>{ICONS.back}&nbsp; All lists</button>

      {editingMeta ? (
        <ListMetaForm list={list} onDone={() => setEditingMeta(false)} onSaved={() => { setEditingMeta(false); onChanged() }} />
      ) : (
        <div className="list-header">
          <div className="list-header-text">
            <h2 className="list-page-title">{list.name}</h2>
            {list.description && <p className="list-desc">{list.description}</p>}
            <div className="list-stats">
              <span>{plural(all.length, 'title')}</span>
              {all.length > 0 && <span>{done} of {all.length} done</span>}
              {all.length > 0 && (
                <div className="upnext-bar list-bar" title={`${pct}% done`}>
                  <div className="upnext-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          </div>
          <div className="list-header-actions">
            <button className="upnext-btn upnext-btn--primary" onClick={() => setPickerOpen(true)}>{ICONS.plus}&nbsp;Add titles</button>
            <button className="upnext-btn" onClick={() => setEditingMeta(true)} title="Rename or describe this list">{ICONS.pencil}&nbsp;Edit</button>
            <button className="upnext-btn list-delete-btn" onClick={() => setConfirmDelete(true)} title="Delete this list">{ICONS.trash}</button>
          </div>
        </div>
      )}

      {all.length > 0 && done > 0 && (
        <label className="list-hide-done">
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
          Hide completed
        </label>
      )}

      {items == null ? (
        <p className="upnext-loading">Loading…</p>
      ) : all.length === 0 ? (
        <div className="list-empty">
          <p>This list is empty. Add titles from your library, in any category.</p>
          <button className="add-btn" onClick={() => setPickerOpen(true)}>{ICONS.plus}&nbsp; Add titles</button>
        </div>
      ) : (
        <ol className="list-items">
          {shown.map(item => {
            const pos = items.findIndex(i => i.id === item.id)
            return (
              <ListItemRow
                key={item.id}
                item={item}
                index={pos}
                count={items.length}
                cat={catById.get(item.category)}
                dragging={dragId === item.id}
                dropMarker={dropIndex?.id === item.id ? dropIndex.after ? 'after' : 'before' : null}
                onOpen={() => onOpenEntry(item)}
                onMove={d => move(item.id, d)}
                onRemove={() => remove(item.id)}
                onSaveNote={n => saveNote(item.id, n)}
                onDragStart={() => setDragId(item.id)}
                onDragEnd={() => { setDragId(null); setDropIndex(null) }}
                onDragOverRow={after => setDropIndex({ id: item.id, after })}
                onDropRow={after => { dropAt(item.id, after); setDragId(null); setDropIndex(null) }}
              />
            )
          })}
        </ol>
      )}

      <ListPicker
        open={pickerOpen}
        list={list}
        categories={categories}
        memberIds={new Set((items ?? []).map(i => i.id))}
        onAdd={addEntries}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${list.name}"?`}
        message="The list is removed; the titles on it stay in your library."
        confirmLabel="Delete list"
        onConfirm={removeList}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function ListMetaForm({ list, onDone, onSaved }) {
  const [name, setName] = useState(list.name)
  const [description, setDescription] = useState(list.description ?? '')

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    const res = await window.lists.update({ id: list.id, name, description })
    if (res && !res.error) onSaved()
  }

  return (
    <form className="list-new-form" onSubmit={submit}>
      <input autoFocus className="edit-input" value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onDone() }} aria-label="List name" />
      <input className="edit-input" placeholder="Description (optional)" value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onDone() }} aria-label="List description" />
      <div className="list-new-actions">
        <button type="submit" className="upnext-btn upnext-btn--primary" disabled={!name.trim()}>Save</button>
        <button type="button" className="upnext-btn" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

function ListItemRow({
  item, index, count, cat, dragging, dropMarker,
  onOpen, onMove, onRemove, onSaveNote, onDragStart, onDragEnd, onDragOverRow, onDropRow,
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(item.list_note ?? '')
  const rowRef = useRef(null)

  useEffect(() => { setNote(item.list_note ?? '') }, [item.list_note])

  function isAfter(e) {
    const r = rowRef.current?.getBoundingClientRect()
    return r ? e.clientY > r.top + r.height / 2 : false
  }

  function commitNote() {
    setNoteOpen(false)
    if ((note.trim() || null) !== (item.list_note ?? null)) onSaveNote(note)
  }

  return (
    <li
      ref={rowRef}
      className={`list-item ${dragging ? 'dragging' : ''} ${dropMarker ? `drop-${dropMarker}` : ''}`}
      style={{ '--accent': cat?.color }}
      onDragOver={e => { e.preventDefault(); onDragOverRow(isAfter(e)) }}
      onDrop={e => { e.preventDefault(); onDropRow(isAfter(e)) }}
    >
      <span
        className="list-item-handle"
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(item.id)); onDragStart() }}
        onDragEnd={onDragEnd}
        title="Drag to reorder"
        aria-hidden="true"
      >⋮⋮</span>
      <span className="list-item-num">{index + 1}</span>
      <button className="list-item-open" onClick={onOpen} title={`Edit ${item.title}`}>
        <Cover className="list-item-cover" src={item.cover_url} alt={item.title} compact />
        <span className="list-item-main">
          <span className="upnext-title">{item.title}</span>
          <span className="upnext-meta">
            {cat && (
              <span className="upnext-cat" style={{ '--accent': cat.color }}>
                <span className="upnext-cat-icon">{catGlyph(cat)}</span>{cat.label}
              </span>
            )}
            <span className="list-item-status">
              <span className="filter-dot" style={{ background: STATUS_COLORS[item.status] }} />
              {STATUS_LABELS[item.status] ?? item.status}
            </span>
            {item.year && <span>{item.year}</span>}
          </span>
        </span>
      </button>

      <div className="list-item-note-wrap">
        {noteOpen ? (
          <input
            autoFocus
            className="edit-input list-item-note-input"
            value={note}
            placeholder="Why it's on this list…"
            onChange={e => setNote(e.target.value)}
            onBlur={commitNote}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { setNote(item.list_note ?? ''); setNoteOpen(false) }
            }}
            aria-label={`Note for ${item.title}`}
          />
        ) : item.list_note ? (
          <button className="list-item-note" onClick={() => setNoteOpen(true)} title="Edit note">{item.list_note}</button>
        ) : (
          <button className="list-item-note list-item-note--add" onClick={() => setNoteOpen(true)}>+ note</button>
        )}
      </div>

      <div className="list-item-actions">
        <button className="list-icon-btn" onClick={() => onMove(-1)} disabled={index === 0} title="Move up" aria-label={`Move ${item.title} up`}>▲</button>
        <button className="list-icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} title="Move down" aria-label={`Move ${item.title} down`}>▼</button>
        <button className="list-icon-btn" onClick={onRemove} title="Remove from list" aria-label={`Remove ${item.title} from list`}>✕</button>
      </div>
    </li>
  )
}

// ── Library picker ────────────────────────────────────────────────

const PICKER_CAP = 80

function ListPicker({ open, list, categories, memberIds, onAdd, onClose }) {
  const [entries, setEntries] = useState([])
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    window.db.getEntries().then(setEntries)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const enabled = useMemo(() => new Set(categories.map(c => c.id)), [categories])

  const q = query.trim().toLowerCase()
  const matches = entries
    .filter(e => enabled.has(e.category))
    .filter(e => cat === 'all' || e.category === cat)
    .filter(e => !q || e.title.toLowerCase().includes(q) || (e.series ?? '').toLowerCase().includes(q))
  const shown = matches.slice(0, PICKER_CAP)

  if (!open) return null

  async function add(entry) {
    setBusyId(entry.id)
    try { await onAdd([entry.id]) } finally { setBusyId(null) }
  }

  return (
    <div className="search-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-modal list-picker" role="dialog" aria-modal="true" aria-label={`Add titles to ${list.name}`} style={{ '--accent': '#94a3b8' }}>
        <div className="search-modal-header">
          <span className="filter-search-icon">{ICONS.search}</span>
          <input
            autoFocus
            className="search-modal-input"
            placeholder={`Search your library to add to “${list.name}”…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="list-picker-cats">
          <button className={`filter-chip ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>All</button>
          {categories.map(c => (
            <button key={c.id} className={`filter-chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
              <span className="filter-dot" style={{ background: c.color }} />{c.label}
            </button>
          ))}
        </div>
        <div className="list-picker-results">
          {shown.length === 0 && (
            <p className="list-picker-empty">
              {entries.length === 0 ? 'Your library is empty. Add titles to a category first.' : 'No titles match.'}
            </p>
          )}
          {shown.map(e => {
            const c = catById.get(e.category)
            const on = memberIds.has(e.id)
            return (
              <div key={e.id} className="list-picker-row" style={{ '--accent': c?.color }}>
                <Cover className="list-picker-cover" src={e.cover_url} alt={e.title} compact />
                <div className="list-item-main">
                  <span className="upnext-title">{e.title}</span>
                  <span className="upnext-meta">
                    {c && <span className="upnext-cat"><span className="upnext-cat-icon">{catGlyph(c)}</span>{c.label}</span>}
                    {e.series && <span className="upnext-series">{e.series}</span>}
                    {e.year && <span>{e.year}</span>}
                  </span>
                </div>
                <button
                  className={`upnext-btn ${on ? '' : 'upnext-btn--primary'}`}
                  disabled={on || busyId === e.id}
                  onClick={() => add(e)}
                >
                  {on ? 'On list' : 'Add'}
                </button>
              </div>
            )
          })}
          {matches.length > PICKER_CAP && (
            <p className="list-picker-empty">Showing {PICKER_CAP} of {matches.length}. Search to narrow it down.</p>
          )}
        </div>
      </div>
    </div>
  )
}
