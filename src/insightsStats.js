// Pure stats helpers for the Insights page — no React/DOM, so they're unit-testable.

export function getYear(e) {
  const d = e.date_read || e.created_at?.slice(0, 10) || ''
  return d ? d.slice(0, 4) : null
}

// `catList` is an array of { id, label, color }. `now` is injectable for tests.
export function computeStats(entries, catList = [], now = new Date()) {
  const thisYear = String(now.getFullYear())
  const lastYear = String(now.getFullYear() - 1)

  let completed = 0, inProgress = 0, planned = 0
  let ratingSum = 0, ratingN = 0
  const yearCounts = new Map()                       // year -> completed count
  const ratingDist = Array.from({ length: 10 }, () => 0)
  const catAgg     = new Map()                       // catId -> { sum, n }

  for (const e of entries) {
    if      (e.status === 'completed')   completed++
    else if (e.status === 'in_progress') inProgress++
    else if (e.status === 'planned')     planned++

    if (e.status === 'completed') {
      const y = getYear(e)
      if (y) yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1)
    }

    if (e.rating != null && e.rating >= 1 && e.rating <= 10) {
      ratingDist[e.rating - 1]++
      ratingSum += e.rating
      ratingN++
      const a = catAgg.get(e.category) ?? { sum: 0, n: 0 }
      a.sum += e.rating
      a.n++
      catAgg.set(e.category, a)
    }
  }

  const perYear = [...yearCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, count]) => ({ year, count }))

  const perCategory = catList
    .map(c => {
      const a = catAgg.get(c.id)
      return a ? { id: c.id, label: c.label, color: c.color, avg: a.sum / a.n, count: a.n } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.avg - a.avg)

  return {
    total: entries.length,
    completed, inProgress, planned,
    thisYear:      yearCounts.get(thisYear) ?? 0,
    lastYear:      yearCounts.get(lastYear) ?? 0,
    thisYearLabel: thisYear,
    lastYearLabel: lastYear,
    perYear,
    ratingDist: ratingDist.map((count, i) => ({ rating: i + 1, count })),
    perCategory,
    avgOverall: ratingN ? ratingSum / ratingN : null,
  }
}
