# Chronicle — Product Requirements & Roadmap

> Living document. Update the **Status** column / checkboxes as work lands.
> Last updated: 2026-07-19

**Status legend:** `⬜ Not started` · `🟨 In progress` · `✅ Done` · `🚫 Won't do`

---

## Overview

Chronicle is a local-first desktop media tracker (Electron + React + SQLite) for books, anime, movies, and games. Users log entries with status (completed / in progress / planned), ratings, notes, and series groupings; add items via external APIs (Hardcover, AniList, TMDB, RAWG); and get notified about new releases in series they follow.

This document tracks planned UX fixes and features, grouped into milestones. Each item has acceptance criteria so "done" is unambiguous.

## Progress at a glance

| # | Item | Milestone | Priority | Status |
|---|------|-----------|----------|--------|
| 1.1 | Library search | M1 | P0 | ✅ |
| 1.2 | Sorting | M1 | P0 | ⬜ |
| 1.3 | Delete undo | M1 | P0 | ⬜ |
| 1.4 | Keyboard shortcuts & Esc-to-close | M1 | P1 | ⬜ |
| 1.5 | Rating slider hover fix | M1 | P1 | ⬜ |
| 2.1 | Progress tracking | M2 | P0 | ⬜ |
| 2.2 | Per-category status wording | M2 | P1 | ⬜ |
| 2.3 | Separate description from notes | M2 | P1 | ⬜ |
| 3.1 | Stats / Insights page | M3 | P1 | ⬜ |
| 3.2 | Export & backup | M3 | P0 | ⬜ |
| 3.3 | Import (CSV/JSON) | M3 | P2 | ⬜ |
| 4.1 | TV Shows category | M4 | P1 | ⬜ |
| 4.2 | Manga category | M4 | P2 | ⬜ |
| 4.3 | Fully custom categories | M4 | P2 | ⬜ |
| 5.1 | Series rename UI | M5 | P1 | ⬜ |
| 5.2 | Re-watch / re-read logs | M5 | P2 | ⬜ |
| 5.3 | Release inbox polish | M5 | P2 | ⬜ |
| 5.4 | Tags / genre chips | M5 | P2 | ⬜ |
| 5.5 | Compact list view | M5 | P3 | ⬜ |
| 5.6 | Light theme | M5 | P3 | ⬜ |
| 5.7 | Smarter duplicate detection | M5 | P3 | ⬜ |

---

## Milestone 1 — Collection usability

*Goal: make an existing collection of 100+ entries pleasant to navigate. Highest-value, lowest-risk batch.*

### 1.1 Library search — ✅ Done `P0`

There is currently no way to search entries you already own — `SearchModal` only queries external APIs, despite the README advertising collection search.

**Requirements**
- [x] Filter box in the topbar (or Ctrl+K palette) that narrows the visible grid/timeline as you type — *placed at the right end of the filter strip*
- [x] Matches against title, series name, and notes (case-insensitive)
- [x] Works in combination with existing status and series filters
- [ ] Optional stretch: global search across all categories with grouped results — *deferred; current search is per-category*

**Acceptance:** typing in the box instantly filters the current view; clearing it restores the full list. ✅

**Touches:** `src/App.jsx` (filter state), topbar UI, possibly `electron/db.js` if done at SQL level (not required — client-side filtering is fine at current scale).

**Implementation notes:**
- Added `search` state + `searchRef` in `src/App.jsx`; search box rendered in the filter strip (`.filter-search`).
- Filter matches title / series name / notes, case-insensitive, composed after the existing status + series filters.
- While a search is active the grid flattens series groups to solo cards so matches surface directly instead of hiding inside collapsed groups.
- Empty state shows "No matches for …" in both grid and timeline views; search clears on category switch and via the ✕ button / `Esc` in the field.
- Styling added to `src/index.css` (`.filter-search*`), accent-aware focus state, width expands on focus.
- The `searchRef` is in place for the Ctrl+K/Ctrl+F focus shortcut in task 1.4.

### 1.2 Sorting — ⬜ Not started `P0`

Entries are always returned `ORDER BY id DESC` (`electron/db.js` → `getEntries`).

**Requirements**
- [ ] Sort dropdown next to the view toggle: Recently added (default) · Title A–Z · Rating (high→low) · Date read/watched
- [ ] Sort preference persists per category (settings or localStorage)
- [ ] Series groups sort by their best-matching entry; solo entries interleave sensibly or groups stay pinned first (decide during implementation)

**Acceptance:** each sort option visibly reorders the grid; choice survives app restart.

### 1.3 Delete undo — ⬜ Not started `P0`

Entry deletion is instant and irreversible from both the card ✕ and the edit panel, while series deletion already gets a confirm dialog. Prefer undo over more confirm dialogs.

**Requirements**
- [ ] Deleting an entry shows a toast: "Deleted *Title* — Undo" (≈5s)
- [ ] Undo restores the entry with all fields (including series link, source linkage)
- [ ] Actual DB delete is deferred until toast expires, or re-insert on undo — either strategy is acceptable if source_id/series survive
- [ ] Edit-panel Delete uses the same flow

**Acceptance:** delete → undo round-trips an entry with no data loss.

### 1.4 Keyboard shortcuts & Esc-to-close — ⬜ Not started `P1`

Modals currently close only via backdrop click / ✕; there are no app shortcuts.

**Requirements**
- [ ] `Esc` closes SearchModal, AddEntryPanel, EditEntryPanel, ReleasesPanel, ConfirmDialog
- [ ] `Ctrl+N` opens Add Entry; `Ctrl+K` (or `Ctrl+F`) focuses library search (1.1)
- [ ] Focus returns to a sensible element after modal close

**Acceptance:** all listed shortcuts work; Esc never closes the app window itself.

### 1.5 Rating slider hover fix — ⬜ Not started `P1`

`onMouseEnter` on the slider (`EditEntryPanel.jsx`) silently assigns a rating when the cursor merely passes over the form.

**Requirements**
- [ ] Rating is only set by explicit interaction (click/drag/keyboard)
- [ ] Unrated state remains clearly distinguishable from rated

**Acceptance:** moving the mouse across the open edit panel never changes form state.

---

## Milestone 2 — Tracking depth

*Goal: make "In Progress" genuinely useful and each category feel native.*

### 2.1 Progress tracking — ⬜ Not started `P0` ⭐ headline feature

**Requirements**
- [ ] New columns: `progress` (int), `progress_total` (int, nullable) on `entries`
- [ ] Auto-fill `progress_total` from API where available (AniList episode counts are already returned and currently discarded)
- [ ] Edit panel: progress fields shown for in-progress entries, unit labeled per category (episodes / pages / hours)
- [ ] Card UI: thin progress bar + "7 / 24" label on in-progress entries
- [ ] Quick "+1" increment on the card (hover action) without opening the edit panel
- [ ] Reaching total prompts (or auto-suggests) marking as Completed

**Acceptance:** an in-progress anime shows episode progress on its card and can be incremented in one click.

**Touches:** `electron/db.js` (migration + CRUD), `EntryCard.jsx`, `EditEntryPanel.jsx`, `SearchModal.jsx` / `electron/api.js` (capture totals).

### 2.2 Per-category status wording — ⬜ Not started `P1`

"Reading" (`STATUS_SHORT` in `EntryCard.jsx`) and "Date Read" (edit panel) appear on movies and games.

**Requirements**
- [ ] Per-category verb map: book *Reading/Read*, anime & movie/TV *Watching/Watched*, game *Playing/Played*
- [ ] Applies to: card status chip, timeline status, edit panel date label, series group summary
- [ ] Falls back gracefully for future custom categories

**Acceptance:** no book-specific wording appears outside the Books category.

### 2.3 Separate description from notes — ⬜ Not started `P1`

Adding from search dumps the API synopsis into `notes` (`SearchModal.jsx` → `notes: r.description`), conflating marketing copy with personal thoughts.

**Requirements**
- [ ] New `description` column on `entries`; search-add writes synopsis there, leaves `notes` empty
- [ ] One-time migration heuristic is **not** required (existing notes stay as-is)
- [ ] Edit panel shows description read-only (collapsible) above the personal Notes field
- [ ] Card continues to prefer personal notes; may fall back to description

**Acceptance:** newly added entries have an empty Notes field; synopsis still visible in edit panel.

---

## Milestone 3 — Data confidence

*Goal: users can trust Chronicle with years of history.*

### 3.1 Stats / Insights page — ⬜ Not started `P1`

Promote the embryonic stat cards in Settings → Data to a real view.

**Requirements**
- [ ] New sidebar destination (or per-category tab): Insights
- [ ] Completed per year and per month (bar chart or heat strip)
- [ ] Rating distribution histogram; average rating per category and per series
- [ ] "This year vs last year" comparison
- [ ] All computed from local SQLite; no new dependencies required (SVG charts fine)

**Acceptance:** page renders correct counts against a known test dataset.

### 3.2 Export & backup — ⬜ Not started `P0`

Currently there's a "Clear all entries" danger button but no way to export or back up.

**Requirements**
- [ ] Settings → Data: "Export JSON" and "Export CSV" via native save dialog (all entries + series, all columns)
- [ ] "Back up database" button: copies the SQLite file to a chosen location
- [ ] "Restore from backup" with an explicit confirm (replaces current DB, relaunches or reloads)

**Acceptance:** export → clear all → restore round-trips the full library.

### 3.3 Import — ⬜ Not started `P2`

- [ ] Import Chronicle JSON (from 3.2)
- [ ] Stretch: Goodreads / MAL / Letterboxd CSV mappers (one per release, prioritized by demand)

**Acceptance:** importing a Chronicle JSON export into a fresh install reproduces the library.

---

## Milestone 4 — Category expansion

### 4.1 TV Shows category — ⬜ Not started `P1`

TMDB (already integrated for movies) has a TV search endpoint — mostly wiring.

**Requirements**
- [ ] New default category `tv` with icon + accent color
- [ ] `electron/api.js`: `searchTv` against TMDB `/search/tv` (reuses existing key)
- [ ] Release checker support (TMDB season data) — stretch
- [ ] Watching/Watched verbs (depends on 2.2), episode progress (synergy with 2.1)

**Acceptance:** can search, add, and track a TV show end-to-end with the existing TMDB key.

### 4.2 Manga category — ⬜ Not started `P2`

AniList (already integrated) supports manga with the same GraphQL API — near-free.

- [ ] New category `manga`; `searchManga` with `type: MANGA`
- [ ] Chapter/volume totals feed progress tracking (2.1)

### 4.3 Fully custom categories — ⬜ Not started `P2`

Settings currently only toggles/recolors the four hardcoded categories; `ICONS` in `App.jsx` is keyed to their IDs.

**Requirements**
- [ ] "Add category" in Settings: name, color, icon (curated icon set or emoji picker)
- [ ] Custom categories have no API search — Add Entry goes straight to the manual panel
- [ ] Deleting a custom category prompts for what happens to its entries
- [ ] Nav icons resolve dynamically (fallback icon for unknown IDs)

---

## Milestone 5 — Polish & power features

### 5.1 Series rename UI — ⬜ Not started `P1`

`renameSeries` already exists in `electron/db.js` + IPC + preload but nothing in the UI calls it.

- [ ] Rename affordance on the series sidebar row and/or series card header (e.g. double-click or context menu)
- [ ] Inline input with Enter/Escape, same pattern as "New series"

### 5.2 Re-watch / re-read logs — ⬜ Not started `P2`

One row per title means a rewatch overwrites the original date and rating.

- [ ] New `logs` table: `entry_id`, `date`, `rating`, `notes`
- [ ] Edit panel: "Log another watch/read" adds a log entry
- [ ] Timeline shows each log occurrence; card shows latest + count (e.g. "×3")
- [ ] Existing `date_read`/`rating` migrate to (or are treated as) the first log

### 5.3 Release inbox polish — ⬜ Not started `P2`

- [ ] Native Electron `Notification` when the daily scan finds new releases (respects existing notification settings)
- [ ] Panel splits "Out now" vs "Upcoming" (future `release_date`), with "releases in N days" labels

### 5.4 Tags / genre chips — ⬜ Not started `P2`

Search results already return `genres`, currently discarded.

- [ ] Store genres on add; render as chips on card/edit panel
- [ ] Clicking a chip filters the current view; user-defined tags as stretch

### 5.5 Compact list view — ⬜ Not started `P3`

- [ ] Third view toggle: dense rows (cover thumb, title, series, status, rating, date) for large collections

### 5.6 Light theme — ⬜ Not started `P3`

Palette in `src/index.css` is dark-only via `:root` variables — a variable swap gets most of the way.

- [ ] Theme toggle in Settings (dark default); audit hardcoded hexes outside `:root`

### 5.7 Smarter duplicate detection — ⬜ Not started `P3`

Duplicate guard is title-only per category (`electron/db.js` → `addEntry`), so same-title remakes can't coexist.

- [ ] Prefer `source` + `source_id` match when available; fall back to title+year, then title
- [ ] "Add anyway" escape hatch on duplicate warning

---

## Out of scope (for now)

- Cloud sync / accounts — Chronicle is deliberately local-first
- Social features (sharing, friends, public profiles)
- Mobile app
- Scrobbling / automatic detection of watched media

## Changelog

| Date | Change |
|------|--------|
| 2026-07-19 | Initial PRD created from UX/feature review |
| 2026-07-19 | 1.1 Library search implemented (title/series/notes filter in the filter strip) |
