import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let app
let page

test.beforeAll(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-e2e-series-'))
  app = await electron.launch({
    args: [path.resolve('electron/main.js')],
    env: { ...process.env, CHRONICLE_TEST: '1', CHRONICLE_USER_DATA: tmpDir },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // Replace the network-backed handlers with fixed data so the test is offline.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('api:searchAnime')
    ipcMain.handle('api:searchAnime', () => [
      { id: 102, title: 'Test Saga Season 2', cover: '', episodes: 12, year: 2017 },
    ])
    ipcMain.removeHandler('api:getSeriesMembers')
    ipcMain.handle('api:getSeriesMembers', () => ({
      seriesName: 'Test Saga',
      members: [1, 2, 3, 4].map(n => ({
        source_id: 100 + n, title: `Test Saga Season ${n}`, cover_url: null,
        year: 2012 + n, release_date: `${2012 + n}-01-01`, position: n,
        unreleased: n === 4, progress_total: 12, optional: false, relation: null,
      })),
    }))
  })
})

test.afterAll(async () => {
  await app.close()
})

test('adds a whole series with per-item statuses', async () => {
  await page.locator('.nav-item', { hasText: /^Anime$/ }).first().click()
  await page.locator('header.topbar button.add-btn').click()
  await page.fill('.search-modal-input', 'test saga')
  await page.locator('.search-series-btn').first().click()

  const sheet = page.locator('.series-sheet')
  await expect(sheet.locator('.series-sheet-row')).toHaveCount(4)
  await expect(sheet.locator('.series-sheet-name')).toHaveValue('Test Saga')
  // Unreleased season 4 starts unchecked.
  await expect(sheet.locator('.series-sheet-rowcheck').nth(3)).not.toBeChecked()

  // "Done up to here" on season 2 → 1–2 Completed, 3 Planned.
  await sheet.locator('.series-sheet-row').nth(1).hover()
  await sheet.locator('.series-sheet-upto').nth(1).click()
  await sheet.locator('.series-sheet-row').nth(2).locator('select').selectOption('in_progress')

  await sheet.locator('.series-sheet-save').click()
  await expect(sheet).toBeHidden()

  const stored = await page.evaluate(() => window.db.getEntries('anime'))
  const byTitle = Object.fromEntries(stored.map(e => [e.title, e]))
  expect(byTitle['Test Saga Season 1'].status).toBe('completed')
  expect(byTitle['Test Saga Season 2'].status).toBe('completed')
  expect(byTitle['Test Saga Season 3'].status).toBe('in_progress')
  expect(byTitle['Test Saga Season 4']).toBeUndefined()
  expect(byTitle['Test Saga Season 1'].series).toBe('Test Saga')
  expect(byTitle['Test Saga Season 3'].date_read).toBeNull()
})
