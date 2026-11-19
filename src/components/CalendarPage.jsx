import { useEffect, useMemo, useRef, useState } from 'react'
import Cover from './Cover'
import { ICONS, catGlyph } from '../App'
import {
  localYmd, parseYmd, weekStartDay, monthGrid, gridRange, shiftMonth, weekdayLabels, groupByDate,
} from '../calendarGrid'

// Release calendar (8.2): franchise releases and episode air dates for what
// you're watching, as a month grid with a day agenda, plus .ics export.

const CHIPS_PER_DAY = 3

export default function CalendarPage({ categories, version = 0, onOpenEntry, onAddRelease, onDismissRelease }) {
  const locale = navigator.language
  const weekStart = useMemo(() => weekStartDay(locale), [locale])
  const today = localYmd()
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [events, setEvents] = useState(null)
  const [loadingEpisodes, setLoadingEpisodes] = useState(false)
  const [selected, setSelected] = useState(today)
  const [hiddenCats, setHiddenCats] = useState(() => new Set())
  const [kinds, setKinds] = useState({ release: true, episode: true })
  const [syncOpen, setSyncOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const seq = useRef(0)

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month, weekStart), [cursor, weekStart])
  const range = useMemo(() => gridRange(weeks), [weeks])

  // Releases come straight from the database; episode schedules may need the
  // network the first time, so they arrive in a second pass.
  useEffect(() => {
    const id = ++seq.current
    window.calendar.get(range.from, range.to, { episodes: false }).then(evs => {
      if (id === seq.current) setEvents(prev => prev ?? evs)
    })
    setLoadingEpisodes(true)
    window.calendar.get(range.from, range.to).then(evs => {
      if (id !== seq.current) return
      setEvents(evs)
      setLoadingEpisodes(false)
    }).catch(() => { if (id === seq.current) setLoadingEpisodes(false) })
  }, [range.from, range.to, version, reload])

  // A new month starts from a clean slate rather than flashing the old one.
  function go(next) {
    setEvents(null)
    setCursor(next)
    const monthStart = `${next.year}-${String(next.month + 1).padStart(2, '0')}-01`
    setSelected(today.slice(0, 7) === monthStart.slice(0, 7) ? today : monthStart)
  }

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const enabled = useMemo(() => new Set(categories.map(c => c.id)), [categories])

  const visible = (events ?? []).filter(ev =>
    enabled.has(ev.category) && !hiddenCats.has(ev.category) && kinds[ev.kind])
  const byDate = useMemo(() => groupByDate(visible), [visible])
  const presentCats = categories.filter(c => (events ?? []).some(ev => ev.category === c.id))

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const dayLabels = weekdayLabels(weekStart, locale)
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
  const monthCount = visible.filter(ev => ev.date.startsWith(monthPrefix)).length

  const selectedEvents = byDate.get(selected) ?? []
  // With nothing on the selected day, the agenda falls back to what's next this month.
  const upcoming = selectedEvents.length ? [] : visible
    .filter(ev => ev.date >= (selected > today ? selected : today) && ev.date.startsWith(monthPrefix))
    .slice(0, 8)

  function toggleCat(id) {
    setHiddenCats(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function addRelease(ev) {
    await onAddRelease({
      id: ev.release_id, category: ev.category, title: ev.title,
      cover_url: ev.cover_url, source: ev.source, source_id: ev.source_id,
    })
    setReload(n => n + 1)
  }

  async function dismissRelease(ev) {
    await onDismissRelease({ id: ev.release_id })
    setEvents(prev => prev.filter(e => e.uid !== ev.uid))
  }

  return (
    <div className="cal">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="upnext-btn" onClick={() => go(shiftMonth(cursor, -1))} aria-label="Previous month">‹</button>
          <h2 className="cal-month">{monthLabel}</h2>
          <button className="upnext-btn" onClick={() => go(shiftMonth(cursor, 1))} aria-label="Next month">›</button>
          <button
            className="upnext-btn"
            onClick={() => { const d = new Date(); go({ year: d.getFullYear(), month: d.getMonth() }) }}
          >Today</button>
          {loadingEpisodes && <span className="cal-loading">Checking episode schedules…</span>}
        </div>
        <button className="upnext-btn upnext-btn--primary" onClick={() => setSyncOpen(true)}>
          {ICONS.calendar}&nbsp;Add to your calendar
        </button>
      </div>

      <div className="cal-filters">
        <button className={`filter-chip ${kinds.release ? 'active' : ''}`} aria-pressed={kinds.release}
          onClick={() => setKinds(k => ({ ...k, release: !k.release }))}>Releases</button>
        <button className={`filter-chip ${kinds.episode ? 'active' : ''}`} aria-pressed={kinds.episode}
          onClick={() => setKinds(k => ({ ...k, episode: !k.episode }))}>Episodes</button>
        {presentCats.length > 1 && <span className="cal-filter-sep" />}
        {presentCats.length > 1 && presentCats.map(c => (
          <button key={c.id} className={`filter-chip ${hiddenCats.has(c.id) ? '' : 'active'}`}
            aria-pressed={!hiddenCats.has(c.id)} onClick={() => toggleCat(c.id)}>
            <span className="filter-dot" style={{ background: c.color }} />{c.label}
          </button>
        ))}
      </div>

      <div className="cal-body">
        <div className="cal-grid" role="grid" aria-label={monthLabel}>
          <div className="cal-row cal-row--head" role="row">
            {dayLabels.map(d => <span key={d} className="cal-dow" role="columnheader">{d}</span>)}
          </div>
          {weeks.map(week => (
            <div className="cal-row" role="row" key={week[0].ymd}>
              {week.map(day => {
                const evs = byDate.get(day.ymd) ?? []
                return (
                  <div
                    key={day.ymd}
                    role="gridcell"
                    tabIndex={0}
                    aria-selected={selected === day.ymd}
                    aria-label={`${parseYmd(day.ymd).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}, ${evs.length} event${evs.length === 1 ? '' : 's'}`}
                    className={[
                      'cal-day',
                      day.inMonth ? '' : 'cal-day--out',
                      day.ymd === today ? 'cal-day--today' : '',
                      selected === day.ymd ? 'cal-day--selected' : '',
                    ].join(' ')}
                    onClick={() => setSelected(day.ymd)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(day.ymd) } }}
                  >
                    <span className="cal-day-num">{day.day}</span>
                    <div className="cal-chips">
                      {evs.slice(0, CHIPS_PER_DAY).map(ev => (
                        <span
                          key={ev.uid}
                          className={`cal-chip cal-chip--${ev.kind}`}
                          style={{ '--accent': catById.get(ev.category)?.color }}
                          title={`${ev.title}${ev.detail ? ` · ${ev.detail}` : ''}`}
                        >
                          {ev.title}
                          {ev.kind === 'episode' && <span className="cal-chip-code"> {ev.detail.split(' · ')[0]}</span>}
                        </span>
                      ))}
                      {evs.length > CHIPS_PER_DAY && (
                        <span className="cal-more">+{evs.length - CHIPS_PER_DAY} more</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <aside className="cal-agenda" aria-live="polite">
          <h3 className="cal-agenda-day">
            {parseYmd(selected).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {events == null ? (
            <p className="upnext-loading">Loading…</p>
          ) : selectedEvents.length ? (
            <div className="cal-agenda-list">
              {selectedEvents.map(ev => (
                <AgendaRow key={ev.uid} ev={ev} cat={catById.get(ev.category)}
                  onOpenEntry={onOpenEntry} onAdd={addRelease} onDismiss={dismissRelease} />
              ))}
            </div>
          ) : (
            <>
              <p className="cal-agenda-none">Nothing on this day.</p>
              {upcoming.length > 0 ? (
                <>
                  <h3 className="cal-agenda-sub">Coming up</h3>
                  <div className="cal-agenda-list">
                    {upcoming.map(ev => (
                      <AgendaRow key={ev.uid} ev={ev} cat={catById.get(ev.category)} showDate
                        onOpenEntry={onOpenEntry} onAdd={addRelease} onDismiss={dismissRelease} />
                    ))}
                  </div>
                </>
              ) : monthCount === 0 && !loadingEpisodes ? (
                <p className="cal-agenda-hint">
                  Nothing scheduled this month. New seasons, sequels and next books show up once
                  Chronicle finds them for things in your library, and air dates come from TV and
                  anime you're watching or planning to watch.
                </p>
              ) : null}
            </>
          )}
        </aside>
      </div>

      <CalendarSyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  )
}

function AgendaRow({ ev, cat, showDate = false, onOpenEntry, onAdd, onDismiss }) {
  const [busy, setBusy] = useState(false)
  const inLibrary = ev.entry_id != null
  const canOpen = inLibrary

  async function act(fn) {
    setBusy(true)
    try { await fn(ev) } finally { setBusy(false) }
  }

  function open() {
    if (!canOpen) return
    window.db.getEntries(ev.category).then(rows => {
      const entry = rows.find(r => r.id === ev.entry_id)
      if (entry) onOpenEntry(entry)
    })
  }

  return (
    <div
      className={`cal-agenda-row ${canOpen ? 'cal-agenda-row--link' : ''}`}
      style={{ '--accent': cat?.color }}
      onClick={open}
    >
      <Cover className="cal-agenda-cover" src={ev.cover_url} alt={ev.title} compact />
      <div className="upnext-main">
        <span className="upnext-title">{ev.title}</span>
        {ev.detail && <span className="cal-agenda-detail">{ev.detail}</span>}
        <span className="upnext-meta">
          {cat && <span className="upnext-cat"><span className="upnext-cat-icon">{catGlyph(cat)}</span>{cat.label}</span>}
          <span>{ev.kind === 'release' ? (inLibrary ? 'Release · in your library' : 'New release') : 'Airs'}</span>
          {showDate && <span>{parseYmd(ev.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
        </span>
        {ev.kind === 'release' && !inLibrary && (
          <div className="cal-agenda-actions" onClick={e => e.stopPropagation()}>
            <button className="upnext-btn upnext-btn--primary" disabled={busy} onClick={() => act(onAdd)}>Add to planned</button>
            <button className="upnext-btn" disabled={busy} onClick={() => act(onDismiss)}>Dismiss</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── .ics export / kept-updated file ──────────────────────────────

function CalendarSyncDialog({ open, onClose }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (!open) return
    setMsg(null)
    window.calendar.syncStatus().then(setStatus)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, busy, onClose])

  if (!open) return null

  async function run(action, fn) {
    setBusy(action)
    setMsg(null)
    try {
      const res = await fn()
      if (res?.canceled) return
      if (res && 'path' in res) setStatus({ path: res.path ?? null, lastSynced: res.lastSynced ?? null, lastError: res.lastError ?? null })
      if (res?.ok === false) setMsg({ ok: false, text: res.error || 'Something went wrong.' })
      else if (action === 'export') setMsg({ ok: true, text: `Saved ${res.count} event${res.count === 1 ? '' : 's'}.` })
      else if (action === 'start' || action === 'now') setMsg({ ok: true, text: `Wrote ${res.count} event${res.count === 1 ? '' : 's'}.` })
      else if (action === 'stop') setMsg({ ok: true, text: 'Stopped updating the file. The file itself was left in place.' })
    } catch {
      setMsg({ ok: false, text: 'Something went wrong.' })
    } finally {
      setBusy(null)
    }
  }

  const syncing = !!status?.path

  return (
    <div className="search-modal-backdrop" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="search-modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="cal-sync-title" style={{ '--accent': '#94a3b8' }}>
        <div className="search-modal-header">
          <h2 id="cal-sync-title" className="import-title">Add to your calendar</h2>
          <button className="panel-close" onClick={onClose} disabled={!!busy} aria-label="Close">✕</button>
        </div>
        <div className="import-body">
          <p className="import-intro">
            Chronicle writes an .ics file with releases and episode air dates from a month back to a
            year ahead. Calendar apps can import it once, or subscribe to it and pick up changes.
          </p>
          <ul className="import-list">
            <li className="import-item">
              <div className="import-item-head">
                <span className="import-item-name">Keep a file updated</span>
                <span className="import-item-what">for subscribing</span>
              </div>
              <p className="import-item-steps">
                Chronicle rewrites the file each time it opens and after every release check. Put it
                in a Dropbox, OneDrive or iCloud Drive folder, then subscribe to its public share link
                (Google Calendar: Other calendars → From URL; Apple Calendar: File → New Calendar
                Subscription; Outlook: Add calendar → Subscribe from web).
              </p>
              {syncing && (
                <p className="cal-sync-path">
                  <span className="cal-sync-file" title={status.path}>{status.path}</span>
                  <span className="cal-sync-when">
                    {status.lastError
                      ? `Last write failed: ${status.lastError}`
                      : status.lastSynced ? `Updated ${new Date(status.lastSynced).toLocaleString()}` : 'Not written yet'}
                  </span>
                </p>
              )}
              <div className="import-item-actions">
                {syncing ? (
                  <>
                    <button className="data-action-btn" disabled={!!busy} onClick={() => run('now', () => window.calendar.syncNow())}>
                      {busy === 'now' ? 'Updating…' : 'Update now'}
                    </button>
                    <button className="data-action-btn" disabled={!!busy} onClick={() => run('start', () => window.calendar.startSync())}>Move file…</button>
                    <button className="data-action-btn" disabled={!!busy} onClick={() => run('stop', () => window.calendar.stopSync())}>Stop updating</button>
                  </>
                ) : (
                  <button className="data-action-btn" disabled={!!busy} onClick={() => run('start', () => window.calendar.startSync())}>
                    {busy === 'start' ? 'Writing…' : 'Choose file location…'}
                  </button>
                )}
              </div>
            </li>
            <li className="import-item">
              <div className="import-item-head">
                <span className="import-item-name">Save a copy</span>
                <span className="import-item-what">one-off import</span>
              </div>
              <p className="import-item-steps">
                A snapshot to import by hand. It won't change when new dates are found.
              </p>
              <div className="import-item-actions">
                <button className="data-action-btn" disabled={!!busy} onClick={() => run('export', () => window.calendar.exportIcs())}>
                  {busy === 'export' ? 'Saving…' : 'Save .ics file…'}
                </button>
              </div>
            </li>
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
