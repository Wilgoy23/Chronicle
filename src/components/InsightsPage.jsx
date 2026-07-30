import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_CATEGORIES } from '../App'
import { computeStats } from '../insightsStats'

// Single-hue vertical bar chart (magnitude over an ordered axis).
function BarChart({ data, xKey, max, accent, unit }) {
  const peak = max || Math.max(1, ...data.map(d => d.count))
  return (
    <div className="insights-bars">
      {data.map(d => (
        <div className="insights-bar-col" key={d[xKey]}>
          <div className="insights-bar-track">
            <div
              className="insights-bar-fill"
              style={{ height: `${(d.count / peak) * 100}%`, background: accent }}
              title={`${d[xKey]}: ${d.count} ${unit}`}
            >
              {d.count > 0 && <span className="insights-bar-val">{d.count}</span>}
            </div>
          </div>
          <span className="insights-bar-label">{d[xKey]}</span>
        </div>
      ))}
    </div>
  )
}

// GitHub-contributions-style heat strip: one row per year, one cell per month,
// color intensity (accent alpha) scaled to that year's own peak month.
function HeatStrip({ perMonth, accent }) {
  const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  return (
    <div className="insights-heat">
      {perMonth.map(({ year, months }) => {
        const peak = Math.max(1, ...months.map(m => m.count))
        return (
          <div className="insights-heat-row" key={year}>
            <span className="insights-heat-year">{year}</span>
            <div className="insights-heat-cells">
              {months.map(m => (
                <div
                  key={m.month}
                  className="insights-heat-cell"
                  title={`${year}-${String(m.month).padStart(2, '0')}: ${m.count} completed`}
                  style={{ background: m.count === 0 ? undefined : accent, opacity: m.count === 0 ? 1 : 0.18 + (m.count / peak) * 0.82 }}
                />
              ))}
            </div>
          </div>
        )
      })}
      <div className="insights-heat-row insights-heat-labels">
        <span className="insights-heat-year" />
        <div className="insights-heat-cells">
          {MONTH_LABELS.map((l, i) => <span key={i} className="insights-heat-label">{l}</span>)}
        </div>
      </div>
    </div>
  )
}

const SERIES_CAP = 10

export default function InsightsPage({ categories, accent }) {
  const [entries, setEntries] = useState(null)
  const [showAllSeries, setShowAllSeries] = useState(false)

  useEffect(() => { window.db.getEntries().then(setEntries) }, [])

  const stats = useMemo(
    () => (entries ? computeStats(entries, categories ?? DEFAULT_CATEGORIES) : null),
    [entries, categories],
  )

  if (!entries) return <div className="settings-loading">Loading…</div>

  if (entries.length === 0) {
    return (
      <div className="insights-empty">
        <p>No data yet. Add some entries and your stats will show up here.</p>
      </div>
    )
  }

  const delta = stats.thisYear - stats.lastYear
  const hasRatings = stats.avgOverall != null

  return (
    <div className="insights" style={{ '--accent': accent }}>
      {/* Headline KPIs */}
      <div className="insights-kpis">
        <div className="insights-kpi">
          <span className="insights-kpi-num">{stats.total}</span>
          <span className="insights-kpi-label">Total entries</span>
        </div>
        <div className="insights-kpi">
          <span className="insights-kpi-num" style={{ color: '#4ade80' }}>{stats.completed}</span>
          <span className="insights-kpi-label">Completed</span>
        </div>
        <div className="insights-kpi">
          <span className="insights-kpi-num" style={{ color: '#facc15' }}>{stats.inProgress}</span>
          <span className="insights-kpi-label">In progress</span>
        </div>
        <div className="insights-kpi">
          <span className="insights-kpi-num" style={{ color: '#94a3b8' }}>{stats.planned}</span>
          <span className="insights-kpi-label">Planned</span>
        </div>
        <div className="insights-kpi">
          <span className="insights-kpi-num">{hasRatings ? stats.avgOverall.toFixed(1) : '—'}</span>
          <span className="insights-kpi-label">Avg rating</span>
        </div>
      </div>

      {/* This year vs last year */}
      <div className="insights-card insights-compare">
        <div className="insights-compare-main">
          <span className="insights-compare-num">{stats.thisYear}</span>
          <span className="insights-compare-label">completed in {stats.thisYearLabel}</span>
        </div>
        <div className={`insights-compare-delta ${delta >= 0 ? 'up' : 'down'}`}>
          {delta === 0
            ? `Same as ${stats.lastYearLabel}`
            : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs ${stats.lastYearLabel} (${stats.lastYear})`}
        </div>
      </div>

      {/* Completed per year */}
      {stats.perYear.length > 0 && (
        <div className="insights-card">
          <h3 className="insights-card-title">Completed per year</h3>
          <BarChart data={stats.perYear} xKey="year" accent={accent} unit="completed" />
        </div>
      )}

      {/* Rating distribution */}
      {hasRatings && (
        <div className="insights-card">
          <h3 className="insights-card-title">Rating distribution</h3>
          <BarChart data={stats.ratingDist} xKey="rating" accent={accent} unit="rated" />
        </div>
      )}

      {/* Completions per month, per year */}
      {stats.perMonth.length > 0 && (
        <div className="insights-card">
          <h3 className="insights-card-title">Completed per month</h3>
          <HeatStrip perMonth={stats.perMonth} accent={accent} />
        </div>
      )}

      {/* Average rating by category — bars are direct-labeled, so category
          identity never depends on color alone (colors reinforce only). */}
      {stats.perCategory.length > 0 && (
        <div className="insights-card">
          <h3 className="insights-card-title">Average rating by category</h3>
          <div className="insights-hbars">
            {stats.perCategory.map(c => (
              <div className="insights-hbar-row" key={c.id}>
                <span className="insights-hbar-label">{c.label}</span>
                <div className="insights-hbar-track" title={`${c.label}: ${c.avg.toFixed(1)} avg over ${c.count} rated`}>
                  <div
                    className="insights-hbar-fill"
                    style={{ width: `${(c.avg / 10) * 100}%`, background: c.color }}
                  />
                </div>
                <span className="insights-hbar-val">{c.avg.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Average rating by series — same direct-labeled hbar pattern as per-category,
          capped to avoid an unbounded list for users tracking many series. */}
      {stats.perSeries.length > 0 && (
        <div className="insights-card">
          <h3 className="insights-card-title">Average rating by series</h3>
          <div className="insights-hbars">
            {(showAllSeries ? stats.perSeries : stats.perSeries.slice(0, SERIES_CAP)).map(s => (
              <div className="insights-hbar-row" key={s.id}>
                <span className="insights-hbar-label" title={`${s.name} (${s.categoryLabel})`}>{s.name}</span>
                <div className="insights-hbar-track" title={`${s.name}: ${s.avg.toFixed(1)} avg over ${s.count} rated`}>
                  <div
                    className="insights-hbar-fill"
                    style={{ width: `${(s.avg / 10) * 100}%`, background: s.color }}
                  />
                </div>
                <span className="insights-hbar-val">{s.avg.toFixed(1)}</span>
              </div>
            ))}
          </div>
          {stats.perSeries.length > SERIES_CAP && (
            <button className="insights-show-more" onClick={() => setShowAllSeries(v => !v)}>
              {showAllSeries ? 'Show less' : `Show all ${stats.perSeries.length} series`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
