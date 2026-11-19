// Shared progress rules, used by the card/list +1, the episode grid and Up Next
// so they all agree on when an entry starts, finishes, or reopens.

export const today = () => new Date().toISOString().slice(0, 10)

// Fields every updateEntry call must carry (genres/year are preserved when omitted).
function base(entry) {
  return {
    id:        entry.id,
    title:     entry.title,
    rating:    entry.rating,
    notes:     entry.notes,
    series_id: entry.series_id,
  }
}

// Status that follows from moving to `progress` out of `total`:
// reaching the total finishes it, any progress starts a planned entry, and
// dropping below the total reopens a finished one (e.g. unticking an episode).
export function statusForProgress(status, progress, total) {
  if (total != null && total > 0 && progress >= total) return 'completed'
  if (progress > 0 && status === 'planned') return 'in_progress'
  if (status === 'completed' && total != null && progress < total) return 'in_progress'
  return status
}

// updateEntry payload moving `entry` to `next` units. `total` overrides the
// entry's own total (e.g. an episode list knows the count before the entry does).
export function progressUpdate(entry, next, { total } = {}) {
  const t = total !== undefined ? total : (entry.progress_total ?? null)
  const progress = Math.max(0, t != null ? Math.min(next, t) : next)
  const status = statusForProgress(entry.status, progress, t)
  const finishing = status === 'completed' && entry.status !== 'completed'
  return {
    ...base(entry),
    status,
    date_read: finishing && !entry.date_read ? today() : entry.date_read,
    progress,
    progress_total: t,
  }
}

export function markDoneUpdate(entry) {
  return {
    ...base(entry),
    status:    'completed',
    date_read: entry.date_read || today(),
    progress:  entry.progress_total ?? entry.progress ?? 0,
    progress_total: entry.progress_total ?? null,
  }
}

export function startUpdate(entry) {
  return { ...base(entry), status: 'in_progress', date_read: entry.date_read ?? null }
}

// SQLite's datetime('now') is UTC without a zone marker.
export function parseDbTime(s) {
  if (!s) return null
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function timeAgo(s, now = Date.now()) {
  const d = parseDbTime(s)
  if (!d) return ''
  const days = Math.floor((now - d.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7)  return `${days} days ago`
  if (days < 30) { const w = Math.floor(days / 7); return `${w} week${w === 1 ? '' : 's'} ago` }
  if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m === 1 ? '' : 's'} ago` }
  const y = Math.floor(days / 365)
  return `${y} year${y === 1 ? '' : 's'} ago`
}

export function daysSince(s, now = Date.now()) {
  const d = parseDbTime(s)
  return d ? Math.floor((now - d.getTime()) / 86400000) : Infinity
}

export function episodeLabel(ep) {
  if (!ep) return ''
  return ep.season != null ? `S${ep.season} · E${ep.number}` : `Ep ${ep.number}`
}

// "in 3 days" / "today" / "tomorrow" for an upcoming YYYY-MM-DD date.
export function untilLabel(ymd, now = new Date()) {
  if (!ymd) return ''
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const target = Date.parse(`${ymd}T00:00:00Z`)
  if (Number.isNaN(target)) return ''
  const days = Math.round((target - start) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}
