import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { admin } from './fixtures/s16/settings'
import { pmtilesFile, tileBytes } from './fixtures/p2/pmtilesFixture'
import { assertJackHit, assertNoSideways, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// Maps round 2, lane M3: the six Hazards rings and the NOAH layer over the map (flag localPacks), signed-in build, every call mocked.
// The hazard file is a tiny invented one: a flood square (level 2) at the Dampas point, z8 to 12 like the real files, so the z13 map scales the z12 tile up.
const API = 'https://bantay-test.supabase.test'
const DAMPAS = { lat: 9.645705, lon: 123.877951 }
const BOX = [123.7, 9.5, 124.7, 10.2]
const FILE = pmtilesFile(tileBytes(DAMPAS, 2), false, DAMPAS, BOX)
const SHOTS = process.env.MAPS_SHOTS // a folder outside the repo; no shots when unset
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

test.use({ viewport: { width: 390, height: 844 } })

async function open(page: Page, stored: boolean) {
  await admin(page)
  await page.addInitScript(() => localStorage.setItem('bantay.flags', JSON.stringify({ localPacks: true })))
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body></body>' }))
  await page.route(`${API}/storage/**`, (r) => r.fulfill({ status: r.request().method() === 'OPTIONS' ? 204 : 404, headers: cors }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#today')
  await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
  if (stored) await seed(page)
  await page.evaluate(() => { location.hash = '#safety/hazards' }) // no reload: it would show the PIN screen
  await expect(page.getByTestId('hazards-zone')).toBeVisible()
}

/** The hazard file on the phone as a finished download leaves it (Bohol's row, per-layer bounds around Dampas). */
async function seed(page: Page) {
  await page.evaluate(([b64, box]) => new Promise<void>((done, fail) => {
    const raw = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0))
    const o = indexedDB.open('bantay')
    o.onerror = () => fail(new Error('open failed'))
    o.onsuccess = () => {
      const tx = o.result.transaction('packs', 'readwrite')
      tx.objectStore('packs').put({ code: '0701200000', version: 1, checksum: 'x', name: 'Bohol', neighbours: [], places: [], fetchedAt: 1, usedAt: Date.now(), pinned: true, hazards: { checksum: 'hz', bounds: { flood: box, landslide: box, surge: box }, blob: new Blob([raw]) } })
      tx.oncomplete = () => { o.result.close(); done() }
      tx.onerror = () => fail(new Error('put failed'))
    }
  }), [FILE.toString('base64'), BOX] as const)
}

/** Painted canvases of the hazard layer (it sits in the overlay pane; the street map is in the tile pane). */
const painted = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="hazards-map"] .leaflet-overlay-pane canvas')].filter((c) => {
  const cv = c as HTMLCanvasElement
  const d = cv.getContext('2d')?.getImageData(0, 0, cv.width, cv.height).data
  return !!d && d.some((v, i) => i % 4 === 3 && v > 0)
}).length)

test('six rings by state: earthquake from HazardHunterPH, flood and surge from the file, tsunami and liquefaction dashed', async ({ page }) => {
  await open(page, true)
  await expect(page.getByTestId('hz-ring-flood')).toHaveAttribute('data-state', 'filled')
  await expect(page.getByTestId('hz-ring-flood')).toContainText('Medium')
  await expect(page.getByTestId('hz-ring-quake')).toContainText('VIII')
  await expect(page.getByTestId('hz-ring-surge')).toHaveAttribute('data-state', 'none')
  for (const id of ['tsunami', 'liquefaction']) await expect(page.getByTestId(`hz-ring-${id}`)).toHaveAttribute('data-state', 'dashed')
  await expect(page.getByTestId('hz-rings').getByRole('img')).toHaveCount(6)
  await expect(page.getByTestId('layer-caption')).toContainText('Flood level from NOAH: Medium')
  if (SHOTS) {
    for (const [w, h] of [[390, 844], [450, 949]] as const) {
      await page.setViewportSize({ width: w, height: h })
      for (const s of ['light', 'dark'] as const) {
        await setScheme(page, s)
        await page.screenshot({ path: `${SHOTS}/m3-rings-${s}-${w}.png` })
        await page.getByTestId('hazards-map').scrollIntoViewIfNeeded()
        await page.evaluate(() => { const sc = document.querySelector('.bt .scroll') as HTMLElement; sc.scrollTop += 140 })
        await expect.poll(() => painted(page), { timeout: 15000 }).toBeGreaterThan(0)
        await page.screenshot({ path: `${SHOTS}/m3-map-${s}-${w}.png` })
        await page.evaluate(() => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0 })
      }
    }
  }
})

test('no file on the phone: dashed rings for the three NOAH layers, no overlay, no legend, the old caption', async ({ page }) => {
  await open(page, false)
  for (const id of ['flood', 'landslide', 'surge']) await expect(page.getByTestId(`hz-ring-${id}`)).toHaveAttribute('data-state', 'dashed')
  await expect(page.getByTestId('hz-legend')).toHaveCount(0)
  expect(await painted(page)).toBe(0)
  await expect(page.getByTestId('layer-caption')).toContainText('No flood map for this place yet')
})

test('the flood layer paints over the map at zoom 13 (scaled up from the z12 tile) and after zooming in; the switch swaps the legend', async ({ page }) => {
  await open(page, true)
  await expect(page.getByTestId('hz-legend')).toContainText('Flood level')
  await expect.poll(() => painted(page), { timeout: 15000 }).toBeGreaterThan(0)
  if (SHOTS) await page.getByTestId('hazards-map').screenshot({ path: `${SHOTS}/m3-overlay-z13.png` })
  // zoom in past the file's own top zoom (leaflet keyboard zoom): the polygon must stay, blocky but there
  await page.locator('[data-testid="hazards-map"] .leaflet-container').focus()
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await expect.poll(() => painted(page), { timeout: 15000 }).toBeGreaterThan(0)
  if (SHOTS) await page.getByTestId('hazards-map').screenshot({ path: `${SHOTS}/m3-overlay-z15.png` })
  await page.getByRole('button', { name: 'Storm surge' }).click()
  await expect(page.getByTestId('hz-legend')).toContainText('Storm surge level')
})

test('195 px wide (narrow mode): no sideways scroll with the rings, the map and the legend', async ({ page }) => {
  await page.setViewportSize({ width: 195, height: 844 })
  await open(page, true)
  await expect(page.getByTestId('hz-legend')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-narrow', '')
  await assertNoSideways(page)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/m3-195.png` })
})

for (const [w, h] of [[360, 740], [390, 844], [430, 932]] as const) {
  for (const stored of [false, true]) {
    test(`Jack clears every control at ${w}x${h}, file ${stored ? 'stored' : 'missing'}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await open(page, stored)
      await expect(page.getByTestId('hz-ring-flood')).toHaveAttribute('data-state', stored ? 'filled' : 'dashed')
      await assertJackHit(page, [], `hazards ${stored ? 'file' : 'nofile'} ${w}x${h}`)
      await page.evaluate(() => { const sc = document.querySelector('.bt .scroll') as HTMLElement; sc.scrollTop = sc.scrollHeight })
      await assertJackHit(page, [], `hazards end ${w}x${h}`, 'keep')
    })
  }
}

// Away from the home zones (Metro Manila, picked up by GPS): no stored file, the level is read online and the overlay streams the same file by Range requests.
const MANILA = { lat: 14.5995, lon: 120.9842 }
const MBOX = [120.8, 14.4, 121.2, 14.8]
const MFILE = pmtilesFile(tileBytes(MANILA, 2), false, MANILA, MBOX)
const FILES = `${API}/storage/v1/object/public/region-packs/`
const MPATH = '1380600000/hazards-fixture.pmtiles'

/** Opens #safety/hazards as someone in Metro Manila with no stored file; returns the Range requests the public file served. */
async function openAway(page: Page, context: BrowserContext) {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: MANILA.lat, longitude: MANILA.lon })
  const ranges: string[] = []
  await admin(page)
  await page.addInitScript(() => localStorage.setItem('bantay.flags', JSON.stringify({ localPacks: true })))
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body></body>' }))
  await page.route(`${FILES}**`, (r) => {
    const req = r.request(), rel = req.url().replace(FILES, '')
    const h = { ...cors, 'access-control-expose-headers': 'content-range, content-length' }
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h })
    if (rel.startsWith('index.json')) return r.fulfill({ status: 200, headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ format: 1, built: '2026-11-07', packs: [{ code: '1380600000', name: 'Metro Manila', version: 1, checksum: 'x', size: 1, rows: 1, path: '1380600000/p.json', neighbours: [], hazards: { pack: '1380600000', version: 1, checksum: 'hz', size: MFILE.length, path: MPATH, bounds: { flood: MBOX, landslide: MBOX, surge: MBOX } } }] }) })
    if (rel !== MPATH) return r.fulfill({ status: 404, headers: h })
    const m = /bytes=(\d+)-(\d+)/.exec(req.headers().range ?? '')
    if (!m) return r.fulfill({ status: 200, headers: h, body: MFILE })
    ranges.push(req.headers().range!)
    const a = Number(m[1]), b = Math.min(Number(m[2]), MFILE.length - 1)
    return r.fulfill({ status: 206, headers: { ...h, 'content-range': `bytes ${a}-${b}/${MFILE.length}`, 'content-type': 'application/octet-stream' }, body: MFILE.subarray(a, b + 1) })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#today')
  await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
  await page.evaluate(() => { location.hash = '#safety/hazards' })
  await expect(page.getByTestId('hazards-zone')).toContainText('Metro Manila', { timeout: 20000 })
  return ranges
}

test('away from home (Metro Manila, no stored file): This place card, rings, the empty sentence is gone, and the overlay paints from the public file', async ({ page, context }) => {
  const ranges = await openAway(page, context)
  await expect(page.getByText(/No hazard readings for/)).toHaveCount(0)
  await expect(page.getByTestId('hz-ring-flood')).toHaveAttribute('data-state', 'filled')
  await expect(page.getByTestId('hz-rings').getByRole('img')).toHaveCount(3)
  await expect(page.getByTestId('layer-caption')).toContainText('Flood level from NOAH: Medium')
  await expect(page.getByTestId('hz-legend')).toContainText('Flood level')
  await expect.poll(() => painted(page), { timeout: 20000 }).toBeGreaterThan(0)
  expect(ranges.length).toBeGreaterThan(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/haz-away.png` })
})

for (const [w, h] of [[360, 740], [390, 844], [430, 932]] as const) {
  test(`away layout: Jack clears every control at ${w}x${h}`, async ({ page, context }) => {
    await page.setViewportSize({ width: w, height: h })
    await openAway(page, context)
    await expect(page.getByTestId('hz-legend')).toBeVisible()
    await assertJackHit(page, [], `hazards away ${w}x${h}`)
    await page.evaluate(() => { const sc = document.querySelector('.bt .scroll') as HTMLElement; sc.scrollTop = sc.scrollHeight })
    await assertJackHit(page, [], `hazards away end ${w}x${h}`, 'keep')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/haz-away-${w}.png` })
  })
}
