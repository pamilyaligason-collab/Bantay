import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertHero, assertJackClear, assertNarrow, assertNoSideways, assertOrder, assertTargets, assertTextContrast, setScheme, settled, shotsLightDark } from './v13'
import { seed } from './fixtures/s16/today'

// Phase 1 lane S (v13): the ten Safety screens through the shared e2e/v13.ts helpers (boxes and computed colours, never page heights).
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })

const SCREENS: Array<[name: string, hash: string]> = [
  ['Safety', '#safety'], ['Warnings', '#safety/warnings'], ['StormTracker', '#safety/storms'], ['Hazards', '#safety/hazards'], ['RescueMap', '#safety/map'],
  ['FirstAid', '#safety/firstaid'], ['FirstAidCPR', '#safety/firstaid/cpr'], ['OfflineMaps', '#safety/offline'], ['World', '#safety/world'], ['AlertSettings', '#safety/alerts']
]

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' }))
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
})

let errors: string[] = []
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`) })
})

for (const [name, hash] of SCREENS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${name} ${scheme} 390: targets, contrast, no sideways, no console errors`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(`/${hash}`)
      await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
      await setScheme(page, scheme)
      await expect(page.locator('.bt .scroll h1')).toHaveCount(1) // one head per screen
      await assertTargets(page)
      await assertTextContrast(page)
      await assertNoSideways(page)
      expect(errors).toEqual([])
    })
  }
  test(`${name} 360: targets and no sideways`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto(`/${hash}`)
    await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
    await assertTargets(page)
    await assertNoSideways(page)
  })
  test(`${name} 195: no sideways, targets, no wrapped buttons`, async ({ page }) => {
    await page.goto(`/${hash}`)
    await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
    await assertNarrow(page)
  })
  test(`${name}: shots (only with V13_SHOTS=<dir>)`, async ({ page }) => {
    await page.goto(`/${hash}`)
    await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
    await page.waitForTimeout(600)
    await shotsLightDark(page, name)
  })
}

test('Safety home has exactly one hero', async ({ page }) => {
  await page.goto('/#safety')
  await expect(page.locator('h1').first()).toBeVisible()
  await assertHero(page)
})

test.describe('CPR beat under reduced motion', () => {
  test('Start becomes Stop and the beat dot gains and loses data-on', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => { const w = window as unknown as { __buzz: number }; w.__buzz = 0; navigator.vibrate = () => { w.__buzz++; return true } })
    await page.goto('/#safety/firstaid/cpr')
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible()
    const dot = page.locator('[data-testid="cpr-beat"] .cpr-dot')
    await expect(dot).toHaveAttribute('data-on', 'true', { timeout: 1500 })
    await expect(dot).toHaveAttribute('data-on', 'false', { timeout: 1500 })
    expect(await page.evaluate(() => (window as unknown as { __buzz: number }).__buzz)).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(dot).toHaveAttribute('data-on', 'false')
  })
})

// ---- S3 Warnings ----
test.describe('S3', () => {
  const seedQuake = (page: Page) => page.evaluate(async () => {
    const q = { id: 'q-s3', kind: 'quake', level: 'M4.6', title: 'M 4.6 - 7 km NE of Tago', what: 'Moderate quake.', where: '7 km NE of Tago, Surigao del Sur', when: 'now', doNow: 'Drop, cover and hold on.', source: 'USGS', sourceUrl: null, issuedAt: new Date(Date.now() - 11 * 3_600_000).toISOString(), lat: 12.1, lon: 123.88, bulletin: 'x', checkedAt: new Date().toISOString() }
    await new Promise<void>((res, rej) => {
      const o = indexedDB.open('bantay')
      o.onerror = () => rej(o.error)
      o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ key: 'safety.alerts', value: [q] }); tx.oncomplete = () => { o.result.close(); res() } }
    })
  })
  test('a live position in a named area: the far old quake says too far to feel there, no action needed, no Do this now', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 7.07, longitude: 125.6 }) // Davao: 559 km from the seeded M4.6
    await page.goto('/#safety/warnings')
    await seedQuake(page)
    await page.reload()
    await expect(page.getByTestId('warn-hero')).toContainText('Too far to feel in Davao. No action needed.')
    await expect(page.getByText('Do this now')).toHaveCount(0)
  })
  test('warnings: empty state, then a seeded far old quake with location off says the soft line and shows the steps, with the map, sources and a collapsed shaking row', async ({ page }) => {
    await page.goto('/#safety/warnings')
    await expect(page.getByTestId('warn-hero')).toContainText('No warnings on this phone')
    await seedQuake(page)
    await page.reload()
    await expect(page.getByTestId('warn-hero')).toContainText('Probably too far to feel strongly. If you felt shaking, follow the steps below.')
    await expect(page.getByText(/no action needed/i)).toHaveCount(0)
    await expect(page.getByText('Do this now')).toBeVisible()
    await expect(page.getByRole('region', { name: /Map of the warning/ })).toBeVisible()
    await expect(page.locator('.leaflet-container')).toHaveCount(1)
    await expect(page.getByRole('list', { name: 'Sources' })).toContainText('Checked')
    const shake = page.getByRole('button', { name: /If you ever feel shaking/ })
    await expect(shake).toHaveAttribute('aria-expanded', 'false')
    await shake.click()
    await expect(shake).toHaveAttribute('aria-expanded', 'true')
    await assertTargets(page)
    await assertNoSideways(page)
  })
})

// D1 (W4): the Rain row value is the longer "Today up to N%"; measured, not assumed, at 390 and at 195
test.describe('sources: W4 Rain row', () => {
  test('the Rain value "Today up to 96%" and its line fit inside the row and the screen at 390 and 195', async ({ page }) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    const body = { timezone: 'Asia/Manila', utc_offset_seconds: 28800, current: { time: '2026-11-02T10:00', temperature_2m: 30, weather_code: 3 }, hourly: { time: [], precipitation_probability: [] }, daily: { time: ['2026-11-02'], precipitation_probability_max: [96] } }
    await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) }))
    for (const width of [390, 195]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/#safety')
      await page.reload()
      const row = page.getByTestId('right-now').getByRole('listitem').filter({ hasText: 'Rain' }).first()
      await expect(row.locator('.rw-value')).toHaveText('Today up to 96%')
      const m = await row.evaluate((el) => {
        const box = (q: string) => el.querySelector(q)!.getBoundingClientRect()
        const v = el.querySelector('.rw-value') as HTMLElement
        const r = el.getBoundingClientRect(); const val = box('.rw-value'); const txt = box('.rw-txt')
        const apart = val.right <= txt.left + 0.5 || val.left >= txt.right - 0.5 || val.bottom <= txt.top + 0.5 || val.top >= txt.bottom - 0.5 // side by side or stacked, never on top of each other
        return { rowL: r.left, rowR: r.right, valL: val.left, valR: val.right, valH: val.height, valTop: val.top, txtL: txt.left, txtR: txt.right, txtBottom: txt.bottom, apart, clipped: v.scrollWidth > v.clientWidth + 1, vw: document.documentElement.clientWidth }
      })
      expect(m.valR, `value right edge at ${width}: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.rowR + 0.5)
      expect(m.valR).toBeLessThanOrEqual(m.vw)
      console.log(`rain row at ${width}px: ${JSON.stringify(m)}`)
      expect(m.apart, `value and line overlap at ${width}: ${JSON.stringify(m)}`).toBe(true)
      expect(m.valL).toBeGreaterThanOrEqual(m.rowL - 0.5)
      expect(m.clipped).toBe(false)
      await assertNoSideways(page)
    }
  })
})

// ---- S4 Storm tracker ----
test.describe('S4', () => {
  test('storms: PAR polygon, No storms now, Windy waits for Load on cellular', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, configurable: true }))
    await page.goto('/#safety/storms')
    await expect(page.getByTestId('storm-hero')).toContainText('Storms not checked lately')
    await expect(page.locator('.leaflet-interactive')).toHaveCount(0) // PAR ring is non-interactive; the path itself is .lm-par
    await expect(page.locator('path.lm-par')).toHaveCount(1)
    await expect(page.locator('iframe.sf-frame')).toHaveCount(0)
    await page.getByRole('button', { name: 'Load live layer' }).click()
    await expect(page.locator('iframe.sf-frame')).toHaveCount(1)
    await assertTargets(page)
    await assertNoSideways(page)
  })
})

// ---- S5 Hazards ----
test.describe('S5', () => {
  test('hazards: Dampas readings, layer switch changes the caption only, NOAH and HazardHunterPH links', async ({ page }) => {
    await page.goto('/#safety/hazards')
    await expect(page.getByTestId('hazards-zone')).toContainText('Dampas')
    await expect(page.getByTestId('layer-caption')).toContainText('No flood map')
    await page.getByRole('button', { name: 'Landslide' }).click()
    await expect(page.getByTestId('layer-caption')).toContainText('Low')
    await expect(page.locator('.leaflet-container')).toHaveCount(1)
    await expect(page.getByRole('link', { name: /Open in NOAH/ })).toHaveAttribute('href', 'https://noah.up.edu.ph/')
    await expect(page.getByRole('link', { name: /Open HazardHunterPH/ })).toBeVisible()
    await assertTargets(page)
    await assertNoSideways(page)
  })
})

// ---- Visual lane VR ----
const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number) as [number, number, number]
const greenish = ([r, g, b]: [number, number, number]) => g > r + 12 && g > b + 12
const vrQuake = () => ({ id: 'q-vr', kind: 'quake', level: 'M4.6', title: 'M 4.6 - 7 km NE of Tago', what: 'x', where: '7 km NE of Tago', when: 'now', doNow: 'x', source: 'USGS', sourceUrl: null, issuedAt: new Date(Date.now() - 11 * 3_600_000).toISOString(), lat: 12.1, lon: 123.88, bulletin: 'x', checkedAt: new Date().toISOString() })

test.describe('VR', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`Storm tracker not checked wears no green, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/#safety/storms')
      await expect(page.getByTestId('storm-hero')).toContainText('Storms not checked lately')
      await setScheme(page, scheme)
      const c = await page.evaluate(() => {
        const get = (q: string) => getComputedStyle(document.querySelector(q)!)
        return { dot: get('.st-dot').backgroundColor, box: get('.st-line').backgroundColor, boxBorder: get('.st-line').borderTopColor, head: get('.st-status').color }
      })
      for (const [k, v] of Object.entries(c)) expect(greenish(rgb(v)), `${k} ${v} must not be green on a not-checked state`).toBe(false)
    })
  }
  test('Storm tracker: heading and map share one card, the layer switch and PAR label sit inside the map', async ({ page }) => {
    await page.goto('/#safety/storms')
    await settled(page)
    await expect(page.locator('.st-par')).toBeVisible()
    const m = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="st-map"]')!
      const layer = card.querySelector('.mapc-layer')!.getBoundingClientRect()
      const ov = card.querySelector('.mapc-ov')!.getBoundingClientRect()
      const par = document.querySelector('.st-par')!.getBoundingClientRect()
      return { inHero: !!document.querySelector('[data-testid="storm-hero"] [data-testid="st-map"]'), ovPast: ov.right - layer.right, parIn: par.left >= layer.left && par.right <= layer.right && par.bottom <= layer.bottom && par.top >= layer.top }
    })
    expect(m.inHero).toBe(true)
    expect(m.ovPast, 'layer switch right edge vs map right edge').toBeLessThanOrEqual(0.5)
    expect(m.parIn).toBe(true)
  })
  for (const w of [320, 360, 390]) for (const scheme of ['light', 'dark'] as const) {
    test(`Safety header at ${w} ${scheme}: the whole place name reads, the left label stays on one line`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width: w, height: 780 })
      await page.goto('/#safety')
      await settled(page)
      await setScheme(page, scheme)
      const m = await page.evaluate(() => {
        const chip = document.querySelector('.lt-below .zp-t, .lt-actions .zp-t')!
        const k = document.querySelector('.lt-kicker')!
        const r = chip.getBoundingClientRect(); const kr = k.getBoundingClientRect()
        return { cut: chip.scrollWidth > chip.clientWidth + 1 || chip.scrollHeight > chip.clientHeight + 1, right: r.right, vw: document.documentElement.clientWidth, text: chip.textContent, kLines: Math.round(kr.height / parseFloat(getComputedStyle(k).lineHeight)) }
      })
      expect(m.cut, `chip "${m.text}" is cut`).toBe(false)
      expect(m.right).toBeLessThanOrEqual(m.vw)
      expect(m.kLines).toBe(1)
      await assertNoSideways(page)
    })
  }
  for (const w of [360, 390]) {
    test(`Right now: no link under Jack at rest at ${w}, with the stale banner and with a fresh quake`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 })
      await page.goto('/#safety')
      await assertJackClear(page, { at: 'rest' })
      const cutTitles = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="right-now"] .rw-title')).filter((t) => t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().height > 46).map((t) => t.textContent))
      expect(await cutTitles(), 'row titles are not cut and not broken into pieces (two lines at most)').toEqual([])
      await seed(page, 'bantay', 'kv', [{ key: 'safety.alerts', value: [vrQuake()] }, { key: 'alerts:checkedAt', value: new Date().toISOString() }])
      await page.reload()
      await assertJackClear(page, { at: 'rest' })
      expect(await cutTitles(), 'row titles are not cut and not broken into pieces (two lines at most)').toEqual([])
      await assertTargets(page)
    })
  }
  test('Warnings with a warning: the map is the top of one card and the event sits under it', async ({ page }) => {
    await page.goto('/#safety/warnings')
    await seed(page, 'bantay', 'kv', [{ key: 'safety.alerts', value: [vrQuake()] }])
    await page.reload()
    await settled(page)
    const m = await page.evaluate(() => {
      const top = document.querySelector('.wn-top')!
      const map = top.querySelector('[data-testid="wn-map"]')!.getBoundingClientRect()
      const hero = top.querySelector('[data-testid="warn-hero"]')!.getBoundingClientRect()
      return { mapFirst: map.top < hero.top, mapPad: map.left - top.getBoundingClientRect().left }
    })
    expect(m.mapFirst).toBe(true)
    expect(m.mapPad, 'map runs to the card edge (plus its 1.5 px border)').toBeLessThanOrEqual(2)
  })
  test('Rescue map: the map is full width at the top and the sheet rises over it', async ({ page }) => {
    await page.goto('/#safety/map')
    await settled(page)
    const m = await page.evaluate(() => {
      const map = document.querySelector('.rm-mapc')!.getBoundingClientRect()
      const sheet = document.querySelector('.rm-sheet')!.getBoundingClientRect()
      return { mapW: map.width, scW: document.querySelector('.bt .scroll')!.getBoundingClientRect().width, over: map.bottom - sheet.top, chipsBelow: document.querySelector('.rm-chips')!.getBoundingClientRect().top >= sheet.top, h2: document.querySelector('.rm-sheet h2')?.textContent }
    })
    expect(m.mapW).toBeGreaterThanOrEqual(m.scW - 1)
    expect(m.over).toBeGreaterThan(10)
    expect(m.chipsBelow).toBe(true)
    expect(m.h2).toBe('Nearest help')
  })
})

// ---- Gaps lane S: W3 hero, S3 Jack, W2 order, W7 overlay, last-known chip ----
test.describe('gaps S', () => {
  test('W3: the hero is at most 240 px, Call 911 and Medical ID share one row, nothing sits under Jack', async ({ page }) => {
    await page.goto('/#safety')
    await settled(page)
    const hero = page.locator('[data-hero]')
    expect((await hero.boundingBox())!.height).toBeLessThanOrEqual(240)
    const row = await page.locator('.sf-pair > a').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)] }))
    expect(row.length).toBe(2)
    expect(row[0]![0]).toBe(row[1]![0])
    await expect(page.getByRole('link', { name: 'Call 911' })).toBeVisible()
    for (const scheme of ['light', 'dark'] as const) { await setScheme(page, scheme); await assertTextContrast(page) }
    await assertJackClear(page, { at: 'both' }) // D-110: the Right now rows stop short of Jack
    await assertTargets(page)
  })
  for (const hash of ['#safety', '#safety/warnings', '#medid', '#safety/dial', '#safety/cards', '#safety/sources']) {
    test(`S3 S10: ${hash} has no control under Jack and no small target`, async ({ page }) => {
      await page.goto(`/${hash}`)
      await settled(page)
      await assertJackClear(page, { at: 'both' })
      await assertTargets(page)
    })
  }
  test('W2: Warnings reads map, Last event, sources, news', async ({ page }) => {
    await page.goto('/#safety/warnings')
    await settled(page)
    await assertOrder(page, ['wn-map', 'wn-last', 'wn-sources', 'wn-news'])
  })
  test('W7: the layer switch sits inside the storm map card, top right, clear of the credit', async ({ page }) => {
    await page.goto('/#safety/storms')
    await settled(page)
    const m = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="st-map"]')!
      const ov = card.querySelector('.mapc-ov')!.getBoundingClientRect()
      const c = card.getBoundingClientRect(); const credit = card.querySelector('.mapc-credit')!.getBoundingClientRect()
      return { right: c.right - ov.right, top: ov.top - c.top, clear: ov.bottom <= credit.top }
    })
    expect(m.clear).toBe(true)
    expect(m.top).toBeLessThanOrEqual(16)
    expect(m.right).toBeLessThanOrEqual(16)
  })
  for (const w of [360, 195]) {
    test(`a last-known place keeps "last known" readable at ${w}`, async ({ page }) => {
      await page.goto('/#safety')
      await seed(page, 'bantay', 'kv', [{ key: 'loc.last', value: { lat: 10.3157, lon: 123.8854, at: Date.now() - 60_000 } }])
      await page.setViewportSize({ width: w, height: 780 })
      await page.reload()
      const chip = page.getByTestId('place-last')
      await expect(chip).toBeVisible()
      const cut = await chip.locator('.zp-t').evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      expect(cut, 'the chip words are not cut').toBe(false)
      await expect(chip.locator('.zp-t')).toContainText('last known')
      await assertNoSideways(page)
    })
  }
})
