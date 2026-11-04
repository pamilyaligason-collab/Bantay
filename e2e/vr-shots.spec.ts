import { test } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { setScheme, settled } from './v13'
import { seed } from './fixtures/s16/today'

// Lane VR: full-page shots for the visual lane (only with VR_SHOTS=<dir>). Invented data.
declare const process: { env: Record<string, string | undefined> }
const DIR = process.env.VR_SHOTS
test.skip(!DIR, 'VR_SHOTS not set')
test.use({ serviceWorkers: 'block' })

const quake = (ageH: number) => ({ id: 'q-vr', kind: 'quake', level: 'M4.6', title: 'M 4.6 - 7 km NE of Tago', what: 'Moderate quake.', where: '7 km NE of Tago, Surigao del Sur', when: 'now', doNow: 'Drop, cover and hold on.', source: 'USGS', sourceUrl: null, issuedAt: new Date(Date.now() - ageH * 3_600_000).toISOString(), lat: 12.1, lon: 123.88, bulletin: 'x', checkedAt: new Date().toISOString() })

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.route('https://embed.windy.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body style="margin:0;background:#cfd8dc"></body>' }))
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
})

const WANT: Array<[string, string, 'empty' | 'filled']> = [
  ['Safety', '#safety', 'empty'], ['Safety-filled', '#safety', 'filled'],
  ['Warnings-empty', '#safety/warnings', 'empty'], ['Warnings-filled', '#safety/warnings', 'filled'],
  ['StormTracker', '#safety/storms', 'empty'], ['StormTracker-checked', '#safety/storms', 'filled'],
  ['RescueMap', '#safety/map', 'empty']
]
for (const w of [390, 360]) for (const [name, hash, kind] of WANT) {
  test(`shot ${name} ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 })
    await page.goto('/' + hash)
    await settled(page)
    if (kind === 'filled') {
      await seed(page, 'bantay', 'kv', [{ key: 'safety.alerts', value: [quake(11)] }, { key: 'alerts:checkedAt', value: new Date().toISOString() }])
      await page.reload()
      await settled(page)
    }
    await page.waitForTimeout(900)
    for (const s of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: w, height: 844 })
      await setScheme(page, s)
      const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement).scrollHeight)
      await page.setViewportSize({ width: w, height: Math.min(h + 120, 4000) })
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${DIR}/${name}-${s}-${w}.png`, animations: 'disabled' })
    }
  })
}
