// Personalized recommendations from the user's own signals — no cloud, no
// catalog. A taste profile is the weighted centroid of embeddings of things
// the user rated (love pulls toward, hate pushes away); the backlog
// (status = planned) is then ranked by similarity to that profile. Pure
// vector math over Float32Arrays so it is trivially unit-testable.

const { cosine } = require('./embeddings')

// Rating (1–10) → signed weight in [-1, 1]. 5.5 is neutral; unrated completed
// items get a small positive nudge (finishing something is weak approval).
function ratingWeight(item) {
  if (item.rating != null) return (item.rating - 5.5) / 4.5
  if (item.status === 'completed') return 0.2
  return 0
}

// items: [{ vector: Float32Array, rating, status }]. Returns a normalized
// centroid, or null when there is no usable signal yet.
function buildTasteProfile(items) {
  let dim = 0
  for (const it of items) if (it.vector) { dim = it.vector.length; break }
  if (!dim) return null

  const acc = new Float32Array(dim)
  let signal = 0
  for (const it of items) {
    if (!it.vector || it.vector.length !== dim) continue
    const w = ratingWeight(it)
    if (w === 0) continue
    signal++
    for (let i = 0; i < dim; i++) acc[i] += w * it.vector[i]
  }
  if (!signal) return null

  let len = 0
  for (let i = 0; i < dim; i++) len += acc[i] * acc[i]
  len = Math.sqrt(len)
  if (len === 0) return null
  for (let i = 0; i < dim; i++) acc[i] /= len
  return acc
}

// Rank candidates (backlog) against the profile, best first.
function rankCandidates(profile, candidates) {
  return candidates
    .filter(c => c.vector)
    .map(c => ({ ...c, score: cosine(profile, c.vector) }))
    .sort((a, b) => b.score - a.score)
}

// "Because you liked …": the highest-rated near neighbour among loved items.
function nearestLiked(vector, liked) {
  let best = null
  for (const l of liked) {
    if (!l.vector) continue
    const score = cosine(vector, l.vector)
    if (!best || score > best.score) best = { title: l.title, score }
  }
  return best
}

module.exports = { buildTasteProfile, rankCandidates, nearestLiked, ratingWeight }
