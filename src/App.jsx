import { useEffect, useState } from 'react'
import AddEntryPanel from './components/AddEntryPanel'
import EditEntryPanel from './components/EditEntryPanel'
import EntryCard from './components/EntryCard'
import SearchModal from './components/SearchModal'
import SeriesGroup from './components/SeriesGroup'
import TimelineView from './components/TimelineView'
import SettingsPage from './components/SettingsPage'

export const DEFAULT_CATEGORIES = [
  { id: 'book',  label: 'Books',  icon: '📖', color: '#e8a838', enabled: true },
  { id: 'anime', label: 'Anime',  icon: '⛩',  color: '#c084fc', enabled: true },
  { id: 'movie', label: 'Movies', icon: '🎬', color: '#38bdf8', enabled: true },
  { id: 'game',  label: 'Games',  icon: '🎮', color: '#4ade80', enabled: true },
]

const S = 15 // icon stroke size
const ICONS = {
  book:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  anime:    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>,
  movie:    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>,
  game:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="13" r="1" fill="currentColor" stroke="none"/></svg>,
  settings: <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><circle cx="12" cy="4" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="20" r="2"/></svg>,
  grid:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  timeline: <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  search:   <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  plus:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  back:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
}

export const STATUS_LABELS = {
  completed:   'Completed',
  in_progress: 'In Progress',
  planned:     'Planned',
}

// Returns a flat list of { type: 'series', name, entries } and { type: 'solo', entry }
// preserving the order of first appearance so newest items stay at the top.
function groupEntries(entries) {
  const seriesMap = new Map()
  const result = []

  for (const entry of entries) {
    if (entry.series) {
      if (!seriesMap.has(entry.series)) {
        const item = { type: 'series', name: entry.series, entries: [] }
        seriesMap.set(entry.series, item)
        result.push(item)
      }
      seriesMap.get(entry.series).entries.push(entry)
    } else {
      result.push({ type: 'solo', entry })
    }
  }
  return result
}

export default function App() {
  const [page, setPage]           = useState('collection') // 'collection' | 'settings'
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [category, setCategory]   = useState(DEFAULT_CATEGORIES[0].id)
  const [entries, setEntries]     = useState([])
  const [seriesList, setSeriesList] = useState([])
  const [panelOpen, setPanelOpen]   = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [view, setView]             = useState('grid') // 'grid' | 'timeline'
  const [statusFilter, setStatusFilter] = useState('all')
  const [seriesFilter, setSeriesFilter] = useState(null)
  const [sidebarView, setSidebarView] = useState('categories') // 'categories' | 'series'
  const [pendingSeries, setPendingSeries] = useState('')
  const [newSeriesName, setNewSeriesName] = useState('')
  const [showNewSeriesInput, setShowNewSeriesInput] = useState(false)

  // Load saved category config from settings
  useEffect(() => {
    window.settings.get().then(s => {
      if (s.categories) setCategories(s.categories)
    })
  }, [])

  const filteredEntries = entries
    .filter(e => statusFilter === 'all' || e.status === statusFilter)
    .filter(e => !seriesFilter || e.series === seriesFilter)

  const visibleCats   = categories.filter(c => c.enabled)
  const activeCat     = visibleCats.find(c => c.id === category) ?? visibleCats[0]
  const showSeriesPanel = page === 'collection' && sidebarView === 'series'

  useEffect(() => {
    if (activeCat) {
      setSeriesFilter(null)
      setShowNewSeriesInput(false)
      setNewSeriesName('')
      window.db.getEntries(activeCat.id).then(setEntries)
      window.db.getSeries(activeCat.id).then(setSeriesList)
    }
  }, [activeCat?.id])

  function handleAdded(entry) {
    setEntries(prev => [entry, ...prev])
    window.db.getSeries(activeCat.id).then(setSeriesList)
    setPanelOpen(false)
  }

  function handleSearchAdd(entry) {
    setEntries(prev => [entry, ...prev])
    window.db.getSeries(activeCat.id).then(setSeriesList)
  }

  async function handleDelete(id) {
    await window.db.deleteEntry(id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  function handleUpdate(updated) {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    // Refresh series list — series may have been added or changed
    window.db.getSeries(activeCat.id).then(setSeriesList)
  }

  function handleEdit(entry) {
    setEditingEntry(entry)
  }

  async function handleDropEntry(entryId, seriesName) {
    const entry = entries.find(e => e.id === entryId)
    if (!entry || entry.series === seriesName) return
    const updated = await window.db.updateEntry({
      id:        entry.id,
      title:     entry.title,
      status:    entry.status,
      rating:    entry.rating,
      notes:     entry.notes,
      series:    seriesName,
      date_read: entry.date_read,
    })
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
  }

  function handleNewSeries(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    setPendingSeries(trimmed)
    setPanelOpen(true)
    setShowNewSeriesInput(false)
    setNewSeriesName('')
  }

  // Reload categories after settings change
  function handleSettingsReturn() {
    setPage('collection')
    setSidebarView('categories')
    window.settings.get().then(s => {
      if (s.categories) setCategories(s.categories)
    })
  }

  return (
    <div className="layout" style={{ '--accent': activeCat?.color }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">Chronicle</div>

        <div className="sidebar-panels">
          {/* Panel 1: Categories */}
          <div className={`sidebar-panel ${!showSeriesPanel ? 'panel-active' : 'panel-exit-left'}`}>
            <nav className="sidebar-nav">
              {page === 'collection' && visibleCats.map(cat => (
                <button
                  key={cat.id}
                  className={`nav-item ${category === cat.id ? 'active' : ''}`}
                  style={{ '--accent': cat.color }}
                  onClick={() => { setCategory(cat.id); setSidebarView('series') }}
                >
                  <span className="nav-icon">{ICONS[cat.id]}</span>
                  <span>{cat.label}</span>
                  {category === cat.id && entries.length > 0 && (
                    <span className="nav-count">{entries.length}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Panel 2: Series drill-down */}
          <div className={`sidebar-panel ${showSeriesPanel ? 'panel-active' : 'panel-enter-right'}`}>
            <button
              className="sidebar-back-btn"
              style={{ '--accent': activeCat?.color }}
              onClick={() => { setSidebarView('categories'); setSeriesFilter(null) }}
            >
              {ICONS.back}
              <span>{activeCat?.label}</span>
            </button>

            <nav className="sidebar-nav" style={{ '--accent': activeCat?.color }}>
              {showNewSeriesInput ? (
                <div className="sidebar-series-input-row" style={{ margin: '0 0 4px' }}>
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
                <button className="sidebar-new-series-btn" style={{ marginBottom: '4px' }} onClick={() => setShowNewSeriesInput(true)}>
                  + New series
                </button>
              )}
              <button
                className={`nav-item ${!seriesFilter ? 'active' : ''}`}
                style={{ '--accent': activeCat?.color }}
                onClick={() => setSeriesFilter(null)}
              >
                <span className="nav-icon">{ICONS[activeCat?.id]}</span>
                <span>All {activeCat?.label}</span>
                {entries.length > 0 && <span className="nav-count">{entries.length}</span>}
              </button>
              {seriesList.map(s => (
                <button
                  key={s}
                  className={`nav-item ${seriesFilter === s ? 'active' : ''}`}
                  style={{ '--accent': activeCat?.color }}
                  onClick={() => setSeriesFilter(prev => prev === s ? null : s)}
                >
                  <span className="nav-icon series-nav-dot-icon">◆</span>
                  <span>{s}</span>
                  <span className="nav-count">{entries.filter(e => e.series === s).length}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            style={{ '--accent': '#94a3b8' }}
            onClick={() => page === 'settings' ? handleSettingsReturn() : setPage('settings')}
          >
            <span className="nav-icon">{ICONS.settings}</span>
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      {page === 'settings' ? (
        <main className="main">
          <header className="topbar" style={{ '--accent': '#94a3b8' }}>
            <div className="topbar-title">
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
              <span className="topbar-icon">{ICONS[activeCat?.id]}</span>
              <h1>{activeCat?.label}</h1>
              <span className="topbar-count">{entries.length}</span>
            </div>
            <div className="topbar-actions">
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
              {(activeCat?.id === 'book' || activeCat?.id === 'anime') && (
                <button
                  className="add-btn add-btn--search"
                  style={{ '--accent': activeCat?.color }}
                  onClick={() => setSearchOpen(true)}
                >
                  {ICONS.search}&nbsp; Search
                </button>
              )}
              <button
                className="add-btn"
                style={{ '--accent': activeCat?.color }}
                onClick={() => setPanelOpen(true)}
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
                  <button className="add-btn" style={{ '--accent': activeCat?.color }} onClick={() => setPanelOpen(true)}>
                    Add your first
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <div className="entries-grid" style={{ display: view === 'grid' ? undefined : 'none' }}>
            {filteredEntries.length === 0 && (
              <div className="empty-state">
                <p>No {activeCat?.label.toLowerCase()} yet.</p>
                <button
                  className="add-btn"
                  style={{ '--accent': activeCat?.color }}
                  onClick={() => setPanelOpen(true)}
                >
                  Add your first
                </button>
              </div>
            )}
            {(seriesFilter ? filteredEntries.map(e => ({ type: 'solo', entry: e })) : groupEntries(filteredEntries)).map(item =>
              item.type === 'series' ? (
                <SeriesGroup
                  key={`series:${item.name}`}
                  name={item.name}
                  entries={item.entries}
                  color={activeCat?.color}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onDropEntry={handleDropEntry}
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
            onAdd={handleSearchAdd}
            onClose={() => setSearchOpen(false)}
          />

          <AddEntryPanel
            open={panelOpen}
            category={activeCat?.id}
            color={activeCat?.color}
            seriesList={seriesList}
            defaultSeries={pendingSeries}
            onClose={() => { setPanelOpen(false); setPendingSeries('') }}
            onAdded={handleAdded}
          />

          <EditEntryPanel
            entry={editingEntry}
            category={activeCat?.id}
            color={activeCat?.color}
            seriesList={seriesList}
            onClose={() => setEditingEntry(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </main>
      )}
    </div>
  )
}
