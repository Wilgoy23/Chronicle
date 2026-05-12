import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let app
let page

test.beforeAll(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-e2e-'))
  app = await electron.launch({
    args: [path.resolve('electron/main.js')],
    env: {
      ...process.env,
      CHRONICLE_TEST: '1',
      CHRONICLE_USER_DATA: tmpDir,
    },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

test('app window is visible', async () => {
  const win = await app.browserWindow(page)
  expect(await win.evaluate(w => !w.isDestroyed())).toBe(true)
})

test('sidebar shows all 4 categories', async () => {
  await expect(page.locator('.nav-item', { hasText: 'Books' })).toBeVisible()
  await expect(page.locator('.nav-item', { hasText: 'Anime' })).toBeVisible()
  await expect(page.locator('.nav-item', { hasText: 'Movies' })).toBeVisible()
  await expect(page.locator('.nav-item', { hasText: 'Games' })).toBeVisible()
})

test('add an entry manually and see it in the grid', async () => {
  await page.click('button.add-btn:not(.add-btn--search)')
  await page.waitForSelector('aside.add-panel.open')
  await page.fill('input[placeholder="e.g. Berserk"]', 'My Test Entry')
  await page.click('button.submit-btn')
  await expect(page.locator('.card-title', { hasText: 'My Test Entry' })).toBeVisible()
})

test('delete an entry and confirm it is gone', async () => {
  await page.click('button.add-btn:not(.add-btn--search)')
  await page.waitForSelector('aside.add-panel.open')
  await page.fill('input[placeholder="e.g. Berserk"]', 'Entry To Delete')
  await page.click('button.submit-btn')
  await expect(page.locator('.card-title', { hasText: 'Entry To Delete' })).toBeVisible()

  const card = page.locator('.card', { hasText: 'Entry To Delete' })
  await card.locator('button.card-delete').click()
  await expect(page.locator('.card-title', { hasText: 'Entry To Delete' })).not.toBeVisible()
})

test('settings page opens and Back returns to collection', async () => {
  await page.click('.nav-item:has-text("Settings")')
  await expect(page.locator('.topbar-title h1', { hasText: 'Settings' })).toBeVisible()
  await page.click('button:has-text("Back")')
  await expect(page.locator('.topbar-title h1', { hasText: 'Books' })).toBeVisible()
})
