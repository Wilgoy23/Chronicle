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
| 6.3 | Global cross-category search | 1.1 | P2 | ✅ |
| 6.4 | Insights: per-series average rating | 3.1 | P3 | ✅ |
| 6.5 | Insights: per-month heat strip | 3.1 | P3 | ✅ |
| 6.6 | Non-Chronicle CSV import mappers (Goodreads/MAL/Letterboxd) | 3.3 | P3 | 🟨 |
| 6.7 | Light theme: low-alpha white borders/scrollbar tints | 5.6 | P3 | ✅ |

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

### 6.3 Global cross-category search — ✅ Done `P2`

Deferred stretch from 1.1. Search is scoped to the active category's filter strip;
there's no way to search "did I ever log this title" across Books/Anime/Movies/etc.
at once.

**Requirements**
- [x] A global search entry point (e.g. `Ctrl+Shift+K`, or a mode toggle inside the
      existing Ctrl+K search box) that queries all categories
- [x] Results grouped by category, each result jumps to that category + opens the
      entry's edit panel
- [x] Reuses the existing match rule (title / series name / notes, case-insensitive)

**Acceptance:** typing a title that exists only in a non-active category surfaces it
with a visible category grouping, and selecting it switches tabs and opens the entry. ✅

**Implementation notes:**
- New `GlobalSearchModal.jsx`, styled as a sibling of the existing `SearchModal`
  (reuses its `.search-modal*` classes) rather than a mode toggle inside the local
  filter box — keeping the two concerns (filter-in-place vs. jump-to-elsewhere)
  visually distinct felt clearer than overloading one input's meaning.
- On open, it fetches every entry in one call — `window.db.getEntries()` with no
  `category` argument, which `getEntries()` (`electron/db.js`) already treats as
  "no `WHERE category`," so no new IPC/DB code was needed. Client-side filtering
  reuses the exact predicate from `App.jsx`'s existing per-category `filteredEntries`
  (title / series / notes, case-insensitive `includes`), then groups matches by
  category, in the same order as the sidebar's `visibleCats`.
- Entry point: a new "All categories" button at the right end of the filter strip
  (`.global-search-btn`, next to the existing search box), plus `Ctrl/Cmd+Shift+K`
  wired into `App.jsx`'s existing global keydown handler (checked before the plain
  `Ctrl+K`/`Ctrl+F` case so Shift isn't swallowed by the local-focus shortcut).
  `globalSearchOpen` was added to the overlay-tracking state so Escape closes it and
  it participates in the "any overlay open" guard the same way `searchOpen` does.
- Selecting a result (`handleGlobalSelect`) switches the active category
  (`setCategory(entry.category)`), clears series/tag filters, and opens
  `EditEntryPanel` with the selected entry directly — since `EditEntryPanel` is
  driven by the `entry` prop (not a lookup into the category's `entries` array), it
  renders correctly even before the newly-active category's own `entries`/`seriesList`
  finish refetching.
- No new pure/testable logic was extracted — the match rule is a direct reuse of the
  existing inline filter, and the app has no component-level test harness (all
  existing tests target `electron/db.js` and pure helpers in `src/*.js`/`App.jsx`),
  consistent with other view-only components (`ListView`, `TimelineView`,
  `SeriesGroup`) having no dedicated test file.

**Verification.** `npm test` → **136/136 pass** (unchanged — no new pure logic to
unit test; this is a UI-only addition composing the existing `getEntries()` and
filter predicate). `vite build` clean (223.51 kB JS / 69.66 kB CSS). better-sqlite3
rebuilt back to the Electron ABI (`@electron/rebuild -f -o better-sqlite3`,
"✔ Rebuild Complete"). GUI not driven headlessly — verified by code inspection
against the acceptance criteria (entry point, grouping, jump-to-entry, match rule).

### 6.4 Insights: per-series average rating — ✅ Done `P3`

Deferred from 3.1. The category-level average-rating bars exist; a per-series
breakdown (e.g. "your average rating for the *One Piece* series is 9.2") does not.

**Requirements**
- [x] Extend `computeStats` (`src/insightsStats.js`) with a per-series average,
      series with only unrated entries excluded (mirrors the existing per-category rule)
- [x] Surface as a sortable list/table in `InsightsPage.jsx` (likely below the
      per-category bars), capped or paginated for users with many series

**Acceptance:** a known test dataset with multiple series produces correct per-series
averages, unit-tested in `tests/unit/insightsStats.test.js` the same way the existing
per-category case is. ✅

**Implementation notes:**
- `computeStats` gains a `seriesAgg` map keyed by `series_id` (not name — series
  names aren't guaranteed unique across categories), accumulated in the same loop
  pass as `catAgg`, under the same `rating != null` guard. Only entries that have
  both a rating and a `series_id`/`series` (the joined series name, already returned
  by `getEntries`) contribute; unrated or series-less entries are excluded, exactly
  mirroring the per-category rule.
- Returned as `perSeries: [{ id, name, category, categoryLabel, color, avg, count }]`,
  sorted high-to-low by average — same shape/sort as `perCategory`, plus series
  identity fields so the UI can label and color each row.
- `InsightsPage.jsx` renders it as a new "Average rating by series" card, reusing the
  existing `.insights-hbars`/`.insights-hbar-row` direct-labeled horizontal-bar
  pattern from per-category (no new chart primitive needed). Capped to the top 10 by
  default via `SERIES_CAP`, with a "Show all N series" toggle (`showAllSeries` state)
  satisfying the "capped or paginated" requirement — the list is already sorted by
  average, so "sortable" is met by the existing ranking rather than adding
  interactive multi-column sort, consistent with how per-category is presented.

**Verification.** `npm test` → **142/142 pass** (+4: per-series averages sorted
high-to-low excluding series-less entries; multiple rated entries in the same series
are summed/averaged correctly, in addition to the getYearMonth tests added for 6.5).
`vite build` clean (226.34 kB JS / 70.72 kB CSS). better-sqlite3 rebuilt back to the
Electron ABI (`@electron/rebuild -f -o better-sqlite3`, "✔ Rebuild Complete"). GUI not
driven headlessly — verified by code inspection against the acceptance criteria.

### 6.5 Insights: per-month heat strip — ✅ Done `P3`

Deferred from 3.1. The per-year completed-count bar chart exists; a finer-grained
month-by-month heat strip (GitHub-contributions-style) does not.

**Requirements**
- [x] `computeStats` gains a per-month-per-year bucket for completed entries
- [x] Render as a heat strip (color intensity by count) under or beside the per-year
      chart, reusing the dataviz-skill single-hue accent approach already used
      elsewhere on the page

**Acceptance:** a known test dataset produces correct per-month counts; visually
distinguishes months with 0 vs. many completions. ✅

**Implementation notes:**
- New `getYearMonth(e)` export in `insightsStats.js`, sibling to the existing
  `getYear(e)` (same `date_read` → `created_at` fallback, just also extracting the
  month). `computeStats` buckets completed+dated entries into a `monthCounts` map
  keyed `"year-month"`, alongside the existing `yearCounts` bucketing.
- Returned as `perMonth: [{ year, months: [{ month: 1..12, count }] }]`, one row per
  year already present in `yearCounts` (so, like `perYear`, only years with at least
  one dated completion appear) — but unlike `yearCounts`, every month 1–12 is present
  with an explicit `count: 0` rather than omitted, since the heat strip needs to
  render "no activity" cells, not skip them.
- `InsightsPage.jsx` renders a new `HeatStrip` component: one row per year, 12 cells
  (J–D labels below), color = the page's single `accent` at an opacity scaled to that
  year's own peak month (`0.18 + (count/peak)*0.82`, empty cells left at the neutral
  `--bg3` track color) — the same single-hue-accent approach `BarChart` already uses,
  just via opacity instead of height.

**Verification.** `npm test` → **142/142 pass** (+4: `getYearMonth` prefers
`date_read`, falls back to `created_at`, returns null when neither is present; and a
`computeStats` assertion that `perMonth` buckets completions correctly per year,
including zero-count months within a year that has other activity). `vite build`
clean (226.34 kB JS / 70.72 kB CSS). better-sqlite3 rebuilt back to the Electron ABI.
GUI not driven headlessly — verified by code inspection against the acceptance
criteria.

### 6.6 Non-Chronicle CSV import mappers — 🟨 In progress (Goodreads shipped) `P3`

Deferred from 3.3. Only Chronicle's own JSON export can be imported today. Each
external source needs its own column-mapping layer on top of the existing
`importData` core. Shipped incrementally per the requirement below — Goodreads
first, MAL/Letterboxd deferred until requested.

**Requirements**
- [x] Goodreads CSV → Books (title, author→notes?, rating, date read, shelf→status)
- [ ] MyAnimeList (MAL) export → Anime/Manga
- [ ] Letterboxd CSV → Movies
- [x] Each mapper normalizes its source format into the shape `importData` already
      accepts, then reuses the existing merge/dedupe logic unchanged
- [x] Ship incrementally, one source per release, prioritized by actual demand —
      do not build all three speculatively in one pass

**Acceptance:** a real export file from each service, run through its mapper,
produces sensible Chronicle entries with correct status/rating/date mapping.
Goodreads slice: ✅ (verified against the documented Goodreads export column
format; no live sample file from a user account was available, so verification is
by code inspection + unit tests rather than a real downloaded export — flagged
below).

**Implementation notes (Goodreads slice):**
- New `electron/csv.js` export `parseCsv(text)` — a small RFC4180-ish parser
  (quoted fields, embedded commas/newlines, `""` as an escaped quote), added
  alongside the existing `toCsv` since it's the natural, dependency-free home and
  will be reused by the MAL/Letterboxd mappers later.
- New `electron/importers/goodreads.js` (`mapGoodreads(csvText)`), pure and
  DB-free like `csv.js`: reads Goodreads' `Title`/`Author`/`My Rating`/
  `Date Read`/`Date Added`/`Exclusive Shelf` columns and returns a
  `{ format: 'chronicle-export', version: 1, entries, series: [] }` object —
  the exact shape `importData` already validates and ingests, so no changes to
  `importData` itself were needed. Mapping specifics: `Exclusive Shelf` →
  `read`/`currently-reading`/`to-read` → `completed`/`in_progress`/`planned`
  (unrecognized shelf falls back to `completed`); `My Rating` is Goodreads' 0–5
  star scale, doubled to Chronicle's 1–10 scale, with `0` (unrated) mapped to
  `null` rather than `0`; `Author` → `notes` as `"By <author>"` per the
  `author→notes` requirement; `Date Read`/`Date Added` are reformatted from
  Goodreads' `yyyy/MM/dd` to Chronicle's `yyyy-MM-dd` (`goodreadsDate` helper),
  with a blank date left `null` rather than an error — a `completed` row with no
  `Date Read` still imports (mirrors the existing "completed but undated" case
  documented in `insightsStats.test.js`). Series parsing from Goodreads' title
  parenthetical (e.g. `"Dune (Dune, #1)"`) was deliberately left out of this slice
  to keep it minimal, matching the "ship incrementally" requirement.
- IPC: new `data:importGoodreads` handler in `electron/main.js`, mirroring
  `data:importJson`'s open-dialog → read-file → `importData()` shape exactly,
  just with `mapGoodreads()` in between. Exposed as `window.data.importGoodreads()`
  via `electron/preload.js`.
- Settings UI: new "Import Goodreads CSV…" button next to "Import JSON…" in
  `SettingsPage.jsx`'s Data section, reusing the existing generic `run()` busy/
  message/reload plumbing (the `import` success-message formatter is aliased for
  the `goodreads` action id, and the post-import reload condition now also fires
  for it) — no new UI pattern introduced.

**Verification.** `npm test` → **156/156 pass** (+14: `parseCsv` quoted/embedded-
comma/embedded-newline/escaped-quote/trailing-blank-line/empty-input cases;
`mapGoodreads`/`goodreadsDate` shelf→status mapping, 0-star→null, 5-star→10,
title-less rows skipped, blank `Date Read` left null). `vite build` clean
(226.60 kB JS / 70.72 kB CSS). better-sqlite3 rebuilt back to the Electron ABI.
**Not verified against a real Goodreads export file** — the mapping was built from
the documented/well-known Goodreads CSV column names, not a live download, so if a
real export uses different column headers or edge-case values this may need a
follow-up fix once tried against an actual file.

**Touches:** `electron/csv.js` (`parseCsv`), new `electron/importers/goodreads.js`,
`electron/main.js` (`data:importGoodreads`), `electron/preload.js`,
`src/components/SettingsPage.jsx`, `electron/db.js` (`importData` reused as-is).

### 6.7 Light theme: low-alpha white borders/scrollbar tints — ✅ Done `P3`

Deferred from 5.6. The main light-theme pass fixed all body-text and surface
regressions; a cosmetic gap remains where low-alpha `rgba(255,255,255,α)` borders
and scrollbar tints (designed against the dark background) go faint-to-invisible on
light backgrounds. Not a readability bug — no text is affected — but focus/hover
outlines read as softer than intended in light mode.

**Requirements**
- [x] Audit remaining low-alpha white literals outside `:root` in `src/index.css`
- [x] Introduce theme-aware border/scrollbar tokens (mirrors the `--text-strong` /
      `--raise` / `--glass-bg` approach from 5.6) or flip the alpha direction under
      `:root[data-theme="light"]`

**Acceptance:** hover/focus outlines and scrollbars are visibly present (not just
technically non-zero-alpha) in light mode, with no dark-mode regression. ✅

**Implementation notes:**
- Audited every `rgba(255,255,255,α)` literal outside `:root`. They fell into two
  groups: (1) borders/scrollbars on components that sit on the app's normal
  light/dark-aware surface (`--bg`/`--bg2`/`--surface`), which genuinely go
  faint-to-invisible in light mode — these were converted; (2) borders on elements
  that float over fixed always-dark surfaces by design — cover-art overlay chips
  (`.cover-status`, `.cover-rating`, `.card-action-btn`, `.cover-progress-inc`),
  and the centered glass dialogs (`.edit-modal`/`.edit-input`/`.edit-hero-cover`,
  `.series-dropdown`, `.releases-panel`) which all keep a literal near-black
  background in both themes — these were intentionally left alone, since their
  white borders/text still read fine against a background that never lightens.
- Added two new theme-aware tokens at `:root`, mirroring the `--border`/`--border2`
  pattern from 5.6: `--border3` (stronger emphasis border for focus rings and the
  dotted "editable" affordance — 0.20 white / 0.28 black) and
  `--scrollbar-thumb`/`--scrollbar-thumb-hover` (0.07→0.16 / 0.13→0.28), since
  scrollbars need more contrast boost in light mode than a plain border does.
- Converted borders/backgrounds on: `.setting-input` (+ its `:focus` ring),
  `.color-swatch`, `.panel-form input/select/textarea` (rest/hover/focus, used by
  `AddEntryPanel`), `.timeline-year-body`'s divider, `.search-spinner`'s track, and
  every `scrollbar-color`/`::-webkit-scrollbar-thumb` declaration in the file — all
  now reference `var(--border)` / `var(--border2)` / `var(--border3)` /
  `var(--surface)` / `var(--scrollbar-thumb*)` instead of a raw white literal.
  Accent-tinted scrollbars (`color-mix(... var(--accent) …, rgba(255,255,255,α))`)
  were left as-is — they already carry the category accent hue, so they don't go
  invisible in light mode the way a pure white tint does.

**Verification.** `npm test` → **142/142 pass** (unchanged — CSS-only change, no
logic to unit test). `vite build` clean (226.34 kB JS / 70.72 kB CSS). better-sqlite3
rebuilt back to the Electron ABI. GUI not driven headlessly — verified by reading
each touched selector's rendering context (which surface/background it sits on) to
confirm the token swap doesn't wash it out against a fixed-dark backdrop, and that
untouched dark-mode values are numerically identical to before (same alpha under
`:root`'s default, non-light-themed definitions).

**Touches:** `src/index.css` only.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-28 | Document created — captures items explicitly deferred during PRD.md milestones 1–5, prioritized by data-loss risk first (6.1), then usability gaps, then cosmetic/stretch items |
| 2026-07-28 | 6.1 Re-watch/re-read logs now included in JSON export/import (`logs` array, `entry_id` remapped via id map, backward-compatible with pre-6.1 exports); binary backup/restore confirmed to already preserve logs — 133/133 tests |
| 2026-07-28 | 6.2 `year` is now editable on existing entries (`EditEntryPanel` gains a Year field; `updateEntry` preserve-on-omit pattern extended to `year`) — 136/136 tests |
| 2026-07-29 | 6.3 Global cross-category search shipped (`GlobalSearchModal`, "All categories" button + `Ctrl/Cmd+Shift+K`, groups matches by category and jumps to the entry's edit panel) — 136/136 tests |
| 2026-07-29 | 6.4 Insights per-series average rating shipped (`computeStats` gains `perSeries`, keyed by `series_id`; new "Average rating by series" card in `InsightsPage.jsx`, capped to top 10 with a show-all toggle) — 142/142 tests |
| 2026-07-29 | 6.5 Insights per-month heat strip shipped (`getYearMonth` + `computeStats.perMonth`; new `HeatStrip` component, one row per year with accent-opacity cells) — 142/142 tests |
| 2026-07-29 | 6.7 Light theme border/scrollbar audit: introduced `--border3`/`--scrollbar-thumb`/`--scrollbar-thumb-hover` tokens and converted remaining raw white-literal borders/scrollbars on normal-surface components (Settings inputs, color swatch, Add Entry panel fields, timeline divider, search spinner) — deliberately left literals on fixed-dark glass modals/cover-art overlays unchanged — 142/142 tests, CSS-only |
| 2026-07-30 | 6.6 Goodreads CSV import shipped (first of three planned mappers): `parseCsv` added to `electron/csv.js`, new `electron/importers/goodreads.js` maps title/author/rating/date/shelf into the existing `importData` shape, "Import Goodreads CSV…" button in Settings — not yet verified against a real downloaded export — 156/156 tests |
