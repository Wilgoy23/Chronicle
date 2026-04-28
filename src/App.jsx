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
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">ARCHIVE</div>

        <nav className="sidebar-nav">
          {page === 'collection' && visibleCats.map(cat => (
            <button
              key={cat.id}
              className={`nav-item ${category === cat.id ? 'active' : ''}`}
              style={{ '--accent': cat.color }}
              onClick={() => setCategory(cat.id)}
            >
              <span className="nav-icon">{cat.icon}</span>
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
            <span className="nav-icon">⚙</span>
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      {page === 'settings' ? (
        <main className="main">
          <header className="topbar" style={{ '--accent': '#94a3b8' }}>
            <div className="topbar-title">
              <span className="topbar-icon">⚙</span>
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
              <span className="topbar-icon">{activeCat?.icon}</span>
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
