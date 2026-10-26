import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S1 ALERTS-INAPP shots (390x844, light and dark): start-inbox, lock-missed (alert list with count), today-full (alert card variant, needs AlertCardToday mounted
// in Today), start-banner (switch-to-app banner, shown once kv alerts.inapp.ok is true). Synthetic rows only: template ids, no values.
declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = 'docs/session-10/shots/S1'
type Row = Record<string, unknown>

async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await page.evaluate(async ([name, st, list]) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open(name as string)
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction(st as string, 'readwrite')
        for (const r of list as Row[]) tx.objectStore(st as string).put(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows] as const)
}
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
const alertRow = (id: string, kind: string, template: string, minAgo: number, extra: Row = {}) => ({ id, personId: 'p1', kind, template, ref: id, createdAt: ago(minAgo), pushedAt: null, seenAt: null, expiresAt: inDays(7), ...extra })

const ROWS = [
  alertRow('a1', 'dose_missed', 'dose_missed', 70, { ref: 'm1:2026-10-26:09:00' }),
  alertRow('a2', 'hazard', 'storm_warning', 130),
  alertRow('a3', 'mood_unwell', 'mood_unwell', 200),
  alertRow('a4', 'digest', 'digest', 24 * 60 + 30, { seenAt: ago(24 * 60) }),
  alertRow('a5', 'review_open', 'review_open', 26 * 60, { seenAt: ago(25 * 60) })
]

async function open(page: Page) {
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#today')
  await expect(page.locator('h1').first()).toBeVisible()
  await seed(page, 'bantay-alerts', 'alerts', ROWS)
  await seed(page, 'bantay', 'kv', [{ key: 'alerts.inapp.ok', value: true }])
}

for (const scheme of ['light', 'dark'] as const) {
  test(`alert list ${scheme}`, async ({ page }) => {
    await open(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#notif')
    await page.reload() // raw IndexedDB writes do not notify live queries
    await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible()
    await expect(page.getByText('Family alerts show here when you open Bantay')).toBeVisible()
    await expect(page.getByText('A medicine was missed')).toBeVisible()
    expect(await page.getByRole('img', { name: 'New' }).count()).toBeGreaterThanOrEqual(3) // a1, a2, a3 are unseen (other inbox sources may add a dot)
    await expect(page.getByRole('link', { name: /A medicine was missed/ }).getByRole('img', { name: 'New' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Digest|summary is ready/ }).getByRole('img', { name: 'New' })).toHaveCount(0) // a seen row has no dot
    await expect(page.getByRole('link', { name: 'Message the family' })).toBeVisible() // the missed-dose row actions
    await page.screenshot({ path: `${SHOTS}/start-inbox-${scheme}.png` })
    await page.screenshot({ path: `${SHOTS}/lock-missed-${scheme}.png` })
  })

  test(`family tab badge and bell ${scheme}`, async ({ page }) => {
    await open(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.reload()
    await expect(page.getByRole('img', { name: '3 new alerts' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Notifications, 3 new' })).toBeVisible()
  })

  test(`today alert card and switch banner ${scheme}`, async ({ page }) => {
    // standalone Android PWA, a readable release manifest: the conditions of the switch-to-app banner
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' })
      const mm = window.matchMedia.bind(window)
      window.matchMedia = (q: string) => (q.includes('display-mode: standalone') ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as unknown as MediaQueryList) : mm(q))
    })
    await page.route('**/latest.json', (r) => r.fulfill({ json: { versionCode: 99, versionName: '2.3.0', url: 'https://bantay.pages.dev/get/bantay.apk' } }))
    await open(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.reload()
    const banner = page.getByRole('region', { name: 'Bantay is now an app' })
    await expect(banner).toBeVisible()
    await banner.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/start-banner-${scheme}.png` })
    const card = page.getByRole('region', { name: 'Family alert' }) // needs AlertCardToday mounted in Today (S7 owns Today.tsx); the shot run mounts it temporarily
    if (process.env.S1_CARD === '1') {
      await expect(card).toContainText('A medicine was missed')
      await card.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${SHOTS}/today-full-${scheme}.png` })
    }
  })
}
