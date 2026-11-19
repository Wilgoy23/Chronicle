import { describe, it, expect } from 'vitest'
import {
  statusForProgress, progressUpdate, markDoneUpdate, startUpdate,
  parseDbTime, timeAgo, daysSince, episodeLabel, untilLabel,
} from '../../src/progress.js'

const entry = (over = {}) => ({
  id: 1, title: 'T', status: 'in_progress', rating: null, notes: '', series_id: null,
  date_read: null, progress: 0, progress_total: 10, ...over,
})

describe('statusForProgress', () => {
  it('finishes at the total', () => expect(statusForProgress('in_progress', 10, 10)).toBe('completed'))
  it('starts a planned entry on first progress', () => expect(statusForProgress('planned', 1, 10)).toBe('in_progress'))
  it('reopens a finished entry that drops below the total', () => expect(statusForProgress('completed', 9, 10)).toBe('in_progress'))
  it('leaves status alone when there is no total', () => expect(statusForProgress('in_progress', 500, null)).toBe('in_progress'))
  it('leaves planned alone at zero progress', () => expect(statusForProgress('planned', 0, 10)).toBe('planned'))
})

describe('progressUpdate', () => {
  it('clamps to the total, completes and stamps a date', () => {
    const p = progressUpdate(entry({ progress: 9 }), 12)
    expect(p).toMatchObject({ progress: 10, status: 'completed', progress_total: 10 })
    expect(p.date_read).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps an existing finish date', () => {
    expect(progressUpdate(entry({ progress: 9, date_read: '2020-01-01' }), 10).date_read).toBe('2020-01-01')
  })

  it('never goes below zero', () => {
    expect(progressUpdate(entry(), -3).progress).toBe(0)
  })

  it('accepts an explicit total override', () => {
    const p = progressUpdate(entry({ progress_total: null, status: 'planned' }), 3, { total: 24 })
    expect(p).toMatchObject({ progress: 3, progress_total: 24, status: 'in_progress', date_read: null })
  })

  it('carries the fields updateEntry requires', () => {
    expect(Object.keys(progressUpdate(entry(), 1)).sort()).toEqual(
      ['date_read', 'id', 'notes', 'progress', 'progress_total', 'rating', 'series_id', 'status', 'title'],
    )
  })
})

describe('markDoneUpdate / startUpdate', () => {
  it('fills progress to the total when finishing', () => {
    expect(markDoneUpdate(entry({ progress: 4 }))).toMatchObject({ status: 'completed', progress: 10 })
  })
  it('keeps progress when there is no total', () => {
    expect(markDoneUpdate(entry({ progress: 4, progress_total: null }))).toMatchObject({ progress: 4 })
  })
  it('starts an entry', () => {
    expect(startUpdate(entry({ status: 'planned' })).status).toBe('in_progress')
  })
})

describe('time helpers', () => {
  const now = Date.parse('2026-11-18T12:00:00Z')

  it('parses SQLite UTC timestamps', () => {
    expect(parseDbTime('2026-11-18 10:00:00').toISOString()).toBe('2026-11-18T10:00:00.000Z')
    expect(parseDbTime('')).toBeNull()
  })

  it('describes elapsed time', () => {
    expect(timeAgo('2026-11-18 08:00:00', now)).toBe('today')
    expect(timeAgo('2026-11-17 08:00:00', now)).toBe('yesterday')
    expect(timeAgo('2026-11-14 08:00:00', now)).toBe('4 days ago')
    expect(timeAgo('2026-10-28 08:00:00', now)).toBe('3 weeks ago')
    expect(timeAgo('2026-08-01 08:00:00', now)).toBe('3 months ago')
  })

  it('counts days since', () => {
    expect(daysSince('2026-11-08 12:00:00', now)).toBe(10)
    expect(daysSince(null, now)).toBe(Infinity)
  })

  it('labels episodes with or without seasons', () => {
    expect(episodeLabel({ season: 2, number: 5 })).toBe('S2 · E5')
    expect(episodeLabel({ season: null, number: 5 })).toBe('Ep 5')
  })

  it('describes time until an air date', () => {
    const d = new Date('2026-11-18T12:00:00Z')
    expect(untilLabel('2026-11-18', d)).toBe('today')
    expect(untilLabel('2026-11-19', d)).toBe('tomorrow')
    expect(untilLabel('2026-11-25', d)).toBe('in 7 days')
  })
})
