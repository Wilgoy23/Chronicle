import { useEffect, useRef, useState } from 'react'

// Every import source in one place (7.4), each with where to get the export.
// `cats` drives ordering when the dialog is opened from a category's empty state.
export const IMPORT_SOURCES = [
  {
    id: 'anilist', name: 'AniList', what: 'Anime & manga', cats: ['anime', 'manga'],
    steps: 'No file needed — enter your username. Your list must be public. Imported titles stay linked to AniList, so new seasons and episode tracking work right away.',
    username: true,
  },
  {
    id: 'goodreads', name: 'Goodreads', what: 'Books', cats: ['book'],
    steps: 'On goodreads.com open My Books → Import and export → Export Library, then choose the downloaded .csv. Series, page counts and re-reads come along.',
    run: () => window.data.importGoodreads(),
  },
  {
    id: 'storygraph', name: 'StoryGraph', what: 'Books', cats: ['book'],
    steps: 'In StoryGraph open Manage Account → Export StoryGraph Library, then choose the .csv it emails or downloads.',
    run: () => window.data.importStoryGraph(),
  },
  {
    id: 'mal', name: 'MyAnimeList', what: 'Anime & manga', cats: ['anime', 'manga'],
    steps: 'Go to myanimelist.net/panel.php?go=export, export your anime and/or manga list, then choose the .xml or .xml.gz file.',
    run: () => window.data.importMal(),
  },
  {
    id: 'letterboxd', name: 'Letterboxd', what: 'Movies', cats: ['movie'],
    steps: 'On letterboxd.com open Settings → Data → Export your data and unzip it. Choose diary.csv, and add ratings.csv, watched.csv or watchlist.csv too if you want them (you can pick several at once).',
    run: () => window.data.importLetterboxd(),
  },
  {
    id: 'json', name: 'Chronicle backup', what: 'Everything', cats: [],
    steps: 'A JSON file from Settings → Data → Export JSON, e.g. from another computer.',
    run: () => window.data.importJson(),
  },
]

export function importSummary(res) {
  return `Imported ${res.imported} ${res.imported === 1 ? 'entry' : 'entries'}`
    + (res.skipped ? `, skipped ${res.skipped} already in your library` : '')
    + (res.logsImported ? `, ${res.logsImported} re-watch/re-read log${res.logsImported === 1 ? '' : 's'}` : '')
    + '.'
}

export default function ImportDialog({ open, highlight = null, onClose }) {
  const [busy, setBusy]       = useState(null)
  const [msg, setMsg]         = useState(null) // { ok, text }
  const [username, setUsername] = useState('')
  const reloadTimer = useRef(null)

  useEffect(() => {
    if (open) { setBusy(null); setMsg(null) }
    return () => clearTimeout(reloadTimer.current)
  }, [open])

  if (!open) return null

  const sources = highlight
    ? [...IMPORT_SOURCES].sort((a, b) => Number(b.cats.includes(highlight)) - Number(a.cats.includes(highlight)))
    : IMPORT_SOURCES

  async function run(source) {
    if (busy) return
    if (source.username && !username.trim()) { setMsg({ ok: false, text: 'Enter your AniList username first.' }); return }
    setBusy(source.id)
    setMsg(null)
    try {
      const res = source.username
        ? await window.data.importAniList(username.trim())
        : await source.run()
      if (res?.canceled) { setBusy(null); return }
      if (!res?.ok) { setMsg({ ok: false, text: res?.error || 'Something went wrong.' }); setBusy(null); return }
      if (res.imported > 0) {
        setMsg({ ok: true, text: `${importSummary(res)} Reloading…` })
        // Same as Settings' import: reload so every view picks up the new entries.
        reloadTimer.current = setTimeout(() => window.location.reload(), 1400)
        return
      }
      setMsg({ ok: true, text: importSummary(res) })
    } catch (err) {
      setMsg({ ok: false, text: String(err?.message ?? err) })
    }
    setBusy(null)
  }

  return (
    <div className="search-modal-backdrop" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="search-modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" style={{ '--accent': '#94a3b8' }}>
        <div className="search-modal-header">
          <h2 id="import-title" className="import-title">Import your history</h2>
          <button className="panel-close" onClick={onClose} disabled={!!busy} aria-label="Close">✕</button>
        </div>

        <div className="import-body">
          <p className="import-intro">
            Imports merge into your library. Anything you already have is skipped, so it’s safe to run one again later.
          </p>

          <ul className="import-list">
            {sources.map(s => (
              <li key={s.id} className={`import-item ${highlight && s.cats.includes(highlight) ? 'import-item--match' : ''}`}>
                <div className="import-item-head">
                  <span className="import-item-name">{s.name}</span>
                  <span className="import-item-what">{s.what}</span>
                </div>
                <p className="import-item-steps">{s.steps}</p>
                <div className="import-item-actions">
                  {s.username && (
                    <input
                      className="setting-input import-username"
                      placeholder="AniList username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') run(s) }}
                      disabled={!!busy}
                      spellCheck={false}
                      aria-label="AniList username"
                    />
                  )}
                  <button className="data-action-btn" disabled={!!busy} onClick={() => run(s)}>
                    {busy === s.id ? 'Importing…' : s.username ? 'Import' : 'Choose file…'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {msg && (
          <div className="import-footer">
            <span className={`setting-status ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}
