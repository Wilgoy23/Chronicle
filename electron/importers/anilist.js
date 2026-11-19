// AniList profile → the shape importData() (electron/db.js) accepts.
//
// Unlike the file-based importers this reads a *public* AniList list straight
// from AniList's API by username — no export file, no key. Because AniList is
// also Chronicle's anime/manga source, every imported entry keeps its AniList
// media id (source 'anilist'), so release detection, "Add series…" and the
// episode grid work on imported entries immediately.
//
// Status mapping mirrors the MAL importer: CURRENT/REPEATING/PAUSED →
// in_progress, COMPLETED/DROPPED → completed (kept, not discarded),
// PLANNING → planned. AniList's `repeat` count becomes undated re-watch/
// re-read logs so the ×N badge carries over.

const ENDPOINT = 'https://graphql.anilist.co'

const QUERY = `
  query ($name: String, $type: MediaType) {
    MediaListCollection(userName: $name, type: $type) {
      lists {
        isCustomList
        entries {
          status
          score(format: POINT_10)
          progress
          repeat
          notes
          startedAt { year month day }
          completedAt { year month day }
          createdAt
          media {
            id
            title { romaji english }
            coverImage { medium }
            episodes
            chapters
            genres
            startDate { year }
            description(asHtml: false)
          }
        }
      }
    }
  }
`

const STATUS_MAP = {
  CURRENT:   'in_progress',
  REPEATING: 'in_progress',
  PAUSED:    'in_progress',
  COMPLETED: 'completed',
  DROPPED:   'completed',
  PLANNING:  'planned',
}

function fuzzyDate(d) {
  if (!d?.year) return null
  const m = String(d.month ?? 1).padStart(2, '0')
  const day = String(d.day ?? 1).padStart(2, '0')
  return `${d.year}-${m}-${day}`
}

function unixToDb(sec) {
  if (!sec) return undefined
  return new Date(sec * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

// Pure: { anime: MediaListCollection, manga: MediaListCollection } → export shape.
function mapAniList({ anime, manga } = {}) {
  const entries = []
  const logs = []
  let nextId = 1

  const add = (collection, category) => {
    // A title can sit in a status list and in custom lists; take each media once,
    // preferring the status list.
    const lists = [...(collection?.lists ?? [])].sort((a, b) => Number(a.isCustomList) - Number(b.isCustomList))
    const seen = new Set()
    for (const list of lists) {
      for (const item of list.entries ?? []) {
        const m = item.media
        if (!m?.id || seen.has(m.id)) continue
        seen.add(m.id)
        const title = m.title?.english || m.title?.romaji
        if (!title) continue

        const status = STATUS_MAP[item.status] ?? 'planned'
        const id = nextId++
        entries.push({
          id,
          category,
          title,
          status,
          rating:         item.score > 0 ? Math.round(item.score) : null,
          notes:          item.notes ?? '',
          description:    m.description ? m.description.replace(/<[^>]*>/g, '').slice(0, 300) : null,
          cover_url:      m.coverImage?.medium ?? null,
          genres:         (m.genres ?? []).slice(0, 3).join(', ') || null,
          year:           m.startDate?.year ?? null,
          source:         'anilist',
          source_id:      String(m.id),
          progress:       item.progress ?? 0,
          progress_total: (category === 'anime' ? m.episodes : m.chapters) ?? null,
          date_read:      status === 'completed' ? fuzzyDate(item.completedAt) : null,
          created_at:     unixToDb(item.createdAt),
        })
        for (let i = 0; i < (item.repeat ?? 0); i++) {
          logs.push({ entry_id: id, date: null, rating: null, notes: 'Imported from AniList' })
        }
      }
    }
  }

  add(anime, 'anime')
  add(manga, 'manga')
  return { format: 'chronicle-export', version: 1, entries, series: [], logs }
}

async function fetchCollection(username, type) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { name: username, type } }),
  })
  const json = await res.json()
  if (json.errors?.length) {
    const msg = json.errors[0].message || 'AniList request failed'
    if (/not found/i.test(msg) || json.errors[0].status === 404) {
      throw new Error(`No AniList user named "${username}" (or their list is private).`)
    }
    if (/private/i.test(msg)) throw new Error(`${username}'s AniList list is private.`)
    throw new Error(msg)
  }
  return json.data?.MediaListCollection ?? null
}

async function fetchAniList(username) {
  const name = String(username ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/anilist\.co\/user\//i, '').replace(/\/.*$/, '')
  if (!name) throw new Error('Enter an AniList username.')
  const anime = await fetchCollection(name, 'ANIME')
  const manga = await fetchCollection(name, 'MANGA')
  return mapAniList({ anime, manga })
}

module.exports = { mapAniList, fetchAniList, fuzzyDate }
