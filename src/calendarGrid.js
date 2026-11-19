// Month-grid helpers for the release calendar (8.2). Dates are local-time
// 'YYYY-MM-DD' strings, matching how air and release dates are stored.

const pad = (n) => String(n).padStart(2, '0')

export function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// First day of the week for a locale, 0 = Sunday … 6 = Saturday. Uses
// Intl.Locale week info where the runtime has it (a getter in older Chromium,
// getWeekInfo() in newer), else Sunday.
export function weekStartDay(locale) {
  try {
    const loc = new Intl.Locale(locale || 'en-US')
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo
    if (info?.firstDay) return info.firstDay % 7 // ISO 1 = Monday … 7 = Sunday
  } catch { /* fall through */ }
  return 0
}

/**
 * Weeks covering a month, each a list of 7 days { ymd, day, inMonth }.
 * Only as many weeks as the month needs (4–6).
 */
export function monthGrid(year, month, weekStart = 0) {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() - weekStart + 7) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7
  const weeks = []
  for (let i = 0; i < cells; i++) {
    const d = new Date(year, month, 1 - lead + i)
    if (i % 7 === 0) weeks.push([])
    weeks[weeks.length - 1].push({ ymd: localYmd(d), day: d.getDate(), inMonth: d.getMonth() === month })
  }
  return weeks
}

export function gridRange(weeks) {
  return { from: weeks[0][0].ymd, to: weeks[weeks.length - 1][6].ymd }
}

export function shiftMonth({ year, month }, delta) {
  const d = new Date(year, month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

// Weekday names in grid order, e.g. ['Mon', 'Tue', …] for a Monday start.
export function weekdayLabels(weekStart = 0, locale, style = 'short') {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: style })
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + ((weekStart + i) % 7))))
}

export function groupByDate(events) {
  const map = new Map()
  for (const ev of events) {
    if (!map.has(ev.date)) map.set(ev.date, [])
    map.get(ev.date).push(ev)
  }
  return map
}
