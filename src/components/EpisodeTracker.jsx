import { useEffect, useMemo, useState } from 'react'
import { episodeLabel, untilLabel } from '../progress'

// Which entries have an episode list to show (mirrors electron/episodes.js).
export function hasEpisodeList(entry) {
  return !!entry?.source_id && (
    (entry.category === 'anime' && entry.source === 'anilist') ||
    (entry.category === 'tv' && (entry.source === 'tmdb' || entry.source === 'tvmaze'))
  )
}

// Watched-through episode grid. `progress` counts episodes in watch order, so
// clicking an episode marks it and everything before it watched; clicking a
// watched one un-watches it and everything after. onChange(progress, total)
// hands the parent the new count plus the list length to use as the total.
export default function EpisodeTracker({ entry, progress, onChange }) {
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [season, setSeason]   = useState(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    window.api.getEpisodes(entry).then(res => {
      if (cancelled) return
      if (res?.error) { setError(res.error); return }
      setData(res)
    }).catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [entry.id, entry.source, entry.source_id])

  const episodes = data?.episodes ?? []
  const seasons = useMemo(
    () => [...new Set(episodes.map(e => e.season).filter(s => s != null))],
    [episodes],
  )

  // Open on the season holding the next unwatched episode.
  useEffect(() => {
    if (!seasons.length) { setSeason(null); return }
    const nextEp = episodes[Math.min(progress, episodes.length - 1)]
    setSeason(nextEp?.season ?? seasons[0])
  }, [data])

  if (error) {
    if (error === 'UNSUPPORTED') return null
    return (
      <p className="ep-note">
        {error === 'NO_TOKEN' ? 'Episode list needs a TMDB key (Settings → API Keys).' : 'Couldn’t load the episode list.'}
      </p>
    )
  }
  if (!data) return <p className="ep-note">Loading episodes…</p>
  if (!episodes.length) return <p className="ep-note">No episodes listed yet.</p>

  const watched = Math.min(progress, episodes.length)
  const nextUp = episodes[watched]
  const indexed = episodes.map((ep, i) => ({ ...ep, index: i + 1 }))
  const visible = seasons.length > 1 ? indexed.filter(ep => ep.season === season) : indexed

  function click(ep) {
    const next = ep.index <= watched ? ep.index - 1 : ep.index
    onChange(next, episodes.length)
  }

  return (
    <div className="ep-tracker">
      <div className="ep-summary">
        <span><b>{watched}</b> of {episodes.length} watched</span>
        {nextUp && (
          <span className="ep-next">
            Next: {episodeLabel(nextUp)}{nextUp.title ? ` · ${nextUp.title}` : ''}
            {!nextUp.aired && nextUp.air_date && ` · airs ${untilLabel(nextUp.air_date)}`}
          </span>
        )}
      </div>

      {seasons.length > 1 && (
        <div className="ep-seasons" role="tablist" aria-label="Seasons">
          {seasons.map(s => {
            const inSeason = indexed.filter(ep => ep.season === s)
            const done = inSeason.every(ep => ep.index <= watched)
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={season === s}
                className={`ep-season-tab ${season === s ? 'active' : ''} ${done ? 'done' : ''}`}
                onClick={() => setSeason(s)}
              >
                S{s}
              </button>
            )
          })}
        </div>
      )}

      <div className="ep-grid">
        {visible.map(ep => {
          const isWatched = ep.index <= watched
          const isNext = ep.index === watched + 1
          const tip = [
            episodeLabel(ep),
            ep.title,
            ep.air_date && (ep.aired ? `aired ${ep.air_date}` : `airs ${ep.air_date}`),
            isWatched ? 'click to un-watch from here' : 'click to mark watched up to here',
          ].filter(Boolean).join(' · ')
          return (
            <button
              key={ep.index}
              type="button"
              className={`ep-cell${isWatched ? ' watched' : ''}${isNext ? ' next' : ''}${!ep.aired ? ' unaired' : ''}`}
              onClick={() => click(ep)}
              title={tip}
              aria-label={tip}
              aria-pressed={isWatched}
            >
              {ep.number}
            </button>
          )
        })}
      </div>
    </div>
  )
}
