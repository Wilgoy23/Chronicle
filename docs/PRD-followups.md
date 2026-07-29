# Chronicle — Follow-ups & Deferred Items

> Living document. Companion to [PRD.md](./PRD.md) — tracks items that were explicitly
> deferred (not forgotten) while closing out milestones 1–5. Update the **Status**
> column / checkboxes as work lands.
> Created: 2026-07-28

**Status legend:** `⬜ Not started` · `🟨 In progress` · `✅ Done` · `🚫 Won't do`

---

## Progress at a glance

| # | Item | Origin | Priority | Status |
|---|------|--------|----------|--------|
| 6.1 | Re-watch/re-read logs missing from export/import | 5.2 | P1 | ✅ |
| 6.2 | Edit existing entry's `year` | 5.7 | P2 | ✅ |
| 6.3 | Global cross-category search | 1.1 | P2 | ⬜ |
| 6.4 | Insights: per-series average rating | 3.1 | P3 | ⬜ |
| 6.5 | Insights: per-month heat strip | 3.1 | P3 | ⬜ |
| 6.6 | Non-Chronicle CSV import mappers (Goodreads/MAL/Letterboxd) | 3.3 | P3 | ⬜ |
| 6.7 | Light theme: low-alpha white borders/scrollbar tints | 5.6 | P3 | ⬜ |

---

### 6.1 Re-watch/re-read logs missing from export/import — ✅ Done `P1`

**Data-loss risk.** `exportData()` / `importData()` (`electron/db.js`) only ever
touched `entries` and `series` — the `logs` table (added in 5.2 for re-watch/re-read
history) was never read or written. A JSON export, or a DB backup/restore, preserved
occurrence #1 (`entries.date_read`/`rating`) but silently dropped every additional
logged occurrence.

**Requirements**
- [x] `exportData()` includes a `logs` array (all columns, keyed by `entry_id`)
- [x] `importData()` remaps `entry_id` on inserted logs the same way `series_id` is
      remapped today (import assigns new entry ids, so logs must follow their
      re-inserted parent, not the original id)
- [x] `backupTo()` / restore already copy the whole SQLite file, so logs already
      survive a **binary DB backup** — confirmed explicitly with a test; this task
      scoped to the **JSON** export/import path only
- [x] Existing exports (without a `logs` key) still import cleanly — a missing key
      is treated as "no logs," not an error

**Acceptance:** export a library with an entry that has 2+ re-watch logs → import
into a fresh DB → the entry shows the same `×N` count and full history in the edit
panel. ✅

**Implementation notes:**
- `exportData()` (`electron/db.js`) now also returns `logs: [{ id, entry_id, date,
  rating, notes }]`, ordered by `entry_id, id`, keyed by the **export-time** entry id.
- `importData()` builds an `idMap` (export-time entry id → freshly inserted entry id)
  while inserting entries, then walks `data.logs` inside the same transaction,
  remapping each log's `entry_id` through that map before inserting. A log whose
  parent entry was skipped as a merge-duplicate has no map entry and is silently
  dropped — consistent with the entry itself not being imported, and the *original*
  entry's own logs are untouched since only the export's copy is discarded.
- `data.logs` is read defensively (`Array.isArray(data.logs) ? data.logs : []`), so a
  pre-6.1 export with no `logs` key imports exactly as before, just with 0 logs.
- Return value gains `logsImported`; Settings' import success toast now appends
  ", N re-watch/re-read logs" when any carried over (`src/components/SettingsPage.jsx`).
- CSV export was deliberately left alone — it's a flat one-row-per-entry dump and
  logs are a nested one-to-many concept; out of scope per this item.
- The binary backup/restore path (`backupTo`/manual file copy) copies the whole
  SQLite file, so it already preserved logs with no code change — added a test
  assertion to the existing 3.2 round-trip test to make that explicit rather than
  assumed.

**Verification.** `npm test` → **133/133 pass** (+4: `exportData` includes logs;
`importData` round-trip remaps logs to the new entry id with correct `log_count`;
pre-6.1 export missing the `logs` key imports cleanly with `logsImported: 0`;
dupe-skipped entry's logs are dropped without orphaning or touching the original's
logs; plus a log assertion added to the existing binary backup/restore test).
`vite build` clean (220.63 kB JS / 68.87 kB CSS). better-sqlite3 rebuilt back to the
Electron ABI (`@electron/rebuild -f -o better-sqlite3`, "✔ Rebuild Complete"). GUI
not driven headlessly — change is DB-layer + a one-line toast update.

### 6.2 Edit existing entry's `year` — ✅ Done `P2`

`year` (added in 5.7 to power the title+year duplicate-detection tier) was captured
only on add — `AddEntryPanel`'s Year field and the API search path — with no way to
correct or add it afterward. `EditEntryPanel.jsx` had no `year` field at all.

**Requirements**
- [x] Add a `year` number input to `EditEntryPanel`, same pattern as other optional
      metadata fields
- [x] `updateEntry` round-trips `year` (the column was missing from the update
      payload builder — added, following the existing preserve-on-omit pattern)

**Acceptance:** editing an entry added without a year, setting one, and saving
persists it — reflected immediately in future duplicate-detection checks. ✅

**Implementation notes:**
- `updateEntry` (`electron/db.js`) gains a `year` param, following the exact
  preserve-on-omit pattern already used for `progress`/`genres`: omitted → keeps the
  current value (so drag-to-series, which only sends `series_id`, doesn't wipe it);
  `''` or `null` → clears it; a number → sets it. The `UPDATE` statement and its
  `SELECT` (for reading `cur.year`) both gained the column.
- `EditEntryPanel.jsx`: form state now seeds `year` from `entry.year`, a new Year
  input sits next to Date in the existing two-col row (Cover URL, previously paired
  with Date, moved to its own full-width row below), and `handleSubmit` forwards
  `year: form.year !== '' ? Number(form.year) : null` — the same on-submit shape
  `AddEntryPanel` already used on add.
- No IPC/preload change needed — `db:updateEntry` already forwards the whole payload
  object untouched.

**Verification.** `npm test` → **136/136 pass** (+3: set year on an entry added
without one, clear year via empty string, preserve year when a caller omits it e.g.
drag-to-series). `vite build` clean (220.98 kB JS / 68.87 kB CSS). better-sqlite3
rebuilt back to the Electron ABI (`@electron/rebuild -f -o better-sqlite3`,
"✔ Rebuild Complete"). GUI not driven headlessly — change mirrors the proven
progress/genres edit-field pattern.

### 6.3 Global cross-category search — `P2`

Deferred stretch from 1.1. Search is scoped to the active category's filter strip;
there's no way to search "did I ever log this title" across Books/Anime/Movies/etc.
at once.

**Requirements**
- [ ] A global search entry point (e.g. `Ctrl+Shift+K`, or a mode toggle inside the
      existing Ctrl+K search box) that queries all categories
- [ ] Results grouped by category, each result jumps to that category + opens the
      entry's edit panel
- [ ] Reuses the existing match rule (title / series name / notes, case-insensitive)

**Acceptance:** typing a title that exists only in a non-active category surfaces it
with a visible category grouping, and selecting it switches tabs and opens the entry.

**Touches:** `src/App.jsx` (search state generalization), a new results-list UI
(modal or expanded panel), `electron/db.js` if server-side filtering becomes worth it
at larger scale (client-side is likely still fine).

### 6.4 Insights: per-series average rating — `P3`

Deferred from 3.1. The category-level average-rating bars exist; a per-series
breakdown (e.g. "your average rating for the *One Piece* series is 9.2") does not.

**Requirements**
- [ ] Extend `computeStats` (`src/insightsStats.js`) with a per-series average,
      series with only unrated entries excluded (mirrors the existing per-category rule)
- [ ] Surface as a sortable list/table in `InsightsPage.jsx` (likely below the
      per-category bars), capped or paginated for users with many series

**Acceptance:** a known test dataset with multiple series produces correct per-series
averages, unit-tested in `tests/unit/insightsStats.test.js` the same way the existing
per-category case is.

**Touches:** `src/insightsStats.js`, `src/components/InsightsPage.jsx` (or wherever
Insights UI currently lives), test file.

### 6.5 Insights: per-month heat strip — `P3`

Deferred from 3.1. The per-year completed-count bar chart exists; a finer-grained
month-by-month heat strip (GitHub-contributions-style) does not.

**Requirements**
- [ ] `computeStats` gains a per-month-per-year bucket for completed entries
- [ ] Render as a heat strip (color intensity by count) under or beside the per-year
      chart, reusing the dataviz-skill single-hue accent approach already used
      elsewhere on the page

**Acceptance:** a known test dataset produces correct per-month counts; visually
distinguishes months with 0 vs. many completions.

**Touches:** `src/insightsStats.js`, `src/components/InsightsPage.jsx`, test file.

### 6.6 Non-Chronicle CSV import mappers — `P3`

Deferred from 3.3. Only Chronicle's own JSON export can be imported today. Each
external source needs its own column-mapping layer on top of the existing
`importData` core.

**Requirements**
- [ ] Goodreads CSV → Books (title, author→notes?, rating, date read, shelf→status)
- [ ] MyAnimeList (MAL) export → Anime/Manga
- [ ] Letterboxd CSV → Movies
- [ ] Each mapper normalizes its source format into the shape `importData` already
      accepts, then reuses the existing merge/dedupe logic unchanged
- [ ] Ship incrementally, one source per release, prioritized by actual demand —
      do not build all three speculatively in one pass

**Acceptance:** a real export file from each service, run through its mapper,
produces sensible Chronicle entries with correct status/rating/date mapping.

**Touches:** new `electron/importers/{goodreads,mal,letterboxd}.js`, IPC + Settings UI
to pick a source format, `electron/db.js` (`importData` reused as-is).

### 6.7 Light theme: low-alpha white borders/scrollbar tints — `P3`

Deferred from 5.6. The main light-theme pass fixed all body-text and surface
regressions; a cosmetic gap remains where low-alpha `rgba(255,255,255,α)` borders
and scrollbar tints (designed against the dark background) go faint-to-invisible on
light backgrounds. Not a readability bug — no text is affected — but focus/hover
outlines read as softer than intended in light mode.

**Requirements**
- [ ] Audit remaining low-alpha white literals outside `:root` in `src/index.css`
- [ ] Introduce theme-aware border/scrollbar tokens (mirrors the `--text-strong` /
      `--raise` / `--glass-bg` approach from 5.6) or flip the alpha direction under
      `:root[data-theme="light"]`

**Acceptance:** hover/focus outlines and scrollbars are visibly present (not just
technically non-zero-alpha) in light mode, with no dark-mode regression.

**Touches:** `src/index.css` only.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-28 | Document created — captures items explicitly deferred during PRD.md milestones 1–5, prioritized by data-loss risk first (6.1), then usability gaps, then cosmetic/stretch items |
| 2026-07-28 | 6.1 Re-watch/re-read logs now included in JSON export/import (`logs` array, `entry_id` remapped via id map, backward-compatible with pre-6.1 exports); binary backup/restore confirmed to already preserve logs — 133/133 tests |
| 2026-07-28 | 6.2 `year` is now editable on existing entries (`EditEntryPanel` gains a Year field; `updateEntry` preserve-on-omit pattern extended to `year`) — 136/136 tests |
