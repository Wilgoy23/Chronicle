// Pure stats helpers for the Insights page — no React/DOM, so they're unit-testable.

export function getYear(e) {
  const d = e.date_read || e.created_at?.slice(0, 10) || ''
  return d ? d.slice(0, 4) : null
}

// Returns { year, month } (month 1-12) for the same date used by getYear, or null.
export function getYearMonth(e) {
  const d = e.date_read || e.created_at?.slice(0, 10) || ''
  if (!d) return null
  const year = d.slice(0, 4)
  const month = parseInt(d.slice(5, 7), 10)
  if (!year || !(month >= 1 && month <= 12)) return null
  return { year, month }
}

// `catList` is an array of { id, label, color }. `now` is injectable for tests.
export function computeStats(entries, catList = [], now = new Date()) {
  const thisYear = String(now.getFullYear())
  const lastYear = String(now.getFullYear() - 1)

  let completed = 0, inProgress = 0, planned = 0
  let ratingSum = 0, ratingN = 0
  const yearCounts  = new Map()                       // year -> completed count
  const monthCounts = new Map()                       // "year-month" -> completed count
  const ratingDist  = Array.from({ length: 10 }, () => 0)
  const catAgg      = new Map()                       // catId -> { sum, n }
  const seriesAgg   = new Map()                       // series_id -> { sum, n, name, category }

  for (const e of entries) {
    if      (e.status === 'completed')   completed++
    else if (e.status === 'in_progress') inProgress++
    else if (e.status === 'planned')     planned++

    if (e.status === 'completed') {
      const y = getYear(e)
      if (y) yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1)
      const ym = getYearMonth(e)
      if (ym) {
        const key = `${ym.year}-${ym.month}`
        monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1)
      }
    }

    if (e.rating != null && e.rating >= 1 && e.rating <= 10) {
      ratingDist[e.rating - 1]++
      ratingSum += e.rating
      ratingN++
      const a = catAgg.get(e.category) ?? { sum: 0, n: 0 }
      a.sum += e.rating
      a.n++
      catAgg.set(e.category, a)

      if (e.series_id != null && e.series) {
        const s = seriesAgg.get(e.series_id) ?? { sum: 0, n: 0, name: e.series, category: e.category }
        s.sum += e.rating
        s.n++
        seriesAgg.set(e.series_id, s)
      }
    }
  }

  const perYear = [...yearCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, count]) => ({ year, count }))

  const perMonth = perYear.map(({ year }) => ({
    year,
    months: Array.from({ length: 12 }, (_, i) => {
      const month = i + 1
      return { month, count: monthCounts.get(`${year}-${month}`) ?? 0 }
    }),
  }))

  const perCategory = catList
    .map(c => {
      const a = catAgg.get(c.id)
      return a ? { id: c.id, label: c.label, color: c.color, avg: a.sum / a.n, count: a.n } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.avg - a.avg)

  const catById  = new Map(catList.map(c => [c.id, c]))
  const perSeries = [...seriesAgg.entries()]
    .map(([id, s]) => ({
      id,
      name: s.name,
      category: s.category,
      categoryLabel: catById.get(s.category)?.label ?? s.category,
      color: catById.get(s.category)?.color,
      avg: s.sum / s.n,
      count: s.n,
    }))
    .sort((a, b) => b.avg - a.avg)

  return {
    total: entries.length,
    completed, inProgress, planned,
    thisYear:      yearCounts.get(thisYear) ?? 0,
    lastYear:      yearCounts.get(lastYear) ?? 0,
    thisYearLabel: thisYear,
    lastYearLabel: lastYear,
    perYear,
    perMonth,
    ratingDist: ratingDist.map((count, i) => ({ rating: i + 1, count })),
    perCategory,
    perSeries,
    avgOverall: ratingN ? ratingSum / ratingN : null,
  }
}
