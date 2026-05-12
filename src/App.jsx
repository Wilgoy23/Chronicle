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

const S = 16 // icon stroke size
const ICONS = {
  book:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  anime:    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>,
  movie:    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>,
  game:     <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="13" r="1" fill="currentColor" stroke="none"/></svg>,
  settings: <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><circle cx="12" cy="4" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="20" r="2"/></svg>,
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

  // Load saved category config from settings
  useEffect(() => {
    window.settings.get().then(s => {
      if (s.categories) setCategories(s.categories)
    })
  }, [])

  const visibleCats = categories.filter(c => c.enabled)
  const activeCat   = visibleCats.find(c => c.id === category) ?? visibleCats[0]

  useEffect(() => {
    if (activeCat) {
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

  // Reload categories after settings change
  function handleSettingsReturn() {
    setPage('collection')
    window.settings.get().then(s => {
      if (s.categories) setCategories(s.categories)
    })
  }

  return (
    <div className="layout" style={{ '--accent': activeCat?.color }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">Chronicle</div>

        <nav className="sidebar-nav">
          {page === 'collection' && visibleCats.map(cat => (
            <button
              key={cat.id}
              className={`nav-item ${category === cat.id ? 'active' : ''}`}
              style={{ '--accent': cat.color }}
              onClick={() => setCategory(cat.id)}
            >
              <span className="nav-icon">{ICONS[cat.id]}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </nav>

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
              ← Back
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
                >⊞</button>
                <button
                  className={`view-btn ${view === 'timeline' ? 'active' : ''}`}
                  onClick={() => setView('timeline')}
                  title="Timeline view"
                >≡</button>
              </div>
              {(activeCat?.id === 'book' || activeCat?.id === 'anime') && (
                <button
                  className="add-btn add-btn--search"
                  style={{ '--accent': activeCat?.color }}
                  onClick={() => setSearchOpen(true)}
                >
                  🔍 Search
                </button>
              )}
              <button
                className="add-btn"
                style={{ '--accent': activeCat?.color }}
                onClick={() => setPanelOpen(true)}
              >
                + Add Entry
              </button>
            </div>
          </header>

          {view === 'timeline' ? (
            <div className="timeline-container">
              <TimelineView
                entries={entries}
                color={activeCat?.color}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                onEdit={handleEdit}
              />
              {entries.length === 0 && (
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
            {entries.length === 0 && (
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
            {groupEntries(entries).map(item =>
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
            onClose={() => setPanelOpen(false)}
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
