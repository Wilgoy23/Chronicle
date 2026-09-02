// Seed selection and prompt construction for "Fresh picks" — the one AI
// feature that needs a generative model, since it names titles the library
// doesn't contain. Kept pure and dependency-free so the prompt can be
// unit-tested without an LLM; the Ollama call itself stays in aiService.

// How many rated titles to show the model, and how few genre matches are still
// worth narrowing to. Below the minimum the genre stops steering the seeds and
// survives only as the output constraint — see selectSeeds.
const SEED_LIMIT = 20
const MIN_SEEDS  = 3

// Seeds may be drawn from one status, or from everything rated.
const SEED_STATUSES = ['all', 'completed', 'in_progress']

// Phrasing for the "nothing to go on" error, so it can name the switch the
// user actually set rather than saying "no entries" about a filtered view.
const SEED_STATUS_TEXT = {
  completed:   'completed',
  in_progress: 'in progress',
}

// Genres are stored as one comma-separated string per entry. Matching is on
// whole items rather than substrings: the vocabulary can offer "Romance" and
// "Dark Romance" as separate choices, and picking one should not drag in the
// other.
function hasGenre(entry, genre) {
  if (!genre) return true
  const want = genre.trim().toLowerCase()
  if (!want) return true
  return String(entry.genres || '')
    .split(',')
    .some(g => g.trim().toLowerCase() === want)
}

// Which of the user's entries seed the taste signal.
//
// Status is a hard filter: the control says "based on what you completed", so
// quietly seeding from everything when there is nothing completed would make
// it a lie. An empty result is the caller's to report.
//
// Genre is deliberately softer. Asking for horror with two rated horror titles
// is still a perfectly answerable request — general taste covers it — so below
// MIN_SEEDS the genre stops narrowing the seeds and remains purely the output
// target. genreSeeded reports which happened, because "from your 9 rated
// Fantasy titles" and "from your top titles overall" are different claims and
// the panel should not make the first one when the second is true.
function selectSeeds(entries, { genre = '', status = 'all' } = {}) {
  const rated = entries
    .filter(e => e.rating != null)
    .filter(e => status === 'all' || e.status === status)
    .sort((a, b) => b.rating - a.rating)

  const narrowed    = genre ? rated.filter(e => hasGenre(e, genre)) : rated
  const genreSeeded = Boolean(genre.trim()) && narrowed.length >= MIN_SEEDS
  return { seeds: (genreSeeded ? narrowed : rated).slice(0, SEED_LIMIT), genreSeeded }
}

function buildSuggestPrompt({ seeds, categoryLabel, genre = '', status = 'all', count = 5 }) {
  const g    = genre.trim()
  const kind = g ? `${g} ${categoryLabel}` : categoryLabel
  const seedLabel = status === 'completed'   ? 'Titles they finished and rated'
                  : status === 'in_progress' ? 'Titles they are partway through and rated'
                  : 'Their top-rated titles'

  return [
    `The user tracks ${categoryLabel} they consume. ${seedLabel} (rating out of 10):`,
    ...seeds.map(e => `- ${e.title}${e.year ? ` (${e.year})` : ''}: ${e.rating}/10`),
    '',
    `Suggest exactly ${count} real, well-known ${kind} titles they do NOT already have and would likely love.`,
    // Without this a small local model pads the list to five by drifting off
    // the requested genre, which reads as the filter being broken rather than
    // the library being thin.
    g && `Every suggestion must be ${g}. If you cannot find ${count}, return fewer rather than including something that is not ${g}.`,
    'Return ONLY JSON: {"suggestions": [{"title": string, "reason": string (one short sentence)}]}',
  ].filter(Boolean).join('\n')
}

module.exports = {
  selectSeeds, buildSuggestPrompt, hasGenre,
  SEED_LIMIT, MIN_SEEDS, SEED_STATUSES, SEED_STATUS_TEXT,
}
