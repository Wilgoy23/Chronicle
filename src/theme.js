// Light/dark theme (5.6). Dark is the default; the choice persists in
// localStorage and is applied synchronously at boot (see main.jsx) so there's
// no flash of the wrong palette before React mounts.
const KEY = 'chronicle.theme'
export const THEMES = ['dark', 'light']

export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    return THEMES.includes(saved) ? saved : 'dark'
  } catch {
    return 'dark'
  }
}

// Reflect the theme on <html data-theme> so the CSS variable overrides apply.
export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'dark'
  document.documentElement.setAttribute('data-theme', t)
  return t
}

export function setTheme(theme) {
  const t = applyTheme(theme)
  try { localStorage.setItem(KEY, t) } catch { /* localStorage unavailable */ }
  return t
}
