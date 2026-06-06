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
  // Use exact regex to avoid matching "All Books", "All Anime" etc in the series panel
  await expect(page.locator('.nav-item', { hasText: /^Books$/ }).first()).toBeVisible()
  await expect(page.locator('.nav-item', { hasText: /^Anime$/ }).first()).toBeVisible()
  await expect(page.locator('.nav-item', { hasText: /^Movies$/ }).first()).toBeVisible()
  await expect(page.locator('.nav-item', { hasText: /^Games$/ }).first()).toBeVisible()
})

// Helper: open Add Entry → click "Add manually" → fill form → save
async function addEntryManually(title) {
  // Target topbar button specifically to avoid matching the empty-state add button
  await page.locator('header.topbar button.add-btn').click()
  await page.waitForSelector('.search-modal', { state: 'visible' })
  // Wait for footer to be rendered before clicking
  await page.waitForSelector('button.search-manual-btn', { state: 'visible' })
  await page.locator('button.search-manual-btn').click()
  await page.waitForSelector('aside.add-panel.open')
  await page.fill('aside.add-panel input[placeholder="e.g. Berserk"]', title)
  await page.click('aside.add-panel button.submit-btn')
}

test('add an entry manually and see it in the grid', async () => {
  await addEntryManually('My Test Entry')
  await expect(page.locator('.card-title', { hasText: 'My Test Entry' })).toBeVisible()
})

test('delete an entry and confirm it is gone', async () => {
  await addEntryManually('Entry To Delete')
  await expect(page.locator('.card-title', { hasText: 'Entry To Delete' })).toBeVisible()

  const card = page.locator('.card', { hasText: 'Entry To Delete' })
  await card.locator('button.card-action-btn').click()
  await expect(page.locator('.card-title', { hasText: 'Entry To Delete' })).not.toBeVisible()
})

test('duplicate entry shows alert and does not create a second card', async () => {
  await addEntryManually('Unique Title')
  await expect(page.locator('.card-title', { hasText: 'Unique Title' })).toBeVisible()

  // Attempt to add the same title again via manual panel — expect the browser alert
  page.once('dialog', dialog => dialog.dismiss())
  await addEntryManually('Unique Title')
  // Only one card should exist
  expect(await page.locator('.card-title', { hasText: 'Unique Title' }).count()).toBe(1)
})

test('settings page opens and Back returns to collection', async () => {
  await page.click('.nav-item:has-text("Settings")')
  await expect(page.locator('.topbar-title h1', { hasText: 'Settings' })).toBeVisible()
  await page.click('button:has-text("Back")')
  await expect(page.locator('.topbar-title h1', { hasText: 'Books' })).toBeVisible()
})
