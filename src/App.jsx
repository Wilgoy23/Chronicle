import { useEffect, useRef, useState } from 'react'
import AddEntryPanel from './components/AddEntryPanel'
import ConfirmDialog from './components/ConfirmDialog'
import EditEntryPanel from './components/EditEntryPanel'
import EntryCard from './components/EntryCard'
import SearchModal from './components/SearchModal'
import SeriesGroup from './components/SeriesGroup'
import TimelineView from './components/TimelineView'
import SettingsPage from './components/SettingsPage'
import ReleasesPanel from './components/ReleasesPanel'
import InsightsPage from './components/InsightsPage'

export const DEFAULT_CATEGORIES = [
  { id: 'book',  label: 'Books',    icon: '📖', color: '#e8a838', enabled: true },
  { id: 'anime', label: 'Anime',    icon: '⛩',  color: '#c084fc', enabled: true },
  { id: 'manga', label: 'Manga',    icon: '📚', color: '#2dd4bf', enabled: true },
  { id: 'movie', label: 'Movies',   icon: '🎬', color: '#38bdf8', enabled: true },
  { id: 'tv',    label: 'TV Shows', icon: '📺', color: '#fb7185', enabled: true },
  { id: 'game',  label: 'Games',    icon: '🎮', color: '#4ade80', enabled: true },
]

// Reconcile stored categories with the current defaults so users who saved
// their category settings before a new default (e.g. TV Shows) shipped still
// get it — appended at the end, preserving their order/color/enabled choices.
export function mergeCategories(stored) {
  if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_CATEGORIES
  const known = new Set(stored.map(c => c.id))
  return [...stored, ...DEFAULT_CATEGORIES.filter(c => !known.has(c.id))]
}

const S = 15
const ICONS = {
  book:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  anime:    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>,
  manga:    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z"/><path d="M4 18a2 2 0 0 1 2-2h12"/><line x1="8" y1="7" x2="14" y2="7"/></svg>,
  movie:    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>,
  tv:       <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><polyline points="7 3 12 7 17 3"/></svg>,
  game:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="13" r="1" fill="currentColor" stroke="none"/></svg>,
  settings: <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><circle cx="12" cy="4" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="20" r="2"/></svg>,
  grid:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  timeline: <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  plus:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  back:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  menu:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  trash:    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  pencil:   <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>,
  bell:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  search:   <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  sort:     <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="18" y2="6"/><line x1="4" y1="12" x2="13" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/></svg>,
  insights: <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="11" width="3.4" height="7"/><rect x="10.3" y="6" width="3.4" height="12"/><rect x="15.6" y="14" width="3.4" height="4"/></svg>,
  fallback: <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>,
}

// Built-in categories backed by an external search source. Every other
// category (user-created) skips the search modal and adds entries manually.
const SEARCH_SOURCES = new Set(['book', 'anime', 'manga', 'movie', 'tv', 'game'])

export function categoryHasSearch(cat) {
  return !!cat && SEARCH_SOURCES.has(cat.id)
}

// Build a user-created category. Custom ids never collide with the built-in
// ones (book/anime/…) so ICONS lookups miss and the chosen emoji is used.
export function createCustomCategory({ name, icon, color }) {
  return {
    id:      `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label:   (name ?? '').trim(),
    icon:    icon || '🏷',
    color:   color || '#a78bfa',
    enabled: true,
    custom:  true,
  }
}

// Nav glyph for a category: the hand-drawn SVG for a known built-in id,
// otherwise the category's own emoji, falling back to a generic bookmark.
function catGlyph(cat) {
  if (!cat) return ICONS.fallback
  if (ICONS[cat.id]) return ICONS[cat.id]
  if (cat.icon) return <span className="nav-emoji" aria-hidden="true">{cat.icon}</span>
  return ICONS.fallback
}

export const STATUS_LABELS = {
  completed:   'Completed',
  in_progress: 'In Progress',
  planned:     'Planned',
}

// Progress unit per category. Categories without an episodic/paginated unit
// (e.g. movies) simply have no progress UI unless a total is set manually.
export const PROGRESS_UNITS = {
  book:  'pages',
  anime: 'episodes',
  game:  'hours',
  manga: 'chapters',
  tv:    'episodes',
}

export function progressUnit(category) {
  return PROGRESS_UNITS[category] ?? 'units'
}

// Per-category verbs: `active` for in-progress wording, `past` for the "Date …" label.
const CATEGORY_VERBS = {
  book:  { active: 'Reading',  past: 'Read' },
  manga: { active: 'Reading',  past: 'Read' },
  anime: { active: 'Watching', past: 'Watched' },
  movie: { active: 'Watching', past: 'Watched' },
  tv:    { active: 'Watching', past: 'Watched' },
  game:  { active: 'Playing',  past: 'Played' },
}

export function categoryVerbs(category) {
  return CATEGORY_VERBS[category] ?? { active: 'In Progress', past: 'Finished' }
}

export const SORT_OPTIONS = [
  { key: 'recent', label: 'Recently added' },
  { key: 'title',  label: 'Title A–Z' },
  { key: 'rating', label: 'Rating' },
  { key: 'date',   label: 'Date' },
]

function entryDate(e) {
  return e.date_read || e.created_at?.slice(0, 10) || ''
}

// 'recent' preserves DB order (id DESC). Others return a sorted copy.
function sortEntries(entries, sort) {
  if (sort === 'title')  return [...entries].sort((a, b) => a.title.localeCompare(b.title))
  if (sort === 'rating') return [...entries].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
  if (sort === 'date')   return [...entries].sort((a, b) => entryDate(b).localeCompare(entryDate(a)))
  return entries
}

// Series groups always appear before solo entries.
// allSeries ensures empty (newly created) series still appear as drop targets.
function groupEntries(entries, allSeries = []) {
  const seriesMap = new Map()
  const seriesItems = []
  const soloItems = []
  for (const entry of entries) {
    if (entry.series_id) {
      if (!seriesMap.has(entry.series_id)) {
        const item = { type: 'series', id: entry.series_id, name: entry.series, entries: [] }
        seriesMap.set(entry.series_id, item)
        seriesItems.push(item)
      }
      seriesMap.get(entry.series_id).entries.push(entry)
    } else {
      soloItems.push({ type: 'solo', entry })
    }
  }
  for (const s of allSeries) {
    if (!seriesMap.has(s.id)) {
      seriesItems.unshift({ type: 'series', id: s.id, name: s.name, entries: [] })
    }
  }
  return [...seriesItems, ...soloItems]
}

export default function App() {
  const [page, setPage]               = useState('collection')
  const [categories, setCategories]   = useState(DEFAULT_CATEGORIES)
  const [category, setCategory]       = useState(DEFAULT_CATEGORIES[0].id)
  const [entries, setEntries]         = useState([])
  const [seriesList, setSeriesList]   = useState([])
  const [searchOpen, setSearchOpen]   = useState(false)
  const [manualOpen, setManualOpen]   = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [view, setView]               = useState('grid')
  const [statusFilter, setStatusFilter] = useState('all')
  const [seriesFilter, setSeriesFilter] = useState(null) // series_id | null
  const [tagFilter, setTagFilter]       = useState(null) // genre/tag string | null
  const [search, setSearch]           = useState('')
  const searchRef                     = useRef(null)
  const [sort, setSort]               = useState('recent')
  const [pendingSeriesId, setPendingSeriesId] = useState(null)
  const [newSeriesName, setNewSeriesName]     = useState('')
  const [showNewSeriesInput, setShowNewSeriesInput] = useState(false)
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [seriesToDelete, setSeriesToDelete]   = useState(null) // { id, name }
  const [renamingSeriesId, setRenamingSeriesId] = useState(null) // series_id being renamed | null
  const [renameValue, setRenameValue]         = useState('')
  const [logsByEntry, setLogsByEntry]         = useState({}) // entry_id -> log[] (re-watch/re-read occurrences)
  const [releases, setReleases]       = useState([])
  const [releasesOpen, setReleasesOpen] = useState(false)
  const [deleteToast, setDeleteToast] = useState(null)  // { title } while an undo is available
  const pendingDeleteRef              = useRef(null)     // { entry, index } awaiting commit
  const deleteTimerRef                = useRef(null)

  useEffect(() => {
    window.settings.get().then(s => {
      setCategories(mergeCategories(s.categories))
    })
  }, [])

  // Load detected releases and keep them fresh when a background scan finishes.
  useEffect(() => {
    if (!window.releases) return
    const load = () =>
      window.releases.get().then(({ items }) => setReleases(items))
    load()
    const off = window.releases.onUpdated(load)
    return off
  }, [])

  async function openReleases() {
    setReleasesOpen(true)
    // Clear the unread badge for the active category only — other tabs keep theirs.
    const unread = releases.filter(r => r.status === 'new' && r.category === activeCat?.id)
    if (!unread.length) return
    const unreadIds = new Set(unread.map(r => r.id))
    setReleases(prev => prev.map(r => unreadIds.has(r.id) ? { ...r, status: 'seen' } : r))
    await Promise.all(unread.map(r => window.releases.setStatus(r.id, 'seen')))
  }

  async function handleAddRelease(release) {
    const entry = await window.db.addEntry({
      category:  release.category,
      title:     release.title,
      status:    'planned',
      cover_url: release.cover_url || null,
      source:    release.source,
      source_id: release.source_id,
    })
    await window.releases.setStatus(release.id, 'added')
    setReleases(prev => prev.filter(r => r.id !== release.id))
    if (entry && !entry.error && release.category === activeCat?.id) {
      setEntries(prev => [entry, ...prev])
    }
  }

  async function handleDismissRelease(release) {
    await window.releases.setStatus(release.id, 'dismissed')
    setReleases(prev => prev.filter(r => r.id !== release.id))
  }

  const query = search.trim().toLowerCase()
  const filteredEntries = sortEntries(
    entries
      .filter(e => statusFilter === 'all' || e.status === statusFilter)
      .filter(e => seriesFilter == null || e.series_id === seriesFilter)
      .filter(e => tagFilter == null || (e.genres || '').toLowerCase()
        .split(',').map(t => t.trim()).includes(tagFilter.toLowerCase()))
      .filter(e => !query ||
        e.title.toLowerCase().includes(query) ||
        (e.series && e.series.toLowerCase().includes(query)) ||
        (e.notes && e.notes.toLowerCase().includes(query))),
    sort,
  )

  const visibleCats     = categories.filter(c => c.enabled)
  const activeCat       = visibleCats.find(c => c.id === category) ?? visibleCats[0]

  // What's New is scoped to the active tab: only this category's releases + badge.
  const categoryReleases = releases.filter(r => activeCat && r.category === activeCat.id)
  const unseenForCat     = categoryReleases.reduce((n, r) => n + (r.status === 'new' ? 1 : 0), 0)

  useEffect(() => {
    if (activeCat) {
      flushPendingDelete() // don't carry an undo across category switches
      setSeriesFilter(null)
      setTagFilter(null)
      setSearch('')
      setSort(loadSort(activeCat.id))
      setShowNewSeriesInput(false)
      setNewSeriesName('')
      window.db.getEntries(activeCat.id).then(setEntries)
      window.db.getSeries(activeCat.id).then(setSeriesList)
      refreshLogs()
    }
  }, [activeCat?.id])

  // Global keyboard shortcuts: Esc closes the topmost overlay; Ctrl/Cmd+N adds; Ctrl/Cmd+K|F focuses search.
  useEffect(() => {
    const anyOverlayOpen = searchOpen || manualOpen || !!editingEntry || releasesOpen || !!seriesToDelete
    function onKey(e) {
      if (e.key === 'Escape') {
        if (seriesToDelete)  { setSeriesToDelete(null); return }
        if (editingEntry)    { setEditingEntry(null); return }
        if (manualOpen)      { setManualOpen(false); setPendingSeriesId(null); return }
        if (searchOpen)      { setSearchOpen(false); setPendingSeriesId(null); return }
        if (releasesOpen)    { setReleasesOpen(false); return }
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'n' && page === 'collection' && !anyOverlayOpen) {
        e.preventDefault(); openAdd()
      } else if ((key === 'k' || key === 'f') && page === 'collection' && !anyOverlayOpen) {
        e.preventDefault(); searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen, manualOpen, editingEntry, releasesOpen, seriesToDelete, page])

  function refreshSeriesList() {
    window.db.getSeries(activeCat.id).then(setSeriesList)
  }

  function refreshEntries() {
    window.db.getEntries(activeCat.id).then(setEntries)
  }

  // Re-watch/re-read logs for the active category, grouped by entry_id.
  function refreshLogs() {
    window.db.getLogsByCategory(activeCat.id).then(rows => {
      const map = {}
      for (const l of rows) (map[l.entry_id] ??= []).push(l)
      setLogsByEntry(map)
    })
  }

  // Called by the edit panel after a log is added/removed: the entry's log_count
  // and the timeline occurrences both need to reflect the change.
  function handleLogsChanged() {
    refreshEntries()
    refreshLogs()
  }

  // Sort preference persists per category in localStorage.
  function loadSort(catId) {
    try {
      const saved = JSON.parse(localStorage.getItem('chronicle.sort') || '{}')
      return saved[catId] || 'recent'
    } catch { return 'recent' }
  }

  function changeSort(key) {
    setSort(key)
    try {
      const saved = JSON.parse(localStorage.getItem('chronicle.sort') || '{}')
      saved[activeCat.id] = key
      localStorage.setItem('chronicle.sort', JSON.stringify(saved))
    } catch { /* localStorage unavailable — in-memory sort still applies */ }
  }

  function handleCategoryClick(catId) {
    if (catId === activeCat?.id) return
    setCategory(catId)
    setSidebarOpen(false)
  }

  function toggleActiveSeriesFilter(seriesId) {
    setSeriesFilter(prev => prev === seriesId ? null : seriesId)
    setSidebarOpen(false)
  }

  function handleAdded(entry) {
    setEntries(prev => [entry, ...prev])
    refreshSeriesList()
    setManualOpen(false)
  }

  function handleSearchAdd(entry) {
    setEntries(prev => [entry, ...prev])
    refreshSeriesList()
  }

  // Deferred delete: remove from the UI now, commit to the DB when the toast expires.
  // Undo restores the row untouched (same id, series link, source linkage).
  function handleDelete(id) {
    flushPendingDelete() // only one undo in flight at a time
    const index = entries.findIndex(e => e.id === id)
    if (index === -1) return
    const entry = entries[index]
    pendingDeleteRef.current = { entry, index }
    setEntries(prev => prev.filter(e => e.id !== id))
    setDeleteToast({ title: entry.title })
    deleteTimerRef.current = setTimeout(flushPendingDelete, 5000)
  }

  function flushPendingDelete() {
    if (deleteTimerRef.current) { clearTimeout(deleteTimerRef.current); deleteTimerRef.current = null }
    const pending = pendingDeleteRef.current
    if (pending) {
      window.db.deleteEntry(pending.entry.id)
      pendingDeleteRef.current = null
    }
    setDeleteToast(null)
  }

  function undoDelete() {
    if (deleteTimerRef.current) { clearTimeout(deleteTimerRef.current); deleteTimerRef.current = null }
    const pending = pendingDeleteRef.current
    if (pending) {
      const { entry, index } = pending
      setEntries(prev => {
        const next = [...prev]
        next.splice(Math.min(index, next.length), 0, entry)
        return next
      })
      pendingDeleteRef.current = null
    }
    setDeleteToast(null)
  }

  function handleUpdate(updated) {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    refreshSeriesList()
  }

  // Quick +1 from a card. Reaching the total auto-completes the entry
  // (and stamps today's date if none was set).
  async function handleIncrement(entry) {
    const total = entry.progress_total
    const next  = total != null ? Math.min((entry.progress ?? 0) + 1, total) : (entry.progress ?? 0) + 1
    if (next === (entry.progress ?? 0)) return
    const done  = total != null && next >= total
    const updated = await window.db.updateEntry({
      id:        entry.id,
      title:     entry.title,
      status:    done ? 'completed' : entry.status,
      rating:    entry.rating,
      notes:     entry.notes,
      series_id: entry.series_id,
      date_read: done && !entry.date_read ? new Date().toISOString().slice(0, 10) : entry.date_read,
      progress:  next,
      progress_total: total,
    })
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
  }

  function handleEdit(entry) { setEditingEntry(entry) }

  // Clicking a genre/tag chip filters the view; clicking the active one clears it.
  function handleTagClick(tag) {
    setTagFilter(prev => (prev && prev.toLowerCase() === tag.toLowerCase() ? null : tag))
  }

  // Delete a single re-watch/re-read log occurrence (from the timeline).
  async function handleDeleteLog(logId) {
    await window.db.deleteLog(logId)
    handleLogsChanged()
  }

  async function handleDropEntry(entryId, targetSeriesId) {
    const entry = entries.find(e => e.id === entryId)
    if (!entry || entry.series_id === targetSeriesId) return
    const updated = await window.db.updateEntry({
      id:        entry.id,
      title:     entry.title,
      status:    entry.status,
      rating:    entry.rating,
      notes:     entry.notes,
      series_id: targetSeriesId,
      date_read: entry.date_read,
    })
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
  }

  async function handleNewSeries(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const created = await window.db.addSeries(activeCat.id, trimmed)
    refreshSeriesList()
    setPendingSeriesId(created.id)
    if (categoryHasSearch(activeCat)) setSearchOpen(true)
    else setManualOpen(true)
    setShowNewSeriesInput(false)
    setNewSeriesName('')
  }

  function handleDeleteSeries(seriesId, name) {
    setSeriesToDelete({ id: seriesId, name })
  }

  function startRenameSeries(series) {
    setRenamingSeriesId(series.id)
    setRenameValue(series.name)
  }

  function cancelRenameSeries() {
    setRenamingSeriesId(null)
    setRenameValue('')
  }

  async function commitRenameSeries(seriesId) {
    const trimmed = renameValue.trim()
    const current = seriesList.find(s => s.id === seriesId)
    // Ignore empty names or no-op edits; just close the input.
    if (!trimmed || (current && trimmed === current.name)) {
      cancelRenameSeries()
      return
    }
    const updated = await window.db.renameSeries(seriesId, trimmed)
    setSeriesList(prev => prev.map(s => s.id === seriesId ? { ...s, name: updated.name } : s))
    setEntries(prev => prev.map(e => e.series_id === seriesId ? { ...e, series: updated.name } : e))
    cancelRenameSeries()
  }

  async function confirmDeleteSeries() {
    const seriesId = seriesToDelete.id
    await window.db.deleteSeries(seriesId)
    setSeriesList(prev => prev.filter(s => s.id !== seriesId))
    setEntries(prev => prev.map(e => e.series_id === seriesId ? { ...e, series_id: null, series: null } : e))
    if (seriesFilter === seriesId) setSeriesFilter(null)
    setSeriesToDelete(null)
  }

  // Built-in categories open the external search modal; custom categories have
  // no search source, so Add Entry goes straight to the manual panel.
  function openAdd() {
    setPendingSeriesId(null)
    if (categoryHasSearch(activeCat)) setSearchOpen(true)
    else setManualOpen(true)
  }

  function handleSettingsReturn() {
    setPage('collection')
    window.settings.get().then(s => {
      setCategories(mergeCategories(s.categories))
    })
  }

  return (
    <div className="layout" style={{ '--accent': activeCat?.color }}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="mobile-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Navigation */}
      <div className={`nav-drawer ${sidebarOpen ? 'nav-drawer--open' : ''}`}>
        <aside className="sidebar">
          <div className="sidebar-inner">
            <div className="sidebar-logo">
              <span className="nav-label">Chronicle</span>
            </div>

            <nav className="sidebar-nav">
              {page === 'collection' && visibleCats.map(cat => {
                const isActive = activeCat?.id === cat.id
                return (
                  <button
                    key={cat.id}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    style={{ '--accent': cat.color }}
                    onClick={() => handleCategoryClick(cat.id)}
                    title={cat.label}
                  >
                    <span className="nav-icon">{catGlyph(cat)}</span>
                    <span className="nav-label">{cat.label}</span>
                    {isActive && entries.length > 0 && (
                      <span className="nav-count">{entries.length}</span>
                    )}
                  </button>
                )
              })}
            </nav>

            <div className="sidebar-bottom">
              <button
                className={`nav-item ${page === 'insights' ? 'active' : ''}`}
                style={{ '--accent': '#94a3b8' }}
                onClick={() => { setPage(page === 'insights' ? 'collection' : 'insights'); setSidebarOpen(false) }}
                title="Insights"
              >
                <span className="nav-icon">{ICONS.insights}</span>
                <span className="nav-label">Insights</span>
              </button>
              <button
                className={`nav-item ${page === 'settings' ? 'active' : ''}`}
                style={{ '--accent': '#94a3b8' }}
                onClick={() => { page === 'settings' ? handleSettingsReturn() : setPage('settings'); setSidebarOpen(false) }}
                title="Settings"
              >
                <span className="nav-icon">{ICONS.settings}</span>
                <span className="nav-label">Settings</span>
              </button>
            </div>
          </div>
        </aside>

        {page === 'collection' && (
          <aside className="series-sidebar" style={{ '--accent': activeCat?.color }}>
            <div className="series-sidebar-header">
              <span className="series-sidebar-icon">{catGlyph(activeCat)}</span>
              <span className="series-sidebar-title">{activeCat?.label}</span>
            </div>

            <div className="series-sidebar-list">
              <button
                className={`sidebar-series-item ${seriesFilter == null ? 'active' : ''}`}
                onClick={() => { setSeriesFilter(null); setSidebarOpen(false) }}
              >
                <span className="sidebar-series-dot" />
                <span className="sidebar-series-name">All {activeCat?.label}</span>
                {entries.length > 0 && <span className="sidebar-series-count">{entries.length}</span>}
              </button>

              {seriesList.map(s => {
                const count = entries.filter(e => e.series_id === s.id).length
                if (renamingSeriesId === s.id) {
                  return (
                    <div className="sidebar-series-input-row" key={s.id}>
                      <input
                        autoFocus
                        className="sidebar-series-input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRenameSeries(s.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRenameSeries(s.id)
                          if (e.key === 'Escape') cancelRenameSeries()
                        }}
                      />
                    </div>
                  )
                }
                return (
                  <div className="sidebar-series-row" key={s.id}>
                    <button
                      className={`sidebar-series-item ${seriesFilter === s.id ? 'active' : ''}`}
                      onClick={() => toggleActiveSeriesFilter(s.id)}
                      onDoubleClick={() => startRenameSeries(s)}
                    >
                      <span className="sidebar-series-dot" />
                      <span className="sidebar-series-name">{s.name}</span>
                      <span className="sidebar-series-count">{count}</span>
                    </button>
                    <button
                      className="sidebar-series-rename"
                      onClick={() => startRenameSeries(s)}
                      title={`Rename ${s.name}`}
                    >
                      {ICONS.pencil}
                    </button>
                    <button
                      className="sidebar-series-delete"
                      onClick={() => handleDeleteSeries(s.id, s.name)}
                      title={`Delete ${s.name}`}
                    >
                      {ICONS.trash}
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="series-sidebar-footer">
              {showNewSeriesInput ? (
                <div className="sidebar-series-input-row">
                  <input
                    autoFocus
                    className="sidebar-series-input"
                    placeholder="Series name…"
                    value={newSeriesName}
                    onChange={e => setNewSeriesName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleNewSeries(newSeriesName)
                      if (e.key === 'Escape') { setShowNewSeriesInput(false); setNewSeriesName('') }
                    }}
                  />
                  <button className="sidebar-series-confirm-btn" onClick={() => handleNewSeries(newSeriesName)}>+</button>
                </div>
              ) : (
                <button className="sidebar-new-series-btn" onClick={() => setShowNewSeriesInput(true)}>
                  + New series
                </button>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Main */}
      {page === 'settings' ? (
        <main className="main">
          <header className="topbar" style={{ '--accent': '#94a3b8' }}>
            <div className="topbar-title">
              <button className="mobile-menu-btn" onClick={() => setSidebarOpen(s => !s)} aria-label="Menu">
                {ICONS.menu}
              </button>
              <span className="topbar-icon">{ICONS.settings}</span>
              <h1>Settings</h1>
            </div>
            <button className="add-btn" style={{ '--accent': '#94a3b8' }} onClick={handleSettingsReturn}>
              {ICONS.back}&nbsp; Back
            </button>
          </header>
          <SettingsPage />
        </main>
      ) : page === 'insights' ? (
        <main className="main">
          <header className="topbar" style={{ '--accent': '#94a3b8' }}>
            <div className="topbar-title">
              <button className="mobile-menu-btn" onClick={() => setSidebarOpen(s => !s)} aria-label="Menu">
                {ICONS.menu}
              </button>
              <span className="topbar-icon">{ICONS.insights}</span>
              <h1>Insights</h1>
            </div>
            <button className="add-btn" style={{ '--accent': '#94a3b8' }} onClick={() => setPage('collection')}>
              {ICONS.back}&nbsp; Back
            </button>
          </header>
          <div className="insights-scroll">
            <InsightsPage categories={categories} accent={activeCat?.color ?? '#c084fc'} />
          </div>
        </main>
      ) : (
        <main className="main">
          <header className="topbar" style={{ '--accent': activeCat?.color }}>
            <div className="topbar-title">
              <button className="mobile-menu-btn" onClick={() => setSidebarOpen(s => !s)} aria-label="Menu">
                {ICONS.menu}
              </button>
              <span className="topbar-icon">{catGlyph(activeCat)}</span>
              <h1>{activeCat?.label}</h1>
              <span className="topbar-count">{entries.length}</span>
            </div>
            <div className="topbar-actions">
              <button
                className="bell-btn"
                onClick={openReleases}
                title="New releases"
                aria-label="New releases"
              >
                {ICONS.bell}
                {unseenForCat > 0 && (
                  <span className="bell-badge">{unseenForCat > 9 ? '9+' : unseenForCat}</span>
                )}
              </button>
              {view === 'grid' && (
                <div className="sort-control" title="Sort">
                  <span className="sort-icon">{ICONS.sort}</span>
                  <select
                    className="sort-select"
                    value={sort}
                    onChange={e => changeSort(e.target.value)}
                    aria-label="Sort entries"
                  >
                    {SORT_OPTIONS.map(o => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="view-toggle">
                <button
                  className={`view-btn ${view === 'grid' ? 'active' : ''}`}
                  onClick={() => setView('grid')}
                  title="Grid view"
                >{ICONS.grid}</button>
                <button
                  className={`view-btn ${view === 'timeline' ? 'active' : ''}`}
                  onClick={() => setView('timeline')}
                  title="Timeline view"
                >{ICONS.timeline}</button>
              </div>
              <button
                className="add-btn"
                style={{ '--accent': activeCat?.color }}
                onClick={openAdd}
              >
                {ICONS.plus}&nbsp; Add Entry
              </button>
            </div>
          </header>

          {/* Filter strip */}
          <div className="filter-strip">
            {[
              { key: 'all',         label: 'All' },
              { key: 'completed',   label: 'Completed',   color: '#4ade80' },
              { key: 'in_progress', label: 'In Progress', color: '#facc15' },
              { key: 'planned',     label: 'Planned',     color: '#94a3b8' },
            ].map(f => (
              <button
                key={f.key}
                className={`filter-chip ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.color && <span className="filter-dot" style={{ background: f.color }} />}
                {f.label}
              </button>
            ))}

            <div className="filter-search">
              <span className="filter-search-icon">{ICONS.search}</span>
              <input
                ref={searchRef}
                className="filter-search-input"
                placeholder={`Search ${activeCat?.label.toLowerCase()}…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setSearch('') }}
              />
              {search && (
                <button className="filter-search-clear" onClick={() => setSearch('')} title="Clear search">✕</button>
              )}
            </div>

            {tagFilter && (
              <button
                className="tag-filter-active"
                onClick={() => setTagFilter(null)}
                title="Clear tag filter"
              >
                <span className="tag-filter-hash">#</span>
                {tagFilter}
                <span className="tag-filter-x">✕</span>
              </button>
            )}
          </div>

          {view === 'timeline' ? (
            <div className="timeline-container">
              <TimelineView
                entries={filteredEntries}
                logsByEntry={logsByEntry}
                color={activeCat?.color}
                onDelete={handleDelete}
                onDeleteLog={handleDeleteLog}
                onUpdate={handleUpdate}
                onEdit={handleEdit}
              />
              {filteredEntries.length === 0 && (
                <div className="empty-state">
                  {query ? (
                    <p>No matches for &ldquo;{search}&rdquo;.</p>
                  ) : (
                    <>
                      <p>No {activeCat?.label.toLowerCase()} yet.</p>
                      <button className="add-btn" style={{ '--accent': activeCat?.color }} onClick={openAdd}>
                        Add your first
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : null}

          <div className="entries-grid" style={{ display: view === 'grid' ? undefined : 'none' }}>
            {filteredEntries.length === 0 && (query || seriesList.length === 0) && (
              <div className="empty-state">
                {query ? (
                  <p>No matches for &ldquo;{search}&rdquo;.</p>
                ) : (
                  <>
                    <p>No {activeCat?.label.toLowerCase()} yet.</p>
                    <button className="add-btn" style={{ '--accent': activeCat?.color }} onClick={openAdd}>
                      Add your first
                    </button>
                  </>
                )}
              </div>
            )}
            {(seriesFilter != null || tagFilter != null || query
              ? filteredEntries.map(e => ({ type: 'solo', entry: e }))
              : groupEntries(filteredEntries, seriesList)
            ).map(item =>
              item.type === 'series' ? (
                <SeriesGroup
                  key={`series:${item.id}`}
                  seriesId={item.id}
                  name={item.name}
                  entries={item.entries}
                  color={activeCat?.color}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onIncrement={handleIncrement}
                  onDropEntry={handleDropEntry}
                  onDeleteSeries={handleDeleteSeries}
                  onTagClick={handleTagClick}
                  activeTag={tagFilter}
                />
              ) : (
                <EntryCard
                  key={item.entry.id}
                  entry={item.entry}
                  color={activeCat?.color}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onIncrement={handleIncrement}
                  onTagClick={handleTagClick}
                  activeTag={tagFilter}
                />
              )
            )}
          </div>

          <SearchModal
            open={searchOpen}
            category={activeCat?.id}
            color={activeCat?.color}
            seriesList={seriesList}
            existingEntries={entries}
            defaultSeriesId={pendingSeriesId}
            onAdd={handleSearchAdd}
            onAddManually={() => { setSearchOpen(false); setManualOpen(true) }}
            onClose={() => { setSearchOpen(false); setPendingSeriesId(null) }}
          />

          <AddEntryPanel
            open={manualOpen}
            category={activeCat?.id}
            color={activeCat?.color}
            seriesList={seriesList}
            defaultSeriesId={pendingSeriesId}
            onClose={() => { setManualOpen(false); setPendingSeriesId(null) }}
            onAdded={handleAdded}
          />

          <EditEntryPanel
            entry={editingEntry}
            color={activeCat?.color}
            seriesList={seriesList}
            onClose={() => setEditingEntry(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onLogsChanged={handleLogsChanged}
          />

          <ReleasesPanel
            open={releasesOpen}
            releases={categoryReleases}
            color={activeCat?.color}
            onClose={() => setReleasesOpen(false)}
            onAdd={handleAddRelease}
            onDismiss={handleDismissRelease}
          />
        </main>
      )}

      <ConfirmDialog
        open={!!seriesToDelete}
        title={`Delete "${seriesToDelete?.name}"?`}
        message="Its entries will be kept but unassigned from this series."
        confirmLabel="Delete series"
        onConfirm={confirmDeleteSeries}
        onCancel={() => setSeriesToDelete(null)}
      />

      {deleteToast && (
        <div className="undo-toast" role="status">
          <span className="undo-toast-msg">
            Deleted <strong>{deleteToast.title}</strong>
          </span>
          <button className="undo-toast-btn" onClick={undoDelete}>Undo</button>
          <button className="undo-toast-close" onClick={flushPendingDelete} aria-label="Dismiss">✕</button>
        </div>
      )}
    </div>
  )
}
