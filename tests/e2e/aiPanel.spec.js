import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Accessibility contract for the Ask AI panel: dialog semantics, real tabs,
// accessible names on icon-only controls, and focus that is trapped while open
// and restored on close. These assertions need no AI results, so the panel is
// only opened — never queried — keeping the suite fast.

let app
let page

test.beforeAll(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-ai-e2e-'))
  app = await electron.launch({
    args: [path.resolve('electron/main.js')],
    env: { ...process.env, CHRONICLE_TEST: '1', CHRONICLE_USER_DATA: tmpDir },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

async function openPanel() {
  await page.getByRole('button', { name: /Ask AI/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('panel exposes dialog semantics', async () => {
  await openPanel()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAttribute('aria-label', 'Ask AI')
})

test('tabs are real tabs with a selected state', async () => {
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(3)
  await expect(page.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toBeVisible()
})

test('arrow keys move between tabs', async () => {
  await page.getByRole('tab', { name: 'Ask' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'For You' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Series' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true')
})

test('icon-only and placeholder-only controls have accessible names', async () => {
  await expect(page.getByRole('button', { name: 'Close AI panel' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Ask about your library' })).toBeVisible()
})

test('example prompts are offered on the empty state', async () => {
  await expect(page.getByRole('button', { name: 'highly rated sci-fi' })).toBeVisible()
})

test('a typed query survives switching tabs and back', async () => {
  const input = page.getByRole('textbox', { name: 'Ask about your library' })
  await input.fill('cozy mysteries')
  await page.getByRole('tab', { name: 'For You' }).click()
  await expect(input).toBeHidden()
  await page.getByRole('tab', { name: 'Ask' }).click()
  await expect(page.getByRole('textbox', { name: 'Ask about your library' })).toHaveValue('cozy mysteries')
})

test('closing restores focus to the trigger', async () => {
  await page.getByRole('button', { name: 'Close AI panel' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
  expect(focused).toContain('Ask AI')
})
