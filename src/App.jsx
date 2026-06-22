import { useEffect, useState } from 'react'
import AddEntryPanel from './components/AddEntryPanel'
import ConfirmDialog from './components/ConfirmDialog'
import EditEntryPanel from './components/EditEntryPanel'
import EntryCard from './components/EntryCard'
import SearchModal from './components/SearchModal'
import SeriesGroup from './components/SeriesGroup'
import TimelineView from './components/TimelineView'
import SettingsPage from './components/SettingsPage'
import ReleasesPanel from './components/ReleasesPanel'

export const DEFAULT_CATEGORIES = [
  { id: 'book',  label: 'Books',  icon: '📖', color: '#e8a838', enabled: true },
  { id: 'anime', label: 'Anime',  icon: '⛩',  color: '#c084fc', enabled: true },
  { id: 'movie', label: 'Movies', icon: '🎬', color: '#38bdf8', enabled: true },
  { id: 'game',  label: 'Games',  icon: '🎮', color: '#4ade80', enabled: true },
]

const S = 15
const ICONS = {
  book:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  anime:    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>,
  movie:    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>,
  game:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="13" r="1" fill="currentColor" stroke="none"/></svg>,
  settings: <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><circle cx="12" cy="4" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="20" r="2"/></svg>,
  grid:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  timeline: <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  plus:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  back:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  menu:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  trash:    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  bell:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
}

export const STATUS_LABELS = {
  completed:   'Completed',
  in_progress: 'In Progress',
  planned:     'Planned',
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
  const [pendingSeriesId, setPendingSeriesId] = useState(null)
  const [newSeriesName, setNewSeriesName]     = useState('')
  const [showNewSeriesInput, setShowNewSeriesInput] = useState(false)
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [seriesToDelete, setSeriesToDelete]   = useState(null) // { id, name }
  const [releases, setReleases]       = useState([])
  const [unseenReleases, setUnseen]   = useState(0)
  const [releasesOpen, setReleasesOpen] = useState(false)

  useEffect(() => {
    window.settings.get().then(s => {
      if (s.categories) setCategories(s.categories)
    })
  }, [])

  // Load detected releases and keep them fresh when a background scan finishes.
  useEffect(() => {
    if (!window.releases) return
    const load = () =>
      window.releases.get().then(({ items, unseen }) => { setReleases(items); setUnseen(unseen) })
    load()
    const off = window.releases.onUpdated(load)
    return off
  }, [])

  async function openReleases() {
    setReleasesOpen(true)
    // Clear the unread badge without removing items from the inbox.
    const unread = releases.filter(r => r.status === 'new')
    setUnseen(0)
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

  const filteredEntries = entries
    .filter(e => statusFilter === 'all' || e.status === statusFilter)
    .filter(e => seriesFilter == null || e.series_id === seriesFilter)

  const visibleCats     = categories.filter(c => c.enabled)
  const activeCat       = visibleCats.find(c => c.id === category) ?? visibleCats[0]

  useEffect(() => {
    if (activeCat) {
      setSeriesFilter(null)
      setShowNewSeriesInput(false)
      setNewSeriesName('')
      window.db.getEntries(activeCat.id).then(setEntries)
      window.db.getSeries(activeCat.id).then(setSeriesList)
    }
  }, [activeCat?.id])

  function refreshSeriesList() {
    window.db.getSeries(activeCat.id).then(setSeriesList)
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

  async function handleDelete(id) {
    await window.db.deleteEntry(id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  function handleUpdate(updated) {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    refreshSeriesList()
  }

  function handleEdit(entry) { setEditingEntry(entry) }

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
    setSearchOpen(true)
    setShowNewSeriesInput(false)
    setNewSeriesName('')
  }

  function handleDeleteSeries(seriesId, name) {
    setSeriesToDelete({ id: seriesId, name })
  }

  async function confirmDeleteSeries() {
    const seriesId = seriesToDelete.id
    await window.db.deleteSeries(seriesId)
    setSeriesList(prev => prev.filter(s => s.id !== seriesId))
    setEntries(prev => prev.map(e => e.series_id === seriesId ? { ...e, series_id: null, series: null } : e))
    if (seriesFilter === seriesId) setSeriesFilter(null)
    setSeriesToDelete(null)
  }

  function openAdd() {
    setPendingSeriesId(null)
    setSearchOpen(true)
  }

  function handleSettingsReturn() {
    setPage('collection')
    window.settings.get().then(s => {
      if (s.categories) setCategories(s.categories)
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
                    <span className="nav-icon">{ICONS[cat.id]}</span>
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
              <span className="series-sidebar-icon">{ICONS[activeCat?.id]}</span>
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
                return (
                  <div className="sidebar-series-row" key={s.id}>
                    <button
                      className={`sidebar-series-item ${seriesFilter === s.id ? 'active' : ''}`}
                      onClick={() => toggleActiveSeriesFilter(s.id)}
                    >
                      <span className="sidebar-series-dot" />
                      <span className="sidebar-series-name">{s.name}</span>
                      <span className="sidebar-series-count">{count}</span>
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
      ) : (
        <main className="main">
          <header className="topbar" style={{ '--accent': activeCat?.color }}>
            <div className="topbar-title">
              <button className="mobile-menu-btn" onClick={() => setSidebarOpen(s => !s)} aria-label="Menu">
                {ICONS.menu}
              </button>
              <span className="topbar-icon">{ICONS[activeCat?.id]}</span>
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
                {unseenReleases > 0 && (
                  <span className="bell-badge">{unseenReleases > 9 ? '9+' : unseenReleases}</span>
                )}
              </button>
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
          </div>

          {view === 'timeline' ? (
            <div className="timeline-container">
              <TimelineView
                entries={filteredEntries}
                color={activeCat?.color}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                onEdit={handleEdit}
              />
              {filteredEntries.length === 0 && (
                <div className="empty-state">
                  <p>No {activeCat?.label.toLowerCase()} yet.</p>
                  <button className="add-btn" style={{ '--accent': activeCat?.color }} onClick={openAdd}>
                    Add your first
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <div className="entries-grid" style={{ display: view === 'grid' ? undefined : 'none' }}>
            {filteredEntries.length === 0 && seriesList.length === 0 && (
              <div className="empty-state">
                <p>No {activeCat?.label.toLowerCase()} yet.</p>
                <button className="add-btn" style={{ '--accent': activeCat?.color }} onClick={openAdd}>
                  Add your first
                </button>
              </div>
            )}
            {(seriesFilter != null
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
                  onDropEntry={handleDropEntry}
                  onDeleteSeries={handleDeleteSeries}
                />
              ) : (
                <EntryCard
                  key={item.entry.id}
                  entry={item.entry}
                  color={activeCat?.color}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
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
          />

          <ReleasesPanel
            open={releasesOpen}
            releases={releases}
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
    </div>
  )
}
