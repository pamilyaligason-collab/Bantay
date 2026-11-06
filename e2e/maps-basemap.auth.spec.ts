import { expect, test, type Page } from '@playwright/test'
import { admin } from './fixtures/s16/settings'
import { BASEMAP_BOUNDS, basemapFile, P } from './fixtures/p2/pmtilesFixture'

// Maps round 1 (D-131, D-132): the shared basemap on the Safety maps, signed-in build (it has a Supabase base URL for the pack files, every call mocked).
// Hazards is z13 over Dampas (inside the fixture box); the Storm tracker is z5 (too far out for a province file, so OSM pictures).
const API = 'https://bantay-test.supabase.test'
const FILES = `${API}/storage/v1/object/public/region-packs/`
const PATH = '0701200000/basemap-fixture.pmtiles'
const FILE = basemapFile(P)
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range, content-length' }
const INDEX = {
  format: 1, built: '2026-11-06',
  packs: [{ code: '0701200000', name: 'Bohol', version: 1, checksum: 'x', size: 1, rows: 1, path: '0701200000/p.json', neighbours: [], basemap: { version: 1, checksum: 'fx', size: FILE.length, path: PATH, bounds: BASEMAP_BOUNDS(P), minzoom: 8, maxzoom: 12 } }]
}

test.use({ viewport: { width: 390, height: 844 } })

type Seen = { osm: string[]; ranges: string[] }
async function open(page: Page, flag: boolean): Promise<Seen> {
  const seen: Seen = { osm: [], ranges: [] }
  await admin(page)
  await page.addInitScript((on) => { localStorage.setItem('bantay.flags', JSON.stringify({ offlineMaps: on })) }, flag)
  await page.route('https://tile.openstreetmap.org/**', (r) => { seen.osm.push(r.request().url()); return r.fulfill({ status: 204 }) })
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body></body>' }))
  await page.route(`${FILES}**`, (r) => {
    const req = r.request(), rel = req.url().replace(FILES, '')
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    if (rel.startsWith('index.json')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(INDEX) })
    if (rel !== PATH) return r.fulfill({ status: 404, headers: cors })
    const m = /bytes=(\d+)-(\d+)/.exec(req.headers().range ?? '')
    if (!m) return r.fulfill({ status: 200, headers: cors, body: FILE })
    seen.ranges.push(req.headers().range!)
    const a = Number(m[1]), b = Math.min(Number(m[2]), FILE.length - 1)
    return r.fulfill({ status: 206, headers: { ...cors, 'content-range': `bytes ${a}-${b}/${FILE.length}`, 'content-type': 'application/octet-stream' }, body: FILE.subarray(a, b + 1) })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#today')
  await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
  return seen
}
const go = (page: Page, hash: string) => page.evaluate((h) => { location.hash = h }, hash) // no reload: it would show the PIN screen

/** Canvases of the vector basemap that have painted something. */
const painted = (page: Page, id: string) => page.evaluate((tid) => [...document.querySelectorAll(`[data-testid="${tid}"] .leaflet-tile-pane canvas`)].filter((c) => {
  const cv = c as HTMLCanvasElement
  const d = cv.getContext('2d')?.getImageData(0, 0, cv.width, cv.height).data
  return !!d && d.some((v, i) => i % 4 === 3 && v > 0)
}).length, id)

test('flag on, inside the zone: the vector basemap draws from range requests and OSM is never asked', async ({ page }) => {
  const seen = await open(page, true)
  await go(page, '#safety/hazards')
  await expect(page.getByTestId('hazards-map')).toBeVisible()
  await expect.poll(() => painted(page, 'hazards-map'), { timeout: 15000 }).toBeGreaterThan(0)
  expect(seen.ranges.length).toBeGreaterThan(0)
  expect(seen.osm).toEqual([])
  await expect(page.getByTestId('hazards-map').getByText('© OpenStreetMap contributors')).toBeVisible()
})

test('flag on, outside the zone (Storm tracker centred on Manila, far outside the fixture box): OSM pictures as before, no pack file read', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 14.6, longitude: 121 })
  const seen = await open(page, true)
  await go(page, '#safety/storms')
  await expect(page.locator('.leaflet-tile-pane').first()).toBeAttached()
  await expect.poll(() => seen.osm.length, { timeout: 15000 }).toBeGreaterThan(0)
  expect(seen.ranges).toEqual([])
  expect(await page.locator('.leaflet-tile-pane canvas').count()).toBe(0)
})

test('flag off: OSM pictures even inside the zone, no pack file and no index read', async ({ page }) => {
  const seen = await open(page, false)
  await go(page, '#safety/hazards')
  await expect.poll(() => seen.osm.length, { timeout: 15000 }).toBeGreaterThan(0)
  expect(seen.ranges).toEqual([])
  expect(await page.locator('.leaflet-tile-pane canvas').count()).toBe(0)
})

/** Put the fixture file on the phone as a finished download would (Bohol's row, bounds around Dampas). */
async function seedBasemap(page: Page) {
  await page.evaluate(([b64, bounds]) => new Promise<void>((done, fail) => {
    const raw = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0))
    const o = indexedDB.open('bantay')
    o.onerror = () => fail(new Error('open failed'))
    o.onsuccess = () => {
      const tx = o.result.transaction('packs', 'readwrite')
      tx.objectStore('packs').put({ code: '0701200000', version: 1, checksum: 'x', name: 'Bohol', neighbours: [], places: [], fetchedAt: 1, usedAt: Date.now(), pinned: true, basemap: { checksum: 'fx', bounds, blob: new Blob([raw]), savedAt: '2026-11-06T00:00:00.000Z' } })
      tx.oncomplete = () => { o.result.close(); done() }
      tx.onerror = () => fail(new Error('put failed'))
    }
  }), [FILE.toString('base64'), BASEMAP_BOUNDS(P)] as const)
}

test('offline with a stored file renders the basemap with no network at all', async ({ page, context }) => {
  const seen = await open(page, true)
  await seedBasemap(page)
  // the lazy map code is cached by the real app's service worker (blocked in this build), so load it once online; the stored file wins over the stream either way
  await go(page, '#safety/hazards')
  await expect.poll(() => painted(page, 'hazards-map'), { timeout: 15000 }).toBeGreaterThan(0)
  await go(page, '#safety')
  await expect(page.getByTestId('hazards-map')).toHaveCount(0)
  await context.setOffline(true)
  await go(page, '#safety/hazards')
  await expect(page.getByTestId('hazards-map')).toBeVisible()
  await expect.poll(() => painted(page, 'hazards-map'), { timeout: 15000 }).toBeGreaterThan(0)
  expect(seen.ranges).toEqual([])
  expect(seen.osm).toEqual([])
})

test('offline without a stored file shows the internet line', async ({ page, context }) => {
  await open(page, true)
  await context.setOffline(true)
  await go(page, '#safety/hazards')
  await expect(page.getByTestId('hazards-map').getByText('Maps need internet. The list below still works.')).toBeVisible()
})
