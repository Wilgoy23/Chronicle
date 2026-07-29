# Chronicle

A local-first personal media tracker for books, anime, manga, movies, TV shows, games — plus any
fully custom category you define. Built as a Windows desktop app (Electron + React + SQLite); your
data never leaves your machine.

## Features

- **Categories** — Books, Anime, Manga, Movies, TV Shows, and Games out of the box, plus fully
  custom categories with their own name/icon/color
- **Add via search** — look up titles through Hardcover (books), AniList (anime/manga), TMDB
  (movies/TV), and RAWG (games), or add entries manually
- **Track status** — completed, in progress (with page/episode/hour progress), or planned
- **Ratings, notes, cover art, series groupings, and tags/genres**
- **Re-watch / re-read logs** — track every rewatch or reread of a title, not just the first
- **New release inbox** — background scan flags new releases for series/titles you're already
  tracking
- **Global and per-category search** — filter within a category, or search your whole library at
  once (`Ctrl/Cmd+Shift+K`)
- **Grid, compact list, and timeline views**
- **Insights page** — stats and charts across your collection
- **Export / import** — JSON and CSV export, JSON re-import with duplicate detection, and full
  binary DB backup/restore
- **Smarter duplicate detection** — flags likely duplicates (by source id, then by title/year) with
  an explicit "Add anyway" override
- **Light and dark themes**
- **Keyboard shortcuts** — `Ctrl/Cmd+N` to add, `Ctrl/Cmd+K`/`F` to search, `Ctrl/Cmd+Shift+K` for
  global search, `Esc` to close overlays

## Tech Stack

- **Electron** — desktop shell
- **React 18 + Vite** — frontend
- **SQLite (better-sqlite3)** — local database
- **Vitest** — unit tests; **Playwright** — end-to-end tests

## Getting Started

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

## Testing

```bash
npm test        # unit tests (rebuilds better-sqlite3 for the system Node ABI first)
npm run test:e2e
```

After running unit tests, `better-sqlite3` is left built against the system Node ABI. Rebuild it
for Electron before running the app again:

```bash
npx electron-rebuild -f -o better-sqlite3
```

## Build

Produces a Windows installer (`.exe`) in the `release/` folder:

```bash
npm run build
```

## Documentation

- [docs/PRD.md](docs/PRD.md) — product requirements and shipped milestones
- [docs/PRD-followups.md](docs/PRD-followups.md) — deferred items tracked as follow-up work
