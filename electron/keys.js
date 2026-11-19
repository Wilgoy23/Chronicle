// Effective API keys for the catalogue sources.
//
// Precedence, per key: the user's own key from Settings → a key bundled with
// the build → none. "None" is fine for books and TV (they fall back to the
// keyless Open Library / TVmaze sources, see catalog.js); movies and games
// still need a TMDB / RAWG key from one of the two places.
//
// Bundled keys live in electron/bundled-keys.json, which is git-ignored and
// written at release time from CI secrets (see .github/workflows/release.yml).
// For local development the same keys can come from CHRONICLE_TMDB_KEY /
// CHRONICLE_RAWG_KEY. Anything shipped inside the app can be extracted from
// it, so only bundle keys that are safe to treat as public.
//
// Hardcover is never bundled: its token is tied to one person's account.

let bundledCache = null

function loadBundled() {
  if (bundledCache) return bundledCache
  let file = {}
  try { file = require('./bundled-keys.json') } catch { /* not bundled in this build */ }
  bundledCache = {
    tmdbKey: (process.env.CHRONICLE_TMDB_KEY || file.tmdbKey || '').trim(),
    rawgKey: (process.env.CHRONICLE_RAWG_KEY || file.rawgKey || '').trim(),
  }
  return bundledCache
}

// Test hook: lets unit tests swap the bundled set without touching disk/env.
function setBundledForTests(keys) {
  bundledCache = keys ? { tmdbKey: '', rawgKey: '', ...keys } : null
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '')

// Returns { tmdbKey, rawgKey, hardcoverToken, origin: { tmdbKey, rawgKey, hardcoverToken } }
// where each origin is 'user' | 'bundled' | null.
function effectiveKeys(settings = {}) {
  const bundled = loadBundled()
  const out = { origin: {} }
  for (const k of ['tmdbKey', 'rawgKey']) {
    const user = clean(settings[k])
    if (user)            { out[k] = user;       out.origin[k] = 'user' }
    else if (bundled[k]) { out[k] = bundled[k]; out.origin[k] = 'bundled' }
    else                 { out[k] = '';         out.origin[k] = null }
  }
  const hc = clean(settings.hardcoverToken).replace(/^Bearer\s+/i, '')
  out.hardcoverToken = hc
  out.origin.hardcoverToken = hc ? 'user' : null
  return out
}

module.exports = { effectiveKeys, setBundledForTests }
