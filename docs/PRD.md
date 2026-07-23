# Chronicle — Product Requirements & Roadmap

> Living document. Update the **Status** column / checkboxes as work lands.
> Last updated: 2026-07-22

**Status legend:** `⬜ Not started` · `🟨 In progress` · `✅ Done` · `🚫 Won't do`

---

## Overview

Chronicle is a local-first desktop media tracker (Electron + React + SQLite) for books, anime, movies, and games. Users log entries with status (completed / in progress / planned), ratings, notes, and series groupings; add items via external APIs (Hardcover, AniList, TMDB, RAWG); and get notified about new releases in series they follow.

This document tracks planned UX fixes and features, grouped into milestones. Each item has acceptance criteria so "done" is unambiguous.

## Progress at a glance

| # | Item | Milestone | Priority | Status |
|---|------|-----------|----------|--------|
| 1.1 | Library search | M1 | P0 | ✅ |
| 1.2 | Sorting | M1 | P0 | ✅ |
| 1.3 | Delete undo | M1 | P0 | ✅ |
| 1.4 | Keyboard shortcuts & Esc-to-close | M1 | P1 | ✅ |
| 1.5 | Rating slider hover fix | M1 | P1 | ✅ |
| 2.1 | Progress tracking | M2 | P0 | ✅ |
| 2.2 | Per-category status wording | M2 | P1 | ✅ |
| 2.3 | Separate description from notes | M2 | P1 | ✅ |
| 3.1 | Stats / Insights page | M3 | P1 | ✅ |
| 3.2 | Export & backup | M3 | P0 | ✅ |
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

### 1.2 Sorting — ✅ Done `P0`

Entries are always returned `ORDER BY id DESC` (`electron/db.js` → `getEntries`).

**Requirements**
- [x] Sort dropdown next to the view toggle: Recently added (default) · Title A–Z · Rating (high→low) · Date read/watched
- [x] Sort preference persists per category (settings or localStorage) — *localStorage `chronicle.sort`, keyed by category id*
- [x] Series groups sort by their best-matching entry; solo entries interleave sensibly or groups stay pinned first — *decided: groups stay pinned first, ordered by their best-matching entry*

**Acceptance:** each sort option visibly reorders the grid; choice survives app restart. ✅

**Implementation notes:**
- `SORT_OPTIONS` + `sortEntries()` helper in `src/App.jsx`; `recent` preserves DB order (id DESC), others return a sorted copy.
- Ratings sort nulls-last; date sort uses `date_read` falling back to `created_at`, newest first.
- `filteredEntries` is sorted *before* grouping, so series groups order by their best-matching (first, post-sort) entry and entries within a group are sorted too; groups remain pinned above solo cards (existing layout).
- Sort control is a styled native `<select>` in the topbar (`.sort-control`), shown only in grid view since the timeline sorts by date internally; hidden on the narrowest breakpoint alongside the view toggle.
- Preference persists per category via `loadSort()` / `changeSort()` in localStorage.

### 1.3 Delete undo — ✅ Done `P0`

Entry deletion is instant and irreversible from both the card ✕ and the edit panel, while series deletion already gets a confirm dialog. Prefer undo over more confirm dialogs.

**Requirements**
- [x] Deleting an entry shows a toast: "Deleted *Title* — Undo" (≈5s)
- [x] Undo restores the entry with all fields (including series link, source linkage)
- [x] Actual DB delete is deferred until toast expires — *chosen strategy: DB row untouched until commit, so the same id/series/source survive undo*
- [x] Edit-panel Delete uses the same flow

**Acceptance:** delete → undo round-trips an entry with no data loss. ✅

**Implementation notes:**
- Deferred-delete flow in `src/App.jsx`: `handleDelete` removes the entry from UI state and starts a 5s timer; `flushPendingDelete` commits the DB delete on expiry; `undoDelete` splices the entry back at its original index and cancels the timer.
- The DB row is never touched until commit, so undo restores the exact record (id, `series_id`, `source`/`source_id`) — no re-insert / id change.
- One undo in flight at a time: a second delete (or a category switch) commits the previous pending delete first, so no deletes are silently lost.
- `EditEntryPanel` no longer deletes directly — it signals the parent and closes, routing through the same undo flow. Card ✕, timeline, and series-group deletes already funnelled through `onDelete`.
- Toast UI (`.undo-toast`) is fixed bottom-center with a slide-up animation; Undo button uses the active category accent; ✕ dismisses (commits) immediately.
- Fail-safe: if the app closes during the 5s window the entry simply isn't deleted (never lost). Bulk "Clear all entries" in Settings is intentionally excluded from the undo flow.

### 1.4 Keyboard shortcuts & Esc-to-close — ✅ Done `P1`

Modals currently close only via backdrop click / ✕; there are no app shortcuts.

**Requirements**
- [x] `Esc` closes SearchModal, AddEntryPanel, EditEntryPanel, ReleasesPanel, ConfirmDialog
- [x] `Ctrl+N` opens Add Entry; `Ctrl+K` (or `Ctrl+F`) focuses library search (1.1)
- [x] Focus returns to a sensible element after modal close — *closing unmounts the overlay; focus falls back to document body (acceptable default)*

**Acceptance:** all listed shortcuts work; Esc never closes the app window itself. ✅

**Implementation notes:**
- Single `window` keydown listener in `src/App.jsx`, re-subscribed on the relevant open-state deps.
- `Esc` closes the topmost overlay by priority (ConfirmDialog → Edit → AddEntry → Search → Releases) and does nothing when none is open, so it never fights the filter-search field's own Esc-to-clear.
- `Ctrl/Cmd+N` opens Add Entry, `Ctrl/Cmd+K` and `Ctrl/Cmd+F` focus the library search field (via the `searchRef` left in place by 1.1); both are gated to the collection page with no overlay open and `preventDefault` the browser/Electron defaults.

### 1.5 Rating slider hover fix — ✅ Done `P1`

`onMouseEnter` on the slider (`EditEntryPanel.jsx`) silently assigns a rating when the cursor merely passes over the form.

**Requirements**
- [x] Rating is only set by explicit interaction (click/drag/keyboard)
- [x] Unrated state remains clearly distinguishable from rated — *no value label / clear button until rated; slider rests at 5 as a neutral position*

**Acceptance:** moving the mouse across the open edit panel never changes form state. ✅

**Implementation notes:**
- Removed `onMouseEnter`; replaced with `onPointerDown` that commits the displayed default (5) only on an explicit press, so a click landing exactly on 5 (which fires no `change` event) still registers a rating.
- Arrow / Home / End keys move the value off the default and fire `onChange` on their own, so keyboard rating needs no special handling.

---

## Milestone 2 — Tracking depth

*Goal: make "In Progress" genuinely useful and each category feel native.*

### 2.1 Progress tracking — ✅ Done `P0` ⭐ headline feature

**Requirements**
- [x] New columns: `progress` (int), `progress_total` (int, nullable) on `entries`
- [x] Auto-fill `progress_total` from API where available (AniList episode counts are already returned and currently discarded)
- [x] Edit panel: progress fields shown for in-progress entries, unit labeled per category (episodes / pages / hours)
- [x] Card UI: thin progress bar + "7 / 24" label on in-progress entries
- [x] Quick "+1" increment on the card (hover action) without opening the edit panel
- [x] Reaching total prompts (or auto-suggests) marking as Completed — *chosen: auto-completes and stamps today's date if none set*

**Acceptance:** an in-progress anime shows episode progress on its card and can be incremented in one click. ✅

**Touches:** `electron/db.js` (migration + CRUD), `EntryCard.jsx`, `EditEntryPanel.jsx`, `SearchModal.jsx` / `electron/api.js` (capture totals).

**Implementation notes:**
- Migration adds `progress INTEGER DEFAULT 0` and `progress_total INTEGER`; both threaded through `ENTRY_SELECT`, `addEntry`, and `updateEntry`.
- **`updateEntry` preserves progress when a caller omits it** (merges against the current row) so drag-to-series — which only sends `series_id` — never wipes progress. Covered by a unit test.
- Progress UI is scoped to `status === 'in_progress' && progress_total > 0`, so movies (no episodic total) get no progress chrome unless a total is set manually. Units per category via `PROGRESS_UNITS`/`progressUnit()` in `App.jsx` (books→pages, anime/tv→episodes, game→hours, manga→chapters).
- Card: thin accent bar + "7 / 24" label pinned to the cover bottom; "+1" button reveals on hover (always visible on touch). Timeline card shows a read-only "7 / 24".
- Quick +1 (`handleIncrement` in `App.jsx`) reuses `updateEntry`; reaching the total auto-flips status to Completed and stamps today's date when none was set.
- Edit panel shows current / total number inputs with the category unit when status is In Progress.
- AniList `episodes` seeds `progress_total` on search-add (`SearchModal.jsx`); other sources leave it null.

**Verification:** `vite build` clean; `npm test` → 54/54 pass (4 new tests: add stores progress/total, defaults 0/null, update mutates, and update preserves progress on omit). GUI not driven (needs a display) — DB layer covered by tests, UI wiring is straightforward React.

### 2.2 Per-category status wording — ✅ Done `P1`

"Reading" (`STATUS_SHORT` in `EntryCard.jsx`) and "Date Read" (edit panel) appear on movies and games.

**Requirements**
- [x] Per-category verb map: book *Reading/Read*, anime & movie/TV *Watching/Watched*, game *Playing/Played*
- [x] Applies to: card status chip, timeline status, edit panel date label, series group summary — *plus the manual Add panel's date label*
- [x] Falls back gracefully for future custom categories — *`categoryVerbs()` returns `{ active: 'In Progress', past: 'Finished' }` for unknown ids*

**Acceptance:** no book-specific wording appears outside the Books category. ✅

**Implementation notes:**
- `CATEGORY_VERBS` + `categoryVerbs(category)` in `App.jsx` (`active` for in-progress wording, `past` for the "Date …" label).
- Card status chip shows the active verb for in-progress; timeline status and series-group summary likewise; edit + add panels label the date input "Date Read / Watched / Played".
- Completed → "Done" (card) / "Completed" (timeline) and Planned stay category-neutral by design.

### 2.3 Separate description from notes — ✅ Done `P1`

Adding from search dumps the API synopsis into `notes` (`SearchModal.jsx` → `notes: r.description`), conflating marketing copy with personal thoughts.

**Requirements**
- [x] New `description` column on `entries`; search-add writes synopsis there, leaves `notes` empty
- [x] One-time migration heuristic is **not** required (existing notes stay as-is)
- [x] Edit panel shows description read-only (collapsible) above the personal Notes field
- [x] Card continues to prefer personal notes; may fall back to description

**Acceptance:** newly added entries have an empty Notes field; synopsis still visible in edit panel. ✅

**Implementation notes:**
- Migration adds `description TEXT`; included in `ENTRY_SELECT` and `addEntry`. `updateEntry` deliberately does **not** touch `description`, so the read-only synopsis survives edits.
- `SearchModal` now writes `description: r.description` and `notes: ''`.
- Edit panel renders a collapsible `<details>` "Synopsis" above Notes (`.edit-desc`). Card shows `entry.notes || entry.description`, so old entries (synopsis still in notes) and new ones (synopsis in description) both display a blurb.

---

## Milestone 3 — Data confidence

*Goal: users can trust Chronicle with years of history.*

### 3.1 Stats / Insights page — ✅ Done `P1`

Promote the embryonic stat cards in Settings → Data to a real view.

**Requirements**
- [x] New sidebar destination (or per-category tab): Insights — *added to the sidebar bottom, above Settings*
- [x] Completed per year (bar chart) + "this year vs last year" — *per-month heat strip deferred; per-year covers the acceptance*
- [x] Rating distribution histogram; average rating per category — *per-series average deferred to a later pass*
- [x] "This year vs last year" comparison
- [x] All computed from local SQLite; no new dependencies required (CSS/SVG charts)

**Acceptance:** page renders correct counts against a known test dataset. ✅ (`tests/unit/insightsStats.test.js`, 10 cases)

**Implementation notes:**
- New `Insights` page (`page === 'insights'`) with its own topbar + Back, reached from a sidebar-bottom nav item; `InsightsPage.jsx` loads all entries via `window.db.getEntries()`.
- Stats logic extracted to a pure module `src/insightsStats.js` (`computeStats(entries, catList, now)`) so it's unit-testable without the React/DOM tree; `now` is injectable for stable year assertions.
- KPI tiles (total / completed / in-progress / planned / avg rating), a this-year-vs-last-year card with signed delta, a completed-per-year bar chart, a 1–10 rating histogram, and average-rating-by-category horizontal bars.
- **dataviz skill applied:** ran the palette validator on the four category colors — they FAIL CVD separation (blue↔purple ΔE 3.7 deutan), so the per-category chart never relies on color alone: each bar carries its category **name as a direct text label**, color only reinforces. Single-hue charts (per-year, histogram) use the active category accent — no CVD concern, no legend needed. Marks follow the spec: thin bars, 4px rounded data-ends, recessive baseline, per-bar hover tooltips, value labels.
- Deferred (noted for a follow-up): per-month heat strip, average rating per **series**, and a table-view/CSV of the underlying numbers.

**Verification:** `vite build` clean; `computeStats` covered by 10 unit tests (totals/statuses, per-year buckets incl. undated-completed, this/last-year, 10-bin histogram, per-category averages sorted & unrated-excluded, overall average, empty case). Live GUI not screenshotted (Electron needs the running app/display); layout reuses proven `.stat-card`-style fl/grid patterns.

### 3.2 Export & backup — ✅ Done `P0`

Currently there's a "Clear all entries" danger button but no way to export or back up.

**Requirements**
- [x] Settings → Data: "Export JSON" and "Export CSV" via native save dialog (all entries + series, all columns)
- [x] "Back up database" button: copies the SQLite file to a chosen location — *uses SQLite's online backup API, consistent even mid-write*
- [x] "Restore from backup" with an explicit confirm (replaces current DB, relaunches or reloads)

**Acceptance:** export → clear all → restore round-trips the full library. ✅ (`db.test.js` round-trip test)

**Implementation notes:**
- New `window.data` bridge (`exportJson` / `exportCsv` / `backup` / `restore`); handlers in `electron/main.js` using native save/open dialogs.
- `db.js` gains `exportData()` (versioned `{format, version, exportedAt, entries, series}` snapshot, all columns + joined series name), `getAllSeries()`, `getDbPath()`, `closeDb()`, `backupTo()` (online backup API), and `validateBackupFile()`.
- CSV serialization extracted to a pure `electron/csv.js` (RFC-ish quoting/escaping) so it's reusable and unit-tested.
- **Restore is defensive:** validates the picked file is a real SQLite DB with an `entries` table *before* touching anything; shows a native warning confirm; writes a `.pre-restore` safety copy of the current DB, overwrites, re-inits (runs migrations on the restored file), then reloads the renderer. On any failure it rolls back to the safety copy.
- Settings → Data now has an "Export & backup" row with per-action feedback (ok/error), plus the pre-existing "Clear all" danger zone.

**Verification:** `npm test` → **76/76 pass**, including the db-backed round-trip (populate → `backupTo` → validate → delete all → close/copy/re-init → library reproduced, series intact), `validateBackupFile` rejecting a non-DB file, the `exportData` snapshot shape, and 6 CSV cases (null→empty, comma/quote/newline escaping, column order, CRLF). This run also confirmed the earlier 2.1/2.3/3.1 db tests (previously blocked by the app's file lock) all green. GUI dialogs not driven headlessly.

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
| 2026-07-20 | 1.2 Sorting implemented (recent / title / rating / date, persisted per category) |
| 2026-07-20 | 1.3 Delete undo implemented (deferred DB delete + 5s undo toast) |
| 2026-07-20 | 1.4 Keyboard shortcuts + Esc-to-close; 1.5 rating slider hover fix — **Milestone 1 complete** |
| 2026-07-21 | 2.1 Progress tracking implemented (schema + card bar/+1 + edit fields + AniList auto-fill + auto-complete) |
| 2026-07-21 | 2.2 Per-category status wording; 2.3 separate description from notes — **Milestone 2 complete** |
| 2026-07-22 | 3.1 Stats / Insights page (KPIs, per-year bars, rating histogram, per-category averages) |
| 2026-07-22 | 3.2 Export & backup (JSON/CSV export, online-backup, defensive restore) — 76/76 tests |
