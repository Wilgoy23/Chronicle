import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

// The embedding model runs in a utilityProcess. Unit tests can only cover the
// no-worker fallback, so this is where the round-trip itself gets exercised:
// fork, config, status push, and vectors coming back over postMessage.
//
// CHRONICLE_TEST=1 tells the worker to skip the ~25 MB model download and use
// the lexical vectorizer. It still forks and still answers over the same
// channel, so everything here is real except the model.

const SEED = [
  { title: 'Dune',           genres: 'Sci-Fi' },
  { title: 'Dune Messiah',   genres: 'Sci-Fi' },
  { title: 'Pride and Prejudice', genres: 'Romance' },
]

let app
let page

test.beforeAll(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-embed-worker-'))
  app = await electron.launch({
    args: [path.resolve('electron/main.js')],
    env: { ...process.env, CHRONICLE_TEST: '1', CHRONICLE_USER_DATA: tmpDir },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(async seed => {
    for (const s of seed) {
      await window.db.addEntry({
        category: 'book', title: s.title, status: 'completed', rating: 8,
        notes: '', description: null, genres: s.genres, cover_url: null,
        series_id: null, date_read: '2026-01-01', source: null, source_id: null,
        year: 2020, progress: 0, progress_total: null,
      })
    }
  }, SEED)
  // Indexing is what first reaches for the worker; rebuilding forces it now
  // rather than waiting on the debounce that follows a library write.
  await page.evaluate(() => window.ai.rebuildIndex())
})

test.afterAll(async () => {
  await app.close()
})

test('the model runs in a process of its own', async () => {
  const status  = await page.evaluate(() => window.ai.status())
  const mainPid = await app.evaluate(() => process.pid)

  // A pid at all means the worker forked, connected, and pushed its status
  // back; a different one means the inference never touched the main process.
  expect(status.workerPid).toEqual(expect.any(Number))
  expect(status.workerPid).not.toBe(mainPid)
})

test('the worker honours the config it was sent before any request', async () => {
  const status = await page.evaluate(() => window.ai.status())
  // Only the worker sets this reason, so seeing it here proves the config
  // message arrived and was applied ahead of the first embed.
  expect(status.backend).toBe('fallback')
  expect(status.error).toBe('forced by CHRONICLE_TEST')
  expect(status.model).toBe('chronicle-hash-v1')
})

test('vectors survive the trip back and still rank sensibly', async () => {
  const results = await page.evaluate(() => window.ai.search('Dune', { category: 'book' }))

  expect(results.length).toBe(SEED.length)
  // Non-zero scores mean real vectors were unpacked, not a zeroed buffer.
  expect(results[0].score).toBeGreaterThan(0)
  expect(results[0].entry.title).toContain('Dune')
  // And the ordering is the one lexical similarity should produce.
  expect(results.at(-1).entry.title).toBe('Pride and Prejudice')
})

test('every entry gets indexed, one vector per entry', async () => {
  const status = await page.evaluate(() => window.ai.status())
  expect(status.index.stored).toBe(SEED.length)
})

test('the worker survives repeated batches without being re-forked', async () => {
  const before = (await page.evaluate(() => window.ai.status())).workerPid

  await page.evaluate(() => window.ai.search('space politics', { category: 'book' }))
  await page.evaluate(() => window.ai.ask('books about revenge', { categories: [] }))

  const after = (await page.evaluate(() => window.ai.status())).workerPid
  expect(after).toBe(before)
})
