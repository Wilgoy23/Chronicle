import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Custom lists (8.1) and the release calendar (8.2), end to end.

let app
let page
let tmpDir

const localYmd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-e2e-lists-'))
  const env = { ...process.env, CHRONICLE_TEST: '1', CHRONICLE_USER_DATA: tmpDir }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [path.resolve('electron/main.js')], env })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(async () => {
    await window.db.addEntry({ category: 'movie', title: 'Paddington 2', status: 'completed', year: 2017 })
    await window.db.addEntry({ category: 'tv', title: 'Bluey', status: 'in_progress' })
    await window.db.addEntry({ category: 'book', title: 'Piranesi', status: 'planned' })
    await window.db.addEntry({ category: 'anime', title: 'Frieren', status: 'completed', source: 'anilist', source_id: '154587' })
  })

  // Stub the network in the main process so a real release check "finds" a
  // sequel airing today: AniList's relations query answers with one SEQUEL,
  // every other lookup comes back empty.
  await app.evaluate((_electron, today) => {
    const [year, month, day] = today.split('-').map(Number)
    const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url)
      if (u.includes('graphql.anilist.co') && String(opts.body ?? '').includes('relations')) {
        return json({ data: { Media: { relations: { edges: [{
          relationType: 'SEQUEL',
          node: {
            id: 999001, type: 'ANIME', format: 'TV', status: 'NOT_YET_RELEASED',
            title: { english: 'Frieren Season 2', romaji: null }, coverImage: { medium: null },
            startDate: { year, month, day },
          },
        }] } } } })
      }
      if (u.includes('tvmaze')) return json([])
      return json({ data: { Page: { media: [] } }, docs: [], results: [] })
    }
  }, localYmd())
  const found = await page.evaluate(() => window.releases.checkNow())
  expect(found.map(r => r.title)).toEqual(['Frieren Season 2'])
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

test('create a list, add titles from several categories, reorder and annotate', async () => {
  await page.locator('.nav-item', { hasText: /^Lists$/ }).click()
  await expect(page.locator('.upnext-empty h2')).toHaveText('No lists yet')

  await page.locator('.lists-head button', { hasText: 'New list' }).click()
  await page.fill('input[aria-label="List name"]', 'Comfort picks')
  await page.locator('.list-new-form button', { hasText: 'Create list' }).click()
  await expect(page.locator('.list-title')).toHaveText('Comfort picks')

  await page.locator('.list-header-actions button', { hasText: 'Add titles' }).click()
  const picker = page.locator('.list-picker')
  await expect(picker).toBeVisible()
  for (const title of ['Bluey', 'Paddington 2', 'Piranesi']) {
    await picker.locator('.list-picker-row', { hasText: title }).locator('button').click()
    await expect(picker.locator('.list-picker-row', { hasText: title }).locator('button')).toHaveText('On list')
  }
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()

  const titles = page.locator('.list-item .upnext-title')
  await expect(titles).toHaveText(['Bluey', 'Paddington 2', 'Piranesi'])
  await expect(page.locator('.list-stats')).toContainText('1 of 3 done')

  await page.locator('button[aria-label="Move Piranesi up"]').click()
  await expect(titles).toHaveText(['Bluey', 'Piranesi', 'Paddington 2'])

  const row = page.locator('.list-item', { hasText: 'Paddington 2' })
  await row.hover()
  await row.locator('.list-item-note--add').click()
  await page.fill('input[aria-label="Note for Paddington 2"]', 'Every December')
  await page.keyboard.press('Enter')
  await expect(row.locator('.list-item-note')).toHaveText('Every December')

  // Order and note survive leaving and coming back.
  await page.locator('.list-back').click()
  await expect(page.locator('.list-card-meta')).toContainText('3 titles · 1 done')
  await page.locator('.list-card', { hasText: 'Comfort picks' }).click()
  await expect(titles).toHaveText(['Bluey', 'Piranesi', 'Paddington 2'])
  await expect(page.locator('.list-item', { hasText: 'Paddington 2' }).locator('.list-item-note')).toHaveText('Every December')
})

test('the edit panel shows and changes list membership', async () => {
  await page.locator('.list-item', { hasText: 'Bluey' }).locator('.list-item-open').click()
  const panel = page.locator('.edit-modal')
  await expect(panel.locator('.entry-list-chip')).toHaveText(/Comfort picks/)

  await panel.locator('select[aria-label="Add to a list"]').selectOption('__new')
  await panel.locator('.entry-lists-new input').fill('Kids')
  await panel.locator('.entry-lists-new button', { hasText: 'Create' }).click()
  await expect(panel.locator('.entry-list-chip')).toHaveCount(2)

  await panel.locator('button[aria-label="Remove from Comfort picks"]').click()
  await expect(panel.locator('.entry-list-chip')).toHaveCount(1)
  await page.keyboard.press('Escape')

  await expect(page.locator('.list-item .upnext-title')).toHaveText(['Piranesi', 'Paddington 2'])
  await page.locator('.list-back').click()
  await expect(page.locator('.list-card')).toHaveCount(2)
})

test('the calendar shows a detected release on its day and adds it to the library', async () => {
  await page.locator('.nav-item', { hasText: /^Calendar$/ }).click()
  const today = page.locator('.cal-day--today')
  await expect(today.locator('.cal-chip', { hasText: 'Frieren Season 2' })).toBeVisible()

  const agenda = page.locator('.cal-agenda')
  const row = agenda.locator('.cal-agenda-row', { hasText: 'Frieren Season 2' })
  await expect(row).toContainText('New season / sequel · via Frieren')
  await row.locator('button', { hasText: 'Add to planned' }).click()
  await expect(row).toContainText('Release · in your library')
  await expect(row.locator('button', { hasText: 'Add to planned' })).toHaveCount(0)

  // Filtering by kind hides it.
  await page.locator('.cal-filters button', { hasText: 'Releases' }).click()
  await expect(today.locator('.cal-chip')).toHaveCount(0)
  await page.locator('.cal-filters button', { hasText: 'Releases' }).click()
})

test('the calendar keeps an .ics file updated', async () => {
  const icsPath = path.join(tmpDir, 'chronicle.ics')
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  }, icsPath)

  await page.locator('.cal-toolbar button', { hasText: 'Add to your calendar' }).click()
  const dialog = page.locator('[aria-labelledby="cal-sync-title"]')
  await dialog.locator('button', { hasText: 'Choose file location' }).click()
  await expect(dialog.locator('.setting-status')).toHaveText('Wrote 1 event.')
  await expect(dialog.locator('.cal-sync-file')).toHaveText(icsPath)

  const ics = fs.readFileSync(icsPath, 'utf8')
  expect(ics).toContain('BEGIN:VCALENDAR')
  expect(ics).toContain('UID:release-anilist-999001@chronicle.local')
  expect(ics).toContain(`DTSTART;VALUE=DATE:${localYmd().replace(/-/g, '')}`)

  await dialog.locator('button', { hasText: 'Stop updating' }).click()
  await expect(dialog.locator('button', { hasText: 'Choose file location' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
