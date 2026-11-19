import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover'
import { hasEpisodeList } from './EpisodeTracker'
import { catGlyph, progressUnit } from '../App'
import { buildUpNext, isUpNextEmpty, STALLED_DAYS } from '../upNext'
import {
  progressUpdate, markDoneUpdate, startUpdate,
  timeAgo, episodeLabel, untilLabel,
} from '../progress'

const singular = (unit) => unit.replace(/s$/, '')

// The daily screen (7.3): what you're in the middle of, what comes next in
// series you've started, and new releases from franchises you follow.
export default function UpNextPage({
  categories, releases = [], version = 0, hiddenIds = [],
  onOpenEntry, onEntryChanged, onAddRelease, onDismissRelease, onImport, onBrowse,
}) {
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    let cancelled = false
    window.db.getEntries().then(rows => { if (!cancelled) setEntries(rows) })
    return () => { cancelled = true }
  }, [version])

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const enabled = useMemo(() => new Set(categories.map(c => c.id)), [categories])
  const hidden  = useMemo(() => new Set(hiddenIds), [hiddenIds])

  const upNext = useMemo(
    () => entries ? buildUpNext(entries.filter(e => !hidden.has(e.id)), releases, enabled) : null,
    [entries, releases, enabled, hidden],
  )

  function changed(updated) {
    if (!updated) return
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))
    onEntryChanged?.(updated)
  }

  if (!upNext) return <div className="upnext"><p className="upnext-loading">Loading…</p></div>

  if (isUpNextEmpty(upNext)) {
    const libraryEmpty = entries.length === 0
    return (
      <div className="upnext">
        <div className="upnext-empty">
          <h2>{libraryEmpty ? 'Welcome to Chronicle' : 'Nothing in progress'}</h2>
          <p>
            {libraryEmpty
              ? 'Bring in your history from Goodreads, StoryGraph, AniList, MyAnimeList or Letterboxd, or start adding things yourself.'
              : 'Mark something as In Progress and it shows up here, with one-click progress and what comes next.'}
          </p>
          <div className="upnext-empty-actions">
            <button className="add-btn" onClick={onImport}>Import your history…</button>
            <button className="add-btn add-btn--search" onClick={onBrowse}>Browse your library</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="upnext">
      {upNext.active.length > 0 && (
        <section className="upnext-section">
          <h2 className="upnext-heading">Continue <span className="upnext-count">{upNext.active.length}</span></h2>
          <div className="upnext-list">
            {upNext.active.map(e => (
              <ContinueRow key={e.id} entry={e} cat={catById.get(e.category)} onOpen={onOpenEntry} onChanged={changed} />
            ))}
          </div>
        </section>
      )}

      {upNext.nextInSeries.length > 0 && (
        <section className="upnext-section">
          <h2 className="upnext-heading">Next in your series</h2>
          <div className="upnext-series-grid">
            {upNext.nextInSeries.map(s => (
              <SeriesNextCard key={s.entry.id} item={s} cat={catById.get(s.entry.category)} onOpen={onOpenEntry} onChanged={changed} />
            ))}
          </div>
        </section>
      )}

      {(upNext.outNow.length > 0 || upNext.comingSoon.length > 0) && (
        <section className="upnext-section">
          <h2 className="upnext-heading">From series you follow</h2>
          <div className="upnext-list">
            {upNext.outNow.map(r => (
              <ReleaseRow key={r.id} release={r} cat={catById.get(r.category)} out onAdd={onAddRelease} onDismiss={onDismissRelease} />
            ))}
            {upNext.comingSoon.map(r => (
              <ReleaseRow key={r.id} release={r} cat={catById.get(r.category)} onAdd={onAddRelease} onDismiss={onDismissRelease} />
            ))}
          </div>
        </section>
      )}

      {upNext.stalled.length > 0 && (
        <details className="upnext-section upnext-stalled" open={upNext.active.length === 0}>
          <summary className="upnext-heading">
            On the back burner <span className="upnext-count">{upNext.stalled.length}</span>
            <span className="upnext-heading-hint">no activity in {STALLED_DAYS}+ days</span>
          </summary>
          <div className="upnext-list">
            {upNext.stalled.map(e => (
              <ContinueRow key={e.id} entry={e} cat={catById.get(e.category)} onOpen={onOpenEntry} onChanged={changed} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function CatTag({ cat }) {
  if (!cat) return null
  return (
    <span className="upnext-cat" style={{ '--accent': cat.color }}>
      <span className="upnext-cat-icon">{catGlyph(cat)}</span>{cat.label}
    </span>
  )
}

function ContinueRow({ entry, cat, onOpen, onChanged }) {
  const [episodes, setEpisodes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pageInput, setPageInput] = useState(String(entry.progress ?? 0))

  useEffect(() => { setPageInput(String(entry.progress ?? 0)) }, [entry.progress])

  useEffect(() => {
    if (!hasEpisodeList(entry)) return
    let cancelled = false
    window.api.getEpisodes(entry).then(res => {
      if (!cancelled && Array.isArray(res?.episodes)) setEpisodes(res.episodes)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [entry.id, entry.source, entry.source_id])

  const unit     = progressUnit(entry.category)
  const progress = entry.progress ?? 0
  const total    = entry.progress_total ?? (episodes?.length || null)
  const pct      = total ? Math.min(100, Math.round((progress / total) * 100)) : null
  const nextEp   = episodes ? episodes[progress] : null
  const nextUnaired = nextEp && !nextEp.aired
  const isPages  = entry.category === 'book'

  async function apply(payload) {
    setBusy(true)
    try { onChanged(await window.db.updateEntry(payload)) } finally { setBusy(false) }
  }

  const increment = () => apply(progressUpdate(
    entry, progress + 1, episodes && entry.progress_total == null ? { total: episodes.length } : {},
  ))

  function commitPage() {
    const n = parseInt(pageInput, 10)
    if (!Number.isFinite(n) || n === progress) { setPageInput(String(progress)); return }
    apply(progressUpdate(entry, n))
  }

  let episodeLine = null
  if (episodes) {
    if (progress >= episodes.length) episodeLine = 'All caught up'
    else if (nextUnaired) {
      episodeLine = nextEp.air_date
        ? `Caught up · ${episodeLabel(nextEp)} airs ${untilLabel(nextEp.air_date)}`
        : 'Caught up · next episode not scheduled yet'
    } else {
      episodeLine = `Next: ${episodeLabel(nextEp)}${nextEp.title ? ` · ${nextEp.title}` : ''}`
    }
  }

  return (
    <div className="upnext-row" style={{ '--accent': cat?.color }} onClick={() => onOpen(entry)}>
      <Cover className="upnext-cover" src={entry.cover_url} alt={entry.title} compact />
      <div className="upnext-main">
        <div className="upnext-title-line">
          <span className="upnext-title">{entry.title}</span>
        </div>
        <div className="upnext-meta">
          <CatTag cat={cat} />
          {entry.series && <span className="upnext-series">{entry.series}</span>}
          <span className="upnext-when">{timeAgo(entry.last_activity)}</span>
        </div>
        <div className="upnext-progress">
          {pct != null && (
            <div className="upnext-bar"><div className="upnext-bar-fill" style={{ width: `${pct}%` }} /></div>
          )}
          <span className="upnext-progress-text">
            {total ? `${progress} / ${total} ${unit}` : `${progress} ${unit}`}
          </span>
        </div>
        {episodeLine && <div className={`upnext-next ${nextUnaired ? 'upnext-next--wait' : ''}`}>{episodeLine}</div>}
      </div>

      <div className="upnext-actions" onClick={e => e.stopPropagation()}>
        {isPages ? (
          <label className="upnext-page">
            <span>Page</span>
            <input
              type="number"
              min={0}
              max={total ?? undefined}
              value={pageInput}
              disabled={busy}
              onChange={e => setPageInput(e.target.value)}
              onBlur={commitPage}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              aria-label={`Current page of ${entry.title}`}
            />
          </label>
        ) : (
          <button
            className="upnext-btn upnext-btn--primary"
            onClick={increment}
            disabled={busy || nextUnaired || (total != null && progress >= total)}
            title={nextUnaired ? 'The next episode hasn’t aired yet' : `Log one more ${singular(unit)}`}
          >
            +1 {singular(unit)}
          </button>
        )}
        <button className="upnext-btn" onClick={() => apply(markDoneUpdate(entry))} disabled={busy} title="Mark as finished">
          Done
        </button>
      </div>
    </div>
  )
}

function SeriesNextCard({ item, cat, onOpen, onChanged }) {
  const [busy, setBusy] = useState(false)
  const { entry } = item

  async function start(e) {
    e.stopPropagation()
    setBusy(true)
    try { onChanged(await window.db.updateEntry(startUpdate(entry))) } finally { setBusy(false) }
  }

  return (
    <div className="upnext-series-card" style={{ '--accent': cat?.color }} onClick={() => onOpen(entry)}>
      <Cover className="upnext-series-cover" src={entry.cover_url} alt={entry.title} compact />
      <div className="upnext-series-info">
        <span className="upnext-series-label">Next in {item.seriesName}</span>
        <span className="upnext-title">{entry.title}</span>
        <span className="upnext-series-count">{item.done} of {item.total} done</span>
        <button className="upnext-btn upnext-btn--primary" onClick={start} disabled={busy}>Start</button>
      </div>
    </div>
  )
}

function ReleaseRow({ release, cat, out = false, onAdd, onDismiss }) {
  const [busy, setBusy] = useState(false)
  async function act(fn) {
    setBusy(true)
    try { await fn(release) } finally { setBusy(false) }
  }
  return (
    <div className="upnext-row upnext-row--release" style={{ '--accent': cat?.color }}>
      <Cover className="upnext-cover" src={release.cover_url} alt={release.title} compact />
      <div className="upnext-main">
        <span className="upnext-title">{release.title}</span>
        <div className="upnext-meta">
          <CatTag cat={cat} />
          <span className={`upnext-release-when ${out ? 'out' : ''}`}>
            {out ? `Out ${release.release_date}` : `Out ${untilLabel(release.release_date)}`}
          </span>
          {release.origin_title && <span className="upnext-series">via {release.origin_title}</span>}
        </div>
      </div>
      <div className="upnext-actions">
        <button className="upnext-btn upnext-btn--primary" disabled={busy} onClick={() => act(onAdd)}>Add to planned</button>
        <button className="upnext-btn" disabled={busy} onClick={() => act(onDismiss)}>Dismiss</button>
      </div>
    </div>
  )
}
