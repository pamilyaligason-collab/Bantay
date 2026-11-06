import { createHash } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { admin } from './fixtures/s16/settings'
import { BASEMAP_BOUNDS, basemapFile, P } from './fixtures/p2/pmtilesFixture'
import { assertJackHit, setScheme, settled } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// Maps round 2 (D-131, D-132), lane M2: the Offline maps screen, signed-in build (it has a Supabase base URL for the pack files, every call mocked).
const API = 'https://bantay-test.supabase.test'
const FILES = `${API}/storage/v1/object/public/region-packs/`
const FILE = basemapFile(P)
const SHA = createHash('sha256').update(FILE).digest('hex')
const BOHOL = '0701200000', SOCO = '1206300000'
const SOCO_BOX: [number, number, number, number] = [124.6, 5.9, 125.4, 6.6]
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const entry = (code: string, name: string, bounds: number[]) => ({ code, name, version: 1, checksum: 'c', size: 1, rows: 1, path: `${code}/p.json`, neighbours: [], basemap: { version: 1, checksum: SHA, size: FILE.length, path: `${code}/basemap.pmtiles`, bounds, minzoom: 0, maxzoom: 15 } })
const INDEX = { format: 1, built: '2026-11-06', packs: [entry(BOHOL, 'Bohol', BASEMAP_BOUNDS(P)), entry(SOCO, 'South Cotabato', SOCO_BOX)] }

async function open(page: Page) {
  await admin(page)
  await page.addInitScript(() => localStorage.setItem('bantay.flags', JSON.stringify({ offlineMaps: true })))
  await page.route(`${FILES}**`, (r) => {
    const rel = r.request().url().replace(FILES, '')
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    if (rel.startsWith('index.json')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(INDEX) })
    if (rel.endsWith('basemap.pmtiles')) return r.fulfill({ status: 200, headers: cors, body: FILE })
    return r.fulfill({ status: 404, headers: cors })
  })
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#today')
  await settled(page)
}
const go = (page: Page, hash: string) => page.evaluate((h) => { location.hash = h }, hash) // no reload: it would show the PIN screen

/** Put pack rows on the phone as a finished sync would; `maps` lists the codes that also hold a stored basemap. */
async function seed(page: Page, maps: string[]) {
  await page.evaluate(([b64, bohol, soco, withMap]) => new Promise<void>((done, fail) => {
    const raw = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0))
    const o = indexedDB.open('bantay')
    o.onerror = () => fail(new Error('open failed'))
    o.onsuccess = () => {
      const tx = o.result.transaction('packs', 'readwrite')
      const rows: [string, string, number[]][] = [['0701200000', 'Bohol', bohol as number[]], ['1206300000', 'South Cotabato', soco as number[]]]
      for (const [code, name, bounds] of rows) {
        const base = { code, version: 1, checksum: 'c', name, neighbours: [], places: [], fetchedAt: 1, usedAt: Date.now(), pinned: true }
        tx.objectStore('packs').put((withMap as string[]).includes(code) ? { ...base, basemap: { checksum: 'x', bounds, blob: new Blob([raw]), savedAt: '2026-11-06T13:10:00.000Z' } } : base)
      }
      // a raw IndexedDB write is invisible to Dexie's shared live queries (the shell already holds one): tell them, as Dexie does for another tab
      tx.oncomplete = () => { o.result.close(); const bc = new BroadcastChannel('x-storagemutated-1'); bc.postMessage({ all: { d: 1, from: -Infinity, to: [[]] } }); bc.close(); done() }
      tx.onerror = () => fail(new Error('put failed'))
    }
  }), [FILE.toString('base64'), BASEMAP_BOUNDS(P), SOCO_BOX, maps] as const)
}
const row = (page: Page, code: string) => page.getByTestId(`ofm-row-${code}`)
const hubValue = (page: Page) => page.locator('a.rw-main[href="#safety/offline"] .rw-value')

test.use({ viewport: { width: 390, height: 844 } })

test('download on the screen, then everything works with no network at all, and Remove works offline', async ({ page, context }) => {
  await open(page)
  await seed(page, [])
  await go(page, '#safety')
  await expect(hubValue(page)).toHaveText('Not downloaded')
  await go(page, '#safety/offline')
  await expect(page.getByText('Your area is ready offline')).toHaveCount(0)
  await expect(row(page, BOHOL)).toContainText('Not downloaded')
  await expect(page.getByRole('switch', { name: 'Wi-Fi only' })).toHaveAttribute('aria-checked', 'true')
  await page.evaluate(() => Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, configurable: true })) // known cellular: Wi-Fi only holds the download back
  await page.getByRole('button', { name: 'Download Bohol' }).click()
  await expect(page.getByRole('alert')).toContainText('Waiting for Wi-Fi')
  await page.getByRole('switch', { name: 'Wi-Fi only' }).click()
  await expect(page.getByRole('switch', { name: 'Wi-Fi only' })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('button', { name: 'Download Bohol' }).click()
  await expect(row(page, BOHOL)).toContainText('Ready')
  await expect(page.getByTestId('ofm-hero')).toContainText('Your area is ready offline')
  await expect(row(page, SOCO)).toContainText('Not downloaded')
  await context.setOffline(true)
  await go(page, '#safety')
  await expect(hubValue(page)).toHaveText('Ready')
  await go(page, '#safety/offline')
  await expect(page.getByTestId('ofm-hero')).toBeVisible()
  await expect(row(page, BOHOL)).toContainText('Ready')
  await page.getByRole('button', { name: 'Remove Bohol' }).click()
  await expect(row(page, BOHOL)).toContainText('Not downloaded')
  await expect(page.getByTestId('ofm-hero')).toHaveCount(0)
  await go(page, '#safety')
  await expect(hubValue(page)).toHaveText('Not downloaded')
})

test('offline with nothing stored: the screen says the list needs internet and offers no download', async ({ page, context }) => {
  await open(page)
  await context.setOffline(true)
  await page.unroute(`${FILES}**`) // a fulfilled route still answers when the context is offline: take the mock away so the phone truly has no network
  await go(page, '#safety/offline')
  await expect(page.getByText('The map list needs internet. Try again when you are online.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Download/ })).toHaveCount(0)
})

// ML-44: no control under the Jack button across the widths and the data states that move rows (empty, one stored, two stored).
const STATES: [string, string[]][] = [['empty', []], ['one stored', [BOHOL]], ['two stored', [BOHOL, SOCO]]]
for (const width of [360, 390, 450]) {
  for (const [name, maps] of STATES) {
    test(`Jack clear at ${width} wide, ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await open(page)
      await seed(page, maps)
      await go(page, '#safety/offline')
      await expect(row(page, BOHOL)).toBeVisible()
      await expect(page.getByTestId('ofm-hero')).toHaveCount(maps.includes(BOHOL) ? 1 : 0)
      await assertJackHit(page, [], `offline ${width} ${name}`, 'top')
      await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement; s.scrollTop = s.scrollHeight })
      await assertJackHit(page, [], `offline ${width} ${name} end`, 'keep')
    })
  }
}

// Shots for the board comparison: only when SHOT_DIR is set (they never go into the repo).
const SHOTS = process.env.SHOT_DIR
for (const [w, h] of [[390, 844], [450, 949]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`shot ${w} ${scheme}`, async ({ page }) => {
      test.skip(!SHOTS, 'SHOT_DIR not set')
      await page.setViewportSize({ width: w, height: h })
      await open(page)
      await seed(page, [BOHOL])
      await go(page, '#safety/offline')
      await expect(page.getByTestId('ofm-hero')).toBeVisible()
      await setScheme(page, scheme)
      await page.screenshot({ path: `${SHOTS}/offline-${w}-${scheme}-top.png` })
      await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement; s.scrollTop = s.scrollHeight })
      await page.screenshot({ path: `${SHOTS}/offline-${w}-${scheme}-end.png` })
    })
  }
}
