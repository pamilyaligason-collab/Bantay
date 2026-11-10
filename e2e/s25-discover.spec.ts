import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertJackHitRestAndEnd, DISCOVER_ALLOW, FIXED_CLOCKS, settled, type JackAllow } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S25 lane C fix round 1: Jack (the floating button) hit tests on the new Discover controls, by elementFromPoint (assertJackHit samples a 12 x 12 grid per control).
// The whole-card links (video grid card, news card, Health link card) may touch Jack with more than half still tappable (the Health link card is a new allowance, measured 92%: needs the D-128 ruling); section links, chips and Show more / Show less have none, so any touch fails.
// Shots (390 x 844) only when S25_SHOTS is set (ML-32): docs/session-25/shots/C. The news list is seeded into the app's own saved copy (the e2e build has no Supabase).
const ALLOW: JackAllow[] = [...DISCOVER_ALLOW, { name: 'Health link card', sel: 'a.dc-hlink' }] // S28: video and news cards are MediaCards (a.md / button.md), already in DISCOVER_ALLOW; the Play tiles, recipe links, Did you know card and guided poster have no allowance (they clear Jack by layout)
const TARGETS = 'a.md, button.md, .dc-hlink, button.more-grid-btn, section.sec > .sec-h a'
const SHOTS = 'docs/session-25/shots/C'
const NOW = Date.parse(FIXED_CLOCKS[1])
const GMA = 'UCqYw-CTd1dU2yGI71sEyqNw'
const ABS = 'UCE2606prvXQc_noEqKxVJXA'
const rows = Array.from({ length: 9 }, (_, i) => ({
  video_id: 'nvid' + String(i).padStart(7, '0'), channel_id: i % 2 ? ABS : GMA, channel: i % 2 ? 'ABS-CBN News' : 'GMA News', title: `Sample news story ${i + 1}`,
  published_at: new Date(NOW - (40 + i * 70) * 60_000).toISOString()
}))

test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

async function seed(page: Page) {
  await page.goto('/')
  await page.evaluate(([rs, now]) => new Promise<void>((res, rej) => {
    const o = indexedDB.open('bantay')
    o.onerror = () => rej(o.error)
    o.onsuccess = () => {
      const d = o.result
      const t = d.transaction('kv', 'readwrite')
      t.objectStore('kv').put({ key: 'discover.newsvideo.all', value: { savedAt: now, fetchedAt: now - 12 * 60_000, rows: rs } })
      t.oncomplete = () => { d.close(); res() }
      t.onerror = () => rej(t.error)
    }
  }), [rows, NOW] as const)
}

async function open(page: Page) {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 404 }))
  await seed(page)
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-regional')).toBeVisible()
  await expect(page.getByTestId('nv-lead')).toBeVisible()
  await settled(page)
}

/** Open every Show more so all cards are on the page, then hit-test each named control level with Jack, and the page at rest and at its end. */
async function sweep(page: Page, tag: string) {
  const more = page.locator('button.more-grid-btn', { hasText: /Show \d+ more/ })
  for (let i = 0; i < 20 && (await more.count()) > 0; i++) await more.first().click() // each click may reveal the next Show more, so the button is looked up again
  await expect(page.locator('button.more-grid-btn', { hasText: /Show \d+ more/ })).toHaveCount(0)
  // S29 (D-184): the gate is Jack at rest (top) and at the end. The old per-control pass scrolled every control level with Jack and measured it there; Jack now slides away while the page scrolls down, so a control passing under him mid-scroll is not a failure, and a flush-right section link level with him would fail by construction.
  const n = await page.locator(TARGETS).count()
  expect(n, 'controls to measure').toBeGreaterThan(20)
  await assertJackHitRestAndEnd(page, ALLOW, tag)
}

for (const [w, h] of [[360, 640], [390, 844], [412, 915]] as const) {
  test(`Jack hit test, ${w}x${h}: video cards, news cards, section links, Health link and Show more`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await open(page)
    // Every kind of control the brief names is on the page.
    await expect(page.locator('a.md').first()).toBeAttached()
    await expect(page.getByTestId('nv-card').first()).toBeAttached()
    await expect(page.locator('.dc-hlink').first()).toBeAttached()
    await expect(page.locator('button.more-grid-btn', { hasText: /Show \d+ more/ }).first()).toBeAttached()
    await sweep(page, `s25 ${w}x${h} all`)
  })
}

test('shots: Discover top to bottom, then Watch', async ({ page }) => {
  test.skip(!process.env.S25_SHOTS, 'shots only when S25_SHOTS is set')
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  mkdirSync(SHOTS, { recursive: true })
  const take = async (name: string) => {
    await page.mouse.move(0, 0)
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
    writeFileSync(`${SHOTS}/${name}.png`, await page.screenshot({ animations: 'disabled', caret: 'hide' }))
  }
  const step = 700
  const total = await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement; return s.scrollHeight - s.clientHeight })
  let n = 1
  for (let y = 0; y <= total + step; y += step, n++) {
    await page.evaluate((top) => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = top }, y)
    await take('discover-' + String(n).padStart(2, '0'))
    if (y >= total) break
  }
  await page.goto('/#discover/watch')
  await expect(page.getByRole('heading', { name: 'Watch · All videos' })).toBeVisible()
  await take('watch')
  await page.getByRole('button', { name: /^Video, / }).first().click()
  await take('watch-picked')
})
