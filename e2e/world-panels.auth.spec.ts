import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { assertNoSideways, assertTargets, assertTextContrast, setScheme } from './v13'
import { admin } from './fixtures/s16/settings'
import { seed } from './fixtures/s16/today'
import { shotPath } from './shotPath'

// Phase 2 lane G: World panels, headlines, EONET rows and the digest card, signed in (the auth build loads its CSS in a different order).
// Invented events only. The headline and digest rows are mocked REST answers; the digest day is today's Manila day.
const API = 'https://bantay-test.supabase.test'
const NOW = new Date().toISOString() // the signed-in app locks when the clock is frozen, so the digest uses today's Manila day and a 00:00 show time instead
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
const DIR = shotPath('docs/redesign-2026-10-31/shots/p2-G')
mkdirSync(DIR, { recursive: true })

const alert = (o: Record<string, unknown>) => ({ level: null, what: '', where: '', when: '', doNow: '', sourceUrl: null, bulletin: '', lat: null, lon: null, ...o })
const EONET = [
  alert({ id: 'eonet-v1', kind: 'eonet', title: 'Volcano eruption, Example Island', source: 'NASA EONET', issuedAt: '2026-11-04T16:00:00Z', lat: -7.5, lon: 110.4 }),
  alert({ id: 'eonet-f1', kind: 'eonet', title: 'Wildfire, Example Valley', source: 'NASA EONET', issuedAt: '2026-11-04T10:00:00Z', lat: 30, lon: 75 })
]
const ALERTS = [
  alert({ id: 'pv1', kind: 'volcano', level: 'Level 2', title: 'Example volcano, alert level 2', source: 'PHIVOLCS', issuedAt: '2026-11-04T20:00:00Z', lat: 13.2, lon: 123.6 })
]
const NEWS = [
  { id: 'gdelt-0000000000000001', title: 'Example fuel price outlook for the week', url: 'https://news.example/a/1', source_domain: 'news.example', seen_at: '2026-11-05T00:20:00Z' },
  { id: 'gdelt-0000000000000002', title: 'Example regional shipping delays ease', url: 'https://news.example/a/2', source_domain: 'news.example', seen_at: '2026-11-04T22:00:00Z' }
]
const DIGEST = { day: DAY, body: { day: DAY, counts: { tcws: 1, quake: 2 }, top: [{ id: 'a', title: 'Example wind signal 1', kind: 'tcws', level: 'Signal No. 1', source: 'PAGASA' }], sources: 'PAGASA, USGS', summary: 'Three warnings, none urgent.' } }

async function open(page: Page, scheme: 'light' | 'dark', w = 390) {
  await admin(page)
  await page.addInitScript(() => localStorage.setItem('bantay.flags', JSON.stringify({ worldFeeds: true, eonet: true, digest: true })))
  await page.route(`${API}/rest/v1/world_news*`, (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(NEWS) }))
  await page.route(`${API}/rest/v1/safety_digests*`, (r) => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify([DIGEST]) }))
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await page.setViewportSize({ width: w, height: 844 })
  await page.goto('/#today')
  await expect(page.getByRole('button', { name: '1', exact: true })).toHaveCount(0) // signed in, no PIN pad
  await expect(page.locator('.bt .scroll h1').first()).toBeVisible()
  await seed(page, 'bantay', 'kv', [{ key: 'safety.alerts', value: ALERTS }, { key: 'safety.eonet', value: EONET }, { key: 'alerts:checkedAt', value: NOW }, { key: 'safety.alertPrefs', value: { digestTime: '00:00' } }])
  await page.evaluate(() => { location.hash = '#safety/world' }) // no reload (it would show the PIN screen); World mounts now and reads the seeded rows fresh
  await setScheme(page, scheme)
  await expect(page.getByRole('heading', { name: 'Macro and news' })).toBeVisible()
}

for (const [scheme, w] of [['light', 390], ['dark', 390], ['light', 360]] as const) {
  test(`World panels ${scheme} ${w}: rows, headlines, digest`, async ({ page }) => {
    await open(page, scheme, w)
    await expect(page.getByRole('heading', { name: 'Forecasts to watch' })).toBeVisible()
    const link = page.getByRole('link', { name: /Example fuel price outlook/ })
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(page.getByText('Three warnings, none urgent.')).toBeVisible()
    await expect(page.getByText(/Example wind signal 1 · PAGASA/)).toBeVisible()
    await assertNoSideways(page)
    await assertTargets(page)
    await assertTextContrast(page)
    const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? 844)
    await page.setViewportSize({ width: w, height: Math.min(h + 140, 5000) })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${DIR}/world-${scheme}-${w}.png`, animations: 'disabled' })
  })
}

test('Manage panels sheet turns a panel off', async ({ page }) => {
  await open(page, 'light')
  await page.getByRole('button', { name: 'Manage panels' }).click()
  const sheet = page.getByRole('dialog', { name: 'Manage panels' })
  await expect(sheet.getByRole('switch')).toHaveCount(3)
  await sheet.getByRole('switch', { name: 'Macro and news' }).click()
  await expect(page.getByRole('heading', { name: 'Macro and news' })).toHaveCount(0)
  await page.screenshot({ path: `${DIR}/manage-light-390.png`, animations: 'disabled' })
})
