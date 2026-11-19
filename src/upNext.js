// Pure selection logic for the Up Next page (7.3), kept out of the component
// so it can be unit-tested.

import { daysSince } from './progress'

export const STALLED_DAYS = 30
const SERIES_CAP = 8
const RELEASE_CAP = 8
const SOON_DAYS = 60

const byActivityDesc = (a, b) => (b.last_activity ?? '').localeCompare(a.last_activity ?? '')

// Reading/watching order inside a series: release year, then insertion order
// ("Add series…" inserts installments in order, so ids follow it).
const bySeriesOrder = (a, b) =>
  (a.year ?? Infinity) - (b.year ?? Infinity) || a.id - b.id

/**
 * @param entries   every library entry (getEntries() with no category)
 * @param releases  detected releases (releases:get items)
 * @param enabled   Set of enabled category ids
 * @param now       ms timestamp
 */
export function buildUpNext(entries, releases = [], enabled = null, now = Date.now()) {
  const visible = enabled ? entries.filter(e => enabled.has(e.category)) : entries

  const inProgress = visible.filter(e => e.status === 'in_progress').sort(byActivityDesc)
  const active  = inProgress.filter(e => daysSince(e.last_activity, now) <= STALLED_DAYS)
  const stalled = inProgress.filter(e => daysSince(e.last_activity, now) > STALLED_DAYS)

  // Next in series: a series you've finished something in, aren't currently
  // in the middle of, and still have planned installments for.
  const groups = new Map()
  for (const e of visible) {
    if (e.series_id == null) continue
    if (!groups.has(e.series_id)) groups.set(e.series_id, [])
    groups.get(e.series_id).push(e)
  }
  const nextInSeries = []
  for (const members of groups.values()) {
    if (members.some(m => m.status === 'in_progress')) continue
    const done = members.filter(m => m.status === 'completed')
    if (!done.length) continue
    const planned = members.filter(m => m.status === 'planned').sort(bySeriesOrder)
    if (!planned.length) continue
    const lastDone = done.map(m => m.date_read || m.last_activity || '').sort().pop()
    nextInSeries.push({
      entry: planned[0],
      seriesName: planned[0].series ?? '',
      done: done.length,
      total: members.length,
      lastDone,
    })
  }
  nextInSeries.sort((a, b) => (b.lastDone ?? '').localeCompare(a.lastDone ?? ''))

  // Releases from franchises you follow: what's out now vs. coming soon.
  const todayYmd = new Date(now).toISOString().slice(0, 10)
  const soonYmd  = new Date(now + SOON_DAYS * 86400000).toISOString().slice(0, 10)
  const relVisible = releases.filter(r => !enabled || enabled.has(r.category))
  const outNow = relVisible
    .filter(r => r.release_date && r.release_date <= todayYmd)
    .sort((a, b) => b.release_date.localeCompare(a.release_date))
    .slice(0, RELEASE_CAP)
  const comingSoon = relVisible
    .filter(r => r.release_date && r.release_date > todayYmd && r.release_date <= soonYmd)
    .sort((a, b) => a.release_date.localeCompare(b.release_date))
    .slice(0, RELEASE_CAP)

  return {
    active,
    stalled,
    nextInSeries: nextInSeries.slice(0, SERIES_CAP),
    outNow,
    comingSoon,
  }
}

export function isUpNextEmpty(u) {
  return !u.active.length && !u.stalled.length && !u.nextInSeries.length && !u.outNow.length && !u.comingSoon.length
}
