import { useEffect, useState } from 'react'

const SECTIONS = [
  { id: 'api',        label: 'API Keys',    icon: '🔑' },
  { id: 'categories', label: 'Categories',  icon: '📂' },
  { id: 'data',       label: 'Data',        icon: '🗄' },
]

export default function SettingsPage() {
  const [section, setSection]   = useState('api')
  const [settings, setSettings] = useState(null)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    window.settings.get().then(setSettings)
  }, [])

  async function save(patch) {
    const next = await window.settings.set(patch)
    setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) return <div className="settings-loading">Loading…</div>

  return (
    <div className="settings-layout">
      {/* Section nav */}
      <nav className="settings-nav">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`settings-nav-item ${section === s.id ? 'active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="settings-content">
        {saved && <div className="settings-toast">✓ Saved</div>}

        {section === 'api'        && <ApiSection        settings={settings} onSave={save} />}
        {section === 'categories' && <CategoriesSection settings={settings} onSave={save} />}
        {section === 'data'       && <DataSection />}
      </div>
    </div>
  )
}

// ── API Keys ───────────────────────────────────────
function ApiSection({ settings, onSave }) {
  const [token, setToken] = useState(settings.hardcoverToken ?? '')
  const [show, setShow]   = useState(false)

  return (
    <section className="settings-section">
      <h2>API Keys</h2>
      <p className="settings-desc">
        Keys are stored locally on your machine and never sent anywhere except the respective API.
      </p>

      <div className="setting-row">
        <div className="setting-info">
          <label>Hardcover Token</label>
          <span className="setting-hint">
            Get yours at <strong>hardcover.app → Settings → API</strong>
          </span>
        </div>
        <div className="token-input-wrap">
          <input
            type={show ? 'text' : 'password'}
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste token…"
            className="setting-input"
            spellCheck={false}
          />
          <button className="icon-btn" onClick={() => setShow(s => !s)} title="Toggle visibility">
            {show ? '🙈' : '👁'}
          </button>
          <button
            className="save-field-btn"
            onClick={() => onSave({ hardcoverToken: token.trim().replace(/^Bearer\s+/i, '') })}
          >
            Save
          </button>
        </div>
        {settings.hardcoverToken && (
          <span className="setting-status ok">✓ Token saved</span>
        )}
      </div>
    </section>
  )
}

// ── Categories ─────────────────────────────────────
function CategoriesSection({ settings, onSave }) {
  const DEFAULT_CATEGORIES = [
    { id: 'book',  label: 'Books',  icon: '📖', color: '#e8a838', enabled: true },
    { id: 'anime', label: 'Anime',  icon: '⛩',  color: '#c084fc', enabled: true },
    { id: 'movie', label: 'Movies', icon: '🎬', color: '#38bdf8', enabled: true },
    { id: 'game',  label: 'Games',  icon: '🎮', color: '#4ade80', enabled: true },
  ]

  const saved = settings.categories ?? DEFAULT_CATEGORIES
  const [cats, setCats] = useState(saved)

  function toggle(id) {
    setCats(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c))
  }

  function setColor(id, color) {
    setCats(prev => prev.map(c => c.id === id ? { ...c, color } : c))
  }

  return (
    <section className="settings-section">
      <h2>Categories</h2>
      <p className="settings-desc">Show or hide categories in the sidebar.</p>

      <div className="cat-list">
        {cats.map(cat => (
          <div key={cat.id} className="cat-row">
            <label className="cat-toggle">
              <input
                type="checkbox"
                checked={cat.enabled}
                onChange={() => toggle(cat.id)}
              />
              <span className="cat-label">
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </span>
            </label>
            <div className="cat-color-wrap">
              <span className="cat-color-label">Color</span>
              <input
                type="color"
                value={cat.color}
                onChange={e => setColor(cat.id, e.target.value)}
                className="color-swatch"
                title={`${cat.label} accent color`}
              />
            </div>
          </div>
        ))}
      </div>

      <button className="submit-btn" style={{ marginTop: '1rem', maxWidth: 160 }}
        onClick={() => onSave({ categories: cats })}>
        Save Changes
      </button>
    </section>
  )
}

// ── Data ───────────────────────────────────────────
function DataSection() {
  const [stats, setStats]   = useState(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    window.db.getEntries().then(entries => {
      const counts = {}
      entries.forEach(e => { counts[e.category] = (counts[e.category] ?? 0) + 1 })
      setStats({ total: entries.length, counts })
    })
  }, [])

  async function handleClear() {
    if (!confirm) { setConfirm(true); return }
    // Clear all — re-use deleteEntry per entry to avoid needing a new IPC call
    const entries = await window.db.getEntries()
    await Promise.all(entries.map(e => window.db.deleteEntry(e.id)))
    setStats({ total: 0, counts: {} })
    setConfirm(false)
  }

  return (
    <section className="settings-section">
      <h2>Data</h2>
      <p className="settings-desc">Your data is stored locally in a SQLite database.</p>

      {stats && (
        <div className="data-stats">
          <div className="stat-card">
            <span className="stat-num">{stats.total}</span>
            <span className="stat-label">Total entries</span>
          </div>
          {Object.entries(stats.counts).map(([cat, n]) => (
            <div key={cat} className="stat-card">
              <span className="stat-num">{n}</span>
              <span className="stat-label">{cat}s</span>
            </div>
          ))}
        </div>
      )}

      <div className="danger-zone">
        <h3>Danger Zone</h3>
        <p>Permanently delete all entries. This cannot be undone.</p>
        <button className="danger-btn" onClick={handleClear}>
          {confirm ? '⚠ Click again to confirm' : 'Clear all entries'}
        </button>
        {confirm && (
          <button className="cancel-btn" onClick={() => setConfirm(false)}>Cancel</button>
        )}
      </div>
    </section>
  )
}
