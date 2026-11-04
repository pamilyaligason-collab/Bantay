import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { assertJackClear, assertNoSideways, FIXED_CLOCKS, setScheme } from './v13'
import { shotPath } from './shotPath'

// Lane VS (visual fix round): measured assertions for the items the Opus visual check marked `wrong`, plus the full-page shots of Today, the Alerts inbox, the Jack sheet and the app banner.
// Shots go to docs/redesign-2026-10-31/shots/visual-VS/ only with DOC_SHOTS=1 (shotPath), else test-results/doc-shots/. Invented data only.
declare const process: { env: Record<string, string | undefined> }
const SHOTS = shotPath('docs/redesign-2026-10-31/shots/visual-VS')
type Row = Record<string, unknown>

/** Contrast of an element's text against the first opaque background above it (composites nothing: bands are solid in these screens). */
export const contrastOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => {
  const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
  const lum = ([r, g, b]: number[]) => { const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!) }
  let bg = [255, 255, 255]
  for (let n: Element | null = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.95) { bg = c; break } }
  const a = lum(rgb(getComputedStyle(e).color)); const b = lum(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
})

/** First screen at rest, then the whole scroller on a tall viewport. */
async function shoot(page: Page, name: string, tall = true) {
  await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement | null; if (s) s.scrollTop = 0 })
  await page.screenshot({ path: `${SHOTS}/${name}-top.png` })
  if (!tall) return
  const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? 844)
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(h + 20, 844), 4000) })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  await page.setViewportSize(vp)
}

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

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

for (const scheme of ['light', 'dark'] as const) {
  for (const w of [390, 360] as const) {
    test.describe(`Today ${scheme} ${w}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: w, height: 844 })
        await page.clock.setFixedTime(FIXED_CLOCKS[1])
        await skipOnboarding(page)
        const now = new Date(FIXED_CLOCKS[1])
        await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now, temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
        await page.goto('/#today')
        await expect(page.getByTestId('myday')).toBeVisible()
        await setScheme(page, scheme)
        await expect(page.getByTestId('weather-hero').locator('.td-wxh-t')).toBeVisible()
      })

      test('shots and hero geometry', async ({ page }) => {
        const hero = page.getByTestId('weather-hero')
        const m = await page.evaluate(() => {
          const q = (s: string) => document.querySelector(s)!.getBoundingClientRect()
          const hr = q('[data-testid="weather-hero"]'); const t = q('.td-wxh-t'); const c = q('.td-wxh-c'); const slots = Array.from(document.querySelectorAll('.td-wxh-hrs li')).map((l) => l.getBoundingClientRect())
          const ts = getComputedStyle(document.querySelector('.td-wxh-t')!)
          return { hh: hr.height, tRight: t.right, tBottom: t.bottom, cLeft: c.left, cTop: c.top, cRight: c.right, heroRight: hr.right, fs: ts.fontSize, fw: ts.fontWeight, slotH: slots.map((s) => Math.round(s.height)) }
        })
        console.log('HERO', scheme, w, JSON.stringify(m))
        await shoot(page, `today-${scheme}-${w}`, w === 390)
        await assertNoSideways(page)
        await expect(hero).toBeVisible()
      })
    })
  }
}

// ---- the app banner: "Get the app" reads in both themes ----
for (const scheme of ['light', 'dark'] as const) {
  test(`banner ${scheme}: Get the app and Later are 4.5:1 or better, 44 px`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' })
      const mm = window.matchMedia.bind(window)
      window.matchMedia = (q: string) => (q.includes('display-mode: standalone') ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as unknown as MediaQueryList) : mm(q))
    })
    await page.route('**/latest.json', (r) => r.fulfill({ json: { versionCode: 99, versionName: '2.3.0', url: 'https://bantay.pages.dev/get/bantay.apk' } }))
    await skipOnboarding(page)
    await page.goto('/#today')
    await expect(page.locator('h1').first()).toBeVisible()
    await seed(page, 'bantay', 'kv', [{ key: 'alerts.inapp.ok', value: true }])
    await page.emulateMedia({ colorScheme: scheme })
    await page.reload()
    const banner = page.getByRole('region', { name: 'Bantay is now an app' })
    await expect(banner).toBeVisible()
    await setScheme(page, scheme)
    for (const sel of ['a:has-text("Get the app")', 'button:has-text("Later")']) {
      expect(await contrastOf(page, `[aria-label="Bantay is now an app"] ${sel}`), `${sel} ${scheme}`).toBeGreaterThanOrEqual(4.5)
      expect((await page.locator(`[aria-label="Bantay is now an app"] ${sel}`).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await banner.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/banner-${scheme}.png` })
  })
}

// ---- the Alerts inbox and its sheet ----
for (const scheme of ['light', 'dark'] as const) {
  test(`inbox ${scheme}: the sheet's title and close sit above the tab bar, rows wrap to two lines`, async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/#today')
    await expect(page.locator('h1').first()).toBeVisible()
    await seed(page, 'bantay-alerts', 'alerts', [
      alertRow('a1', 'dose_missed', 'dose_missed', 70, { ref: 'm1:2026-10-26:09:00' }),
      alertRow('a2', 'hazard', 'storm_warning', 130),
      alertRow('a3', 'mood_unwell', 'mood_unwell', 200),
      alertRow('a4', 'digest', 'digest', 24 * 60 + 30, { seenAt: ago(24 * 60) }),
      alertRow('a5', 'review_open', 'review_open', 26 * 60, { seenAt: ago(25 * 60) })
    ])
    await seed(page, 'bantay', 'kv', [{ key: 'alerts.inapp.ok', value: true }])
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#notif'); await page.reload()
    await setScheme(page, scheme)
    await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible()
    await shoot(page, `alerts-${scheme}`)
    // no row title is cut with an ellipsis: every row title shows in full or wraps to at most two lines
    const cut = await page.locator('[data-testid="inbox-row"] b').evaluateAll((els) => els.filter((e) => { const s = getComputedStyle(e); return e.scrollHeight > e.clientHeight + 1 || (s.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) }).map((e) => e.textContent))
    expect(cut, 'row titles cut').toEqual([])
    const lines = await page.locator('[data-testid="inbox-row"] b').evaluateAll((els) => els.map((e) => { const s = getComputedStyle(e); return e.getBoundingClientRect().height / (parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.25) }))
    for (const n of lines) expect(n).toBeLessThanOrEqual(2.2) // two lines at most
    await page.getByTestId('inbox-new').getByRole('button', { name: /A medicine was missed/ }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg).toBeVisible()
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity))
    await page.screenshot({ path: `${SHOTS}/alerts-sheet-${scheme}.png` })
    const g = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="tabbar"]')!.getBoundingClientRect()
      const d = document.querySelector('[role="dialog"]')!
      const h = (d.querySelector('h1, h2, h3') as HTMLElement).getBoundingClientRect()
      const x = (d.querySelector('button[aria-label="Close"]') as HTMLElement).getBoundingClientRect()
      const top = document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2)
      const topX = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2)
      return { barTop: bar.top, titleBottom: h.bottom, closeBottom: x.bottom, titleHit: !!top && d.contains(top), closeHit: !!topX && d.contains(topX) }
    })
    console.log('SHEET', scheme, JSON.stringify(g))
    expect(g.titleBottom, 'title above the tab bar').toBeLessThan(g.barTop)
    expect(g.closeBottom, 'close above the tab bar').toBeLessThan(g.barTop)
    expect(g.titleHit && g.closeHit, 'title and close are the top layer, not covered by the tab bar').toBe(true)
  })
}

// ---- the Jack sheet ----
for (const scheme of ['light', 'dark'] as const) {
  test(`Jack sheet ${scheme}: shot, parts above the tab bar`, async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/#today')
    await expect(page.locator('h1').first()).toBeVisible()
    await setScheme(page, scheme)
    await page.getByTestId('jack').click()
    const sheet = page.getByRole('dialog', { name: 'Jack' })
    await expect(sheet).toBeVisible()
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity))
    await page.screenshot({ path: `${SHOTS}/jack-sheet-${scheme}.png` })
    await page.setViewportSize({ width: 360, height: 800 })
    await page.screenshot({ path: `${SHOTS}/jack-sheet-${scheme}-360.png` })
  })
}

// ---- tab icons per the board ----
test('tab icons: Discover is a compass, Health a heart with a pulse, Safety a plain shield', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.getByTestId('tabbar')).toBeVisible()
  const icon = (id: string) => page.getByTestId(`tab-${id}`).locator('svg').first().evaluate((s) => Array.from(s.querySelectorAll('path,circle')).map((p) => p.getAttribute('d') ?? `c${p.getAttribute('r')}`).join('|'))
  expect(await icon('discover')).toContain('m15.5 8.5-2 5-5 2 2-5z') // the board's compass needle
  expect(await icon('health')).toContain('M7 12h3l1.5-2.5 2 4L15 12h2') // the board's heart pulse
  expect(await icon('safety')).not.toMatch(/m9 12|l2 2|l4-4/i) // no tick inside the shield
  expect(await icon('safety')).toContain('M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z')
  await page.screenshot({ path: `${SHOTS}/tabbar-light.png`, clip: { x: 0, y: 760, width: 390, height: 84 } })
})

test('Today at rest: no control under Jack', async ({ page }) => {
  await skipOnboarding(page)
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await page.goto('/#today')
  await expect(page.getByTestId('myday')).toBeVisible()
  await assertJackClear(page, { at: 'rest' })
})
