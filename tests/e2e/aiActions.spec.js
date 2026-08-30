import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

// The AI panel's P2 contract: results are actionable without throwing the panel
// away, filter chips can be dismissed to widen a search, and series suggestions
// are editable before they're applied (and reversible after).
//
// Unlike aiPanel.spec.js this needs a library to work on, so entries are seeded
// through the same preload bridge the UI uses. CHRONICLE_TEST=1 pins the
// embedding backend to the deterministic lexical fallback, so no model is
// downloaded and results don't drift between runs.

const SEED = [
  { title: 'Berserk, Vol. 10', status: 'completed', rating: 9,    genres: 'Dark Fantasy' },
  { title: 'Berserk, Vol. 2',  status: 'completed', rating: 8,    genres: 'Dark Fantasy' },
  { title: 'Berserk, Vol. 1',  status: 'completed', rating: 10,   genres: 'Dark Fantasy' },
  { title: 'Solanin',          status: 'planned',   rating: null, genres: 'Slice of Life' },
]

let app
let page

test.beforeAll(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-ai-actions-'))
  app = await electron.launch({
    args: [path.resolve('electron/main.js')],
    env: { ...process.env, CHRONICLE_TEST: '1', CHRONICLE_USER_DATA: tmpDir },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(async seed => {
    for (const s of seed) {
      await window.db.addEntry({
        category: 'manga', title: s.title, status: s.status, rating: s.rating,
        notes: '', description: null, genres: s.genres, cover_url: null,
        series_id: null, date_read: '2026-01-01', source: null, source_id: null,
        year: 2020, progress: 0, progress_total: null,
      })
    }
  }, SEED)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  // The seeded entries live in Manga; make it the active category.
  await page.getByRole('button', { name: 'Manga', exact: true }).first().click()
})

test.afterAll(async () => {
  await app.close()
})

// Idempotent: tests share one window, and some of them deliberately leave the
// panel closed, so each opens it for itself rather than inheriting a state.
async function openPanel() {
  if (!(await page.getByRole('dialog').isVisible())) {
    await page.getByRole('button', { name: /Ask AI/ }).click()
  }
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function ask(query) {
  await page.getByRole('textbox', { name: 'Ask about your library' }).fill(query)
  await page.locator('.ai-ask-row .ai-primary-btn').click()
  await expect(page.locator('.ai-result-count')).toBeVisible({ timeout: 30000 })
}

test('a result row opens the editor with the panel still behind it', async () => {
  await openPanel()
  await ask('completed manga')
  await page.locator('.ai-result .ai-row-btn').first().click()

  await expect(page.locator('.edit-modal')).toBeVisible()
  // The whole point: the results are still there to come back to.
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.locator('.edit-modal .panel-close').click()
  await expect(page.locator('.edit-modal')).toBeHidden()
  await expect(page.locator('.ai-result').first()).toBeVisible()
})

test('the row action reveals the entry in the library and closes the panel', async () => {
  const title = await page.locator('.ai-result .search-modal-title').first().textContent()
  await page.getByRole('button', { name: `Show ${title} in library` }).click()

  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('.search-input, input[placeholder*="Search"]').first()).toHaveValue(title)
})

test('dismissing filter chips widens the search without rephrasing it', async () => {
  await openPanel()
  await ask('completed manga')

  const chips = page.locator('.ai-chip-removable')
  await expect(chips).toHaveCount(2) // category + status
  await expect(page.locator('.ai-result')).toHaveCount(3) // Solanin is Planned

  // Drop the status chip; only the category constraint should remain.
  await chips.filter({ hasText: 'Completed' }).click()
  await expect(chips).toHaveCount(1)
  await expect(chips.filter({ hasText: 'Completed' })).toHaveCount(0)
  await expect(page.locator('.ai-result')).toHaveCount(SEED.length)

  // Dismissing a chip refines in place — it must not dismiss the panel.
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('the series tab scans on its own and orders installments naturally', async () => {
  await openPanel()
  await page.getByRole('tab', { name: 'Series' }).click()
  // No "Scan" click — arriving on the tab is the trigger.
  await expect(page.locator('.ai-series-item')).toHaveCount(1, { timeout: 30000 })

  const titles = await page.locator('.ai-series-member span').allTextContents()
  expect(titles).toEqual(['Berserk, Vol. 1', 'Berserk, Vol. 2', 'Berserk, Vol. 10'])
})

test('a suggestion can be renamed and have members excluded before applying', async () => {
  await openPanel()
  await page.locator('.ai-series-name').fill('Berserk (Deluxe)')
  await page.locator('.ai-series-member input').nth(2).uncheck()
  await expect(page.locator('.ai-series-kind')).toHaveText(/2 of 3 selected/)

  await page.locator('.ai-series-item .ai-primary-btn').click()
  await expect(page.locator('.ai-undo')).toContainText('Grouped 2 entries under “Berserk (Deluxe)”')

  const series = await page.evaluate(() => window.db.getSeries('manga'))
  expect(series.map(s => s.name)).toContain('Berserk (Deluxe)')
})

test('undo detaches the entries and removes the series it created', async () => {
  await openPanel()
  await page.locator('.ai-undo-btn').click()
  await expect(page.locator('.ai-undo')).toBeHidden()

  const series = await page.evaluate(() => window.db.getSeries('manga'))
  expect(series.map(s => s.name)).not.toContain('Berserk (Deluxe)')

  const entries = await page.evaluate(() => window.db.getEntries('manga'))
  expect(entries.every(e => e.series_id == null)).toBe(true)
})
