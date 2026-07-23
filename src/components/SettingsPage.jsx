import { useEffect, useState } from 'react'

const SECTIONS = [
  { id: 'api',           label: 'API Keys',      icon: '🔑' },
  { id: 'categories',    label: 'Categories',    icon: '📂' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'data',          label: 'Data',          icon: '🗄' },
]

const NOTIF_CATEGORIES = [
  { id: 'book',  label: 'Books' },
  { id: 'anime', label: 'Anime' },
  { id: 'movie', label: 'Movies' },
  { id: 'game',  label: 'Games' },
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

        {section === 'api'           && <ApiSection           settings={settings} onSave={save} />}
        {section === 'categories'    && <CategoriesSection    settings={settings} onSave={save} />}
        {section === 'notifications' && <NotificationsSection settings={settings} onSave={save} />}
        {section === 'data'          && <DataSection />}
      </div>
    </div>
  )
}

// ── API Keys ───────────────────────────────────────
function ApiKeyField({ label, hint, value, onSave, settingKey }) {
  const [val, setVal] = useState(value ?? '')
  const [show, setShow] = useState(false)
  return (
    <div className="setting-row">
      <div className="setting-info">
        <label>{label}</label>
        <span className="setting-hint">{hint}</span>
      </div>
      <div className="token-input-wrap">
        <input
          type={show ? 'text' : 'password'}
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="Paste key…"
          className="setting-input"
          spellCheck={false}
        />
        <button className="icon-btn" onClick={() => setShow(s => !s)} title="Toggle visibility">
          {show ? '🙈' : '👁'}
        </button>
        <button className="save-field-btn" onClick={() => onSave({ [settingKey]: val.trim() })}>
          Save
        </button>
      </div>
      {value && <span className="setting-status ok">✓ Saved</span>}
    </div>
  )
}

function ApiSection({ settings, onSave }) {
  return (
    <section className="settings-section">
      <h2>API Keys</h2>
      <p className="settings-desc">
        Keys are stored locally and only sent to the respective API.
      </p>
      <ApiKeyField
        label="Hardcover Token"
        hint="hardcover.app → Settings → API"
        value={settings.hardcoverToken}
        settingKey="hardcoverToken"
        onSave={patch => onSave({ hardcoverToken: patch.hardcoverToken?.replace(/^Bearer\s+/i, '') })}
      />
      <ApiKeyField
        label="TMDB API Key"
        hint="themoviedb.org → Settings → API → API Key (v3 auth)"
        value={settings.tmdbKey}
        settingKey="tmdbKey"
        onSave={onSave}
      />
      <ApiKeyField
        label="RAWG API Key"
        hint="rawg.io → API Key (free account required)"
        value={settings.rawgKey}
        settingKey="rawgKey"
        onSave={onSave}
      />
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

// ── Notifications ──────────────────────────────────
function NotificationsSection({ settings, onSave }) {
  const notif = settings.notifications ?? {}
  const enabled = notif.enabled !== false
  const cats = notif.categories ?? { book: true, anime: true, movie: true, game: true }
  const [checking, setChecking] = useState(false)
  const [result, setResult]     = useState(null)

  function patchNotif(patch) {
    onSave({ notifications: { ...notif, enabled, categories: cats, ...patch } })
  }

  function toggleEnabled() {
    patchNotif({ enabled: !enabled })
  }

  function toggleCat(id) {
    patchNotif({ categories: { ...cats, [id]: cats[id] === false } })
  }

  async function checkNow() {
    setChecking(true)
    setResult(null)
    try {
      const fresh = await window.releases.checkNow()
      const n = Array.isArray(fresh) ? fresh.length : 0
      setResult(n === 0 ? 'No new releases found.' : `Found ${n} new release${n === 1 ? '' : 's'}.`)
    } catch {
      setResult('Check failed — see console.')
    }
    setChecking(false)
  }

  const lastCheck = notif.lastCheck ? new Date(notif.lastCheck).toLocaleString() : 'Never'

  return (
    <section className="settings-section">
      <h2>Notifications</h2>
      <p className="settings-desc">
        Chronicle checks series in your library for sequels and new installments,
        about once a day when the app opens.
      </p>

      <div className="setting-row">
        <div className="setting-info">
          <label>Release notifications</label>
          <span className="setting-hint">Detect and notify about new releases.</span>
        </div>
        <label className="cat-toggle">
          <input type="checkbox" checked={enabled} onChange={toggleEnabled} />
          <span className="cat-label"><span>{enabled ? 'On' : 'Off'}</span></span>
        </label>
      </div>

      {enabled && (
        <>
          <div className="cat-list" style={{ marginTop: '0.75rem' }}>
            {NOTIF_CATEGORIES.map(c => (
              <div key={c.id} className="cat-row">
                <label className="cat-toggle">
                  <input
                    type="checkbox"
                    checked={cats[c.id] !== false}
                    onChange={() => toggleCat(c.id)}
                  />
                  <span className="cat-label"><span>{c.label}</span></span>
                </label>
              </div>
            ))}
          </div>

          <div className="setting-row" style={{ marginTop: '1rem' }}>
            <div className="setting-info">
              <label>Last checked</label>
              <span className="setting-hint">{lastCheck}</span>
            </div>
            <button className="save-field-btn" onClick={checkNow} disabled={checking}>
              {checking ? 'Checking…' : 'Check now'}
            </button>
          </div>
          {result && <span className="setting-status ok">{result}</span>}
        </>
      )}
    </section>
  )
}

// ── Data ───────────────────────────────────────────
const EXPORT_MSG = {
  json:    res => `Exported ${res.count} entries to JSON.`,
  csv:     res => `Exported ${res.count} entries to CSV.`,
  backup:  ()  => 'Backup saved.',
  restore: ()  => 'Library restored.',
  import:  res => `Imported ${res.imported} ${res.imported === 1 ? 'entry' : 'entries'}`
    + (res.skipped ? `, skipped ${res.skipped} duplicate${res.skipped === 1 ? '' : 's'}` : '')
    + '. Reloading…',
}

function DataSection() {
  const [stats, setStats]   = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy]     = useState(null)   // action id currently running
  const [msg, setMsg]       = useState(null)   // { ok, text } feedback

  useEffect(() => {
    window.db.getEntries().then(entries => {
      const counts = {}
      entries.forEach(e => { counts[e.category] = (counts[e.category] ?? 0) + 1 })
      setStats({ total: entries.length, counts })
    })
  }, [])

  async function run(action, fn) {
    setBusy(action)
    setMsg(null)
    try {
      const res = await fn()
      if (res?.ok) {
        setMsg({ ok: true, text: (EXPORT_MSG[action] ?? (() => 'Done.'))(res) })
        // Import mutates the library — reload so the grid/insights pick it up.
        if (action === 'import' && res.imported > 0) {
          setTimeout(() => window.location.reload(), 1400)
          return
        }
      }
      else if (res?.canceled) setMsg(null)
      else                    setMsg({ ok: false, text: res?.error || 'Something went wrong.' })
    } catch {
      setMsg({ ok: false, text: 'Something went wrong.' })
    }
    setBusy(null)
  }

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

      <div className="data-actions">
        <h3>Export &amp; backup</h3>
        <p className="settings-desc">
          JSON is a full snapshot (entries + series); CSV is a spreadsheet of entries;
          a database backup can be restored later to replace your library.
          Importing a JSON export merges its entries in, skipping ones you already have.
        </p>
        <div className="data-btn-row">
          <button className="data-action-btn" disabled={!!busy} onClick={() => run('json',    () => window.data.exportJson())}>Export JSON</button>
          <button className="data-action-btn" disabled={!!busy} onClick={() => run('csv',     () => window.data.exportCsv())}>Export CSV</button>
          <button className="data-action-btn" disabled={!!busy} onClick={() => run('import',  () => window.data.importJson())}>Import JSON…</button>
          <button className="data-action-btn" disabled={!!busy} onClick={() => run('backup',  () => window.data.backup())}>Back up database</button>
          <button className="data-action-btn" disabled={!!busy} onClick={() => run('restore', () => window.data.restore())}>Restore from backup…</button>
        </div>
        {msg && <span className={`setting-status ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
      </div>

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
