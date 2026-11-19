import { describe, it, expect } from 'vitest'
import {
  collectCalendar, releaseEvents, episodeEvents, episodeCandidates,
  toIcs, icsEscape, foldLine, icsWindow, addDays,
} from '../../electron/calendar.js'

const release = (over = {}) => ({
  id: 1, category: 'anime', source: 'anilist', source_id: '200', origin_title: 'Frieren',
  title: 'Frieren Season 2', cover_url: 'c.jpg', release_date: '2026-01-16',
  relation: 'New season / sequel', status: 'new', entry_id: null, ...over,
})

const show = (over = {}) => ({
  id: 7, category: 'tv', source: 'tvmaze', source_id: '82', title: 'Severance',
  status: 'in_progress', cover_url: 's.jpg', last_activity: '2026-11-01 10:00:00', ...over,
})

describe('releaseEvents', () => {
  it('maps dated releases inside the range', () => {
    const events = releaseEvents([
      release(),
      release({ id: 2, source_id: '201', release_date: '2027-05-01' }),
    ], '2026-01-01', '2026-12-31')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      uid: 'release-anilist-200', kind: 'release', date: '2026-01-16',
      title: 'Frieren Season 2', detail: 'New season / sequel · via Frieren', release_id: 1,
    })
  })

  it('keeps the library link for releases already added', () => {
    const [ev] = releaseEvents([release({ status: 'added', entry_id: 42 })], null, null)
    expect(ev).toMatchObject({ status: 'added', entry_id: 42 })
  })
})

describe('episodeEvents', () => {
  const eps = [
    { season: 2, number: 1, title: 'Hello, Ms. Cobel', air_date: '2026-01-17' },
    { season: 2, number: 2, title: 'Goodbye', air_date: '2026-01-24' },
    { season: 2, number: 3, title: null, air_date: '2026-03-01' },
    { season: 2, number: 4, title: null, air_date: null },
  ]

  it('creates one event per air date with an episode label', () => {
    const events = episodeEvents(show(), { episodes: eps }, '2026-01-01', '2026-01-31')
    expect(events.map(e => [e.date, e.detail])).toEqual([
      ['2026-01-17', 'S2E1 · Hello, Ms. Cobel'],
      ['2026-01-24', 'S2E2 · Goodbye'],
    ])
    expect(events[0]).toMatchObject({ uid: 'episode-tvmaze-82-2026-01-17', entry_id: 7, kind: 'episode' })
  })

  it('collapses a same-day season drop into one event', () => {
    const drop = [1, 2, 3, 4].map(n => ({ season: 1, number: n, title: `Ep ${n}`, air_date: '2026-02-01' }))
    const [ev] = episodeEvents(show(), { episodes: drop }, null, null)
    expect(ev).toMatchObject({ detail: 'S1E1–E4', count: 4 })
  })

  it('labels season-less (AniList) episodes by number', () => {
    const [ev] = episodeEvents(show({ category: 'anime', source: 'anilist' }),
      { episodes: [{ season: null, number: 9, title: null, air_date: '2026-01-10' }] }, null, null)
    expect(ev.detail).toBe('Episode 9')
  })

  it('ignores error results', () => {
    expect(episodeEvents(show(), { error: 'UNSUPPORTED' }, null, null)).toEqual([])
    expect(episodeEvents(show(), null, null, null)).toEqual([])
  })
})

describe('episodeCandidates', () => {
  it('takes watching before planned, skipping finished and unsupported entries', () => {
    const list = episodeCandidates([
      show({ id: 1, status: 'planned', last_activity: '2026-11-05' }),
      show({ id: 2, status: 'in_progress', last_activity: '2026-10-01' }),
      show({ id: 3, status: 'completed' }),
      show({ id: 4, category: 'movie', source: 'tmdb' }),
      show({ id: 5, source_id: null }),
      show({ id: 6, status: 'in_progress', last_activity: '2026-11-09' }),
    ])
    expect(list.map(e => e.id)).toEqual([6, 2, 1])
  })

  it('caps the number of shows', () => {
    const many = Array.from({ length: 10 }, (_, i) => show({ id: i, source_id: String(i) }))
    expect(episodeCandidates(many, 3)).toHaveLength(3)
  })
})

describe('collectCalendar', () => {
  const deps = (over = {}) => ({
    getCalendarReleases: () => [release({ release_date: '2026-01-17' })],
    getEntries: () => [show()],
    cacheGet: () => null,
    cacheSet: () => {},
    settings: {},
    getEpisodes: async () => ({ episodes: [{ season: 2, number: 1, title: null, air_date: '2026-01-17' }] }),
    ...over,
  })

  it('merges releases and episodes, releases first on the same day', async () => {
    const events = await collectCalendar({ from: '2026-01-01', to: '2026-01-31' }, deps())
    expect(events.map(e => e.kind)).toEqual(['release', 'episode'])
  })

  it('can skip the episode lookups', async () => {
    let called = false
    const events = await collectCalendar({ from: '2026-01-01', to: '2026-01-31', episodes: false },
      deps({ getEpisodes: async () => { called = true; return {} } }))
    expect(called).toBe(false)
    expect(events).toHaveLength(1)
  })

  it('survives a failing episode lookup', async () => {
    const events = await collectCalendar({ from: '2026-01-01', to: '2026-01-31' },
      deps({ getEpisodes: async () => { throw new Error('offline') } }))
    expect(events.map(e => e.kind)).toEqual(['release'])
  })
})

describe('iCalendar output', () => {
  const now = new Date('2026-11-19T08:30:00Z')

  it('escapes text values', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })

  it('folds long lines at 75 octets without splitting characters', () => {
    const line = 'SUMMARY:' + 'é'.repeat(60)
    const folded = foldLine(line).split('\r\n')
    expect(folded.length).toBeGreaterThan(1)
    for (const part of folded) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75)
    expect(folded.slice(1).every(p => p.startsWith(' '))).toBe(true)
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line)
  })

  it('writes all-day events with stable UIDs and CRLF line endings', () => {
    const events = [
      ...releaseEvents([release()], null, null),
      ...episodeEvents(show(), { episodes: [{ season: 2, number: 1, title: 'Hello, Ms. Cobel', air_date: '2026-01-17' }] }, null, null),
    ]
    const ics = toIcs(events, { now })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/)
    expect(ics).toContain('UID:release-anilist-200@chronicle.local')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260116\r\nDTEND;VALUE=DATE:20260117')
    expect(ics).toContain('DTSTAMP:20261119T083000Z')
    expect(ics).toContain('SUMMARY:Severance: S2E1\r\n')
    expect(ics).toContain('DESCRIPTION:S2E1 · Hello\\, Ms. Cobel\\nTV Shows')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })

  it('produces an empty but valid calendar', () => {
    const ics = toIcs([], { now })
    expect(ics).toContain('X-WR-CALNAME:Chronicle')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })

  it('covers last month through next year', () => {
    expect(icsWindow(now)).toEqual({ from: '2026-10-20', to: '2027-11-19' })
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
