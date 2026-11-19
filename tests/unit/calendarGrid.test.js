import { describe, it, expect } from 'vitest'
import {
  localYmd, parseYmd, weekStartDay, monthGrid, gridRange, shiftMonth, weekdayLabels, groupByDate,
} from '../../src/calendarGrid.js'

describe('monthGrid', () => {
  it('pads a Sunday-start grid to whole weeks', () => {
    // November 2026 starts on a Sunday and has 30 days → 5 weeks.
    const weeks = monthGrid(2026, 10, 0)
    expect(weeks).toHaveLength(5)
    expect(weeks[0][0]).toEqual({ ymd: '2026-11-01', day: 1, inMonth: true })
    expect(weeks[4][6]).toEqual({ ymd: '2026-12-05', day: 5, inMonth: false })
  })

  it('shifts the lead-in for a Monday start', () => {
    const weeks = monthGrid(2026, 10, 1)
    expect(weeks[0][0]).toEqual({ ymd: '2026-10-26', day: 26, inMonth: false })
    expect(weeks[0][6].ymd).toBe('2026-11-01')
    expect(weeks).toHaveLength(6)
  })

  it('handles a four-week February', () => {
    // February 2026 starts on a Sunday with 28 days.
    expect(monthGrid(2026, 1, 0)).toHaveLength(4)
  })

  it('gives the visible date range', () => {
    expect(gridRange(monthGrid(2026, 10, 1))).toEqual({ from: '2026-10-26', to: '2026-12-06' })
  })
})

describe('date helpers', () => {
  it('round-trips local dates', () => {
    expect(localYmd(parseYmd('2026-03-09'))).toBe('2026-03-09')
  })

  it('steps months across year boundaries', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
  })

  it('reads the locale week start, defaulting to Sunday', () => {
    expect([0, 1, 6]).toContain(weekStartDay('en-GB'))
    expect(weekStartDay('not a locale!!')).toBe(0)
  })

  it('labels weekdays in grid order', () => {
    expect(weekdayLabels(1, 'en-US')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(weekdayLabels(0, 'en-US')[0]).toBe('Sun')
  })

  it('groups events by date', () => {
    const g = groupByDate([{ date: 'a', n: 1 }, { date: 'b', n: 2 }, { date: 'a', n: 3 }])
    expect(g.get('a').map(e => e.n)).toEqual([1, 3])
  })
})
