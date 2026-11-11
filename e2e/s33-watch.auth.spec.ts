import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { API, mock } from './health-auth-mock'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// S33 L1: the Watch shelves read watch_videos (migration 0067) through the signed-in client; the table is mocked here (invented rows, thumbnails stubbed with a flat picture, nothing leaves the PC).
// Shots only when S33_SHOTS_DIR is set (ML-32); S33_SHOTS_PHASE names them before/after.
const SHOTS = process.env.S33_SHOTS_DIR
const PHASE = process.env.S33_SHOTS_PHASE ?? 'after'
const CLOCK = '2026-11-11T09:00:00+08:00'
const NOW = Date.parse(CLOCK)
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

const row = (id: string, shelf: string, channel_id: string, channel: string, title: string, h: number) => ({ video_id: id, shelf, channel_id, channel, title, published_at: hoursAgo(h), fetched_at: hoursAgo(1) })
const ROWS = [
  row('frshPrep001', 'prepping', 'UCGHvTM8z9r8zd49VyKbD-dA', 'Philippine Red Cross', 'Typhoon safety: what to pack in your go bag', 30),
  row('frshPrep002', 'prepping', 'UCil7YQ9Hwc2mTTQcaRw1InA', 'Civil Defense PH', 'Earthquake drill: drop, cover and hold', 80),
  row('frshFarm001', 'farm-diy', 'UCrtbYU40QsuSTYFIaEM_Cyw', 'ATI Central Office', 'Gulayan sa Pamayanan: starting a backyard garden', 120),
  row('frshRcp0001', 'recipes', 'UCqwRZhIEyiQ3cMCLQ9hI88Q', 'Kawaling Pinoy', 'Authentic Pinakbet in one pan', 20),
  row('frshRcp0002', 'recipes', 'UCIjw46txjW6oD4NU6FHaj_w', 'Panlasang Pinoy', 'Tiktok Lomi, Batangas style', 60),
  row('oTyYzHntBxQ', 'prepping', 'UCGHvTM8z9r8zd49VyKbD-dA', 'Philippine Red Cross', 'Disaster Wais: the go bag', 200) // also in the curated list: must show once
]
const FLAT = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#8aa08a"/></svg>'

async function open(page: Page, table: 'rows' | 'missing' | 'error') {
  await page.clock.setFixedTime(CLOCK)
  await skipOnboarding(page)
  await mock(page, CLOCK)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: FLAT }))
  await page.route(`${API}/rest/v1/watch_videos*`, (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    if (table === 'rows') return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(ROWS) })
    if (table === 'missing') return r.fulfill({ status: 404, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ code: '42P01', message: 'relation "public.watch_videos" does not exist' }) })
    return r.abort('failed')
  })
  await page.goto('/#discover/watch')
  await expect(page.getByTestId('watch')).toBeVisible()
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
  await page.evaluate(() => document.fonts.ready)
}

const count = (page: Page) => page.getByRole('heading', { name: 'Watch · All videos' }).locator('xpath=following-sibling::span[1]')
const cards = (page: Page) => page.getByRole('button', { name: /^Video, / })
/** Open every Show more so all cards are on the page. */
async function expandAll(page: Page) {
  const more = page.locator('button.more-grid-btn', { hasText: /Show \d+ more/ })
  for (let i = 0; i < 30 && (await more.count()) > 0; i++) await more.first().click() // each click may reveal the next Show more, so the button is looked up again
  await expect(more).toHaveCount(0)
}

test.describe('Watch shelves with fresh rows (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' }) })

  test('fresh rows come first with a New tag, then the checked videos; a video in both lists shows once; the chips do not move', async ({ page }) => {
    await open(page, 'rows')
    await expect(count(page)).toHaveText('60') // 55 checked + 6 fresh - 1 that is in both
    await expect(cards(page)).toHaveCount(4)
    expect(await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([
      'Video, Authentic Pinakbet in one pan, Kawaling Pinoy, New', 'Video, Typhoon safety: what to pack in your go bag, Philippine Red Cross, New',
      'Video, Tiktok Lomi, Batangas style, Panlasang Pinoy, New', 'Video, Earthquake drill: drop, cover and hold, Civil Defense PH, New'
    ])
    expect(await page.getByRole('tab').allTextContents()).toEqual(['All', 'Be prepared', 'Farming and DIY', 'Listen', 'Recipe videos'])
    await expandAll(page)
    await expect(cards(page)).toHaveCount(60)
    const ids = await page.locator('button.md img').evaluateAll((els) => els.map((e) => /\/vi\/([^/]+)\//.exec(e.getAttribute('src') ?? '')?.[1]))
    expect(new Set(ids).size).toBe(60) // no video twice
    expect(await page.locator('.md-flag').allTextContents()).toEqual(Array(6).fill('New'))
    // the six New cards are the first six, the 7th card is the first checked video
    expect(await cards(page).nth(5).getAttribute('aria-label')).toBe('Video, Disaster Wais: the go bag, Philippine Red Cross, New')
    expect(await cards(page).nth(6).getAttribute('aria-label')).toBe('Video, Disaster Wais: acting early before a storm, Philippine Red Cross')
  })

  test('a topic chip keeps its fresh videos first; Listen has none', async ({ page }) => {
    await open(page, 'rows')
    await page.getByTestId('playlist-Recipe videos').click()
    expect(await cards(page).first().getAttribute('aria-label')).toBe('Video, Authentic Pinakbet in one pan, Kawaling Pinoy, New')
    await expect(page.locator('.md-flag')).toHaveCount(2)
    await page.getByTestId('playlist-Listen').click()
    await expect(page.locator('.md-flag')).toHaveCount(0)
  })

  test('the New tag keeps the type floor and stays inside its still; the page does not scroll sideways', async ({ page }) => {
    await open(page, 'rows')
    const flag = page.locator('.md-flag').first()
    const box = await flag.evaluate((e) => { const r = e.getBoundingClientRect(); const p = e.closest('.md-pic')!.getBoundingClientRect(); return { inside: r.left >= p.left && r.right <= p.right && r.top >= p.top && r.bottom <= p.bottom, fs: parseFloat(getComputedStyle(e).fontSize) } })
    expect(box.inside).toBe(true)
    expect(box.fs).toBeGreaterThanOrEqual(15) // meta floor (ML-54)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('a fresh card opens its player, which loads nothing until its own tap and offers Open in YouTube', async ({ page }) => {
    await open(page, 'rows')
    await cards(page).first().click()
    const player = page.getByTestId('watch-player')
    await expect(player).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(player.getByRole('link', { name: /Open in YouTube/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=frshRcp0001')
  })

  for (const table of ['missing', 'error'] as const) {
    test(`table ${table}: the checked list only, no New tag and no error shown`, async ({ page }) => {
      await open(page, table)
      await expect(count(page)).toHaveText('55')
      await expect(page.locator('.md-flag')).toHaveCount(0)
      expect(await cards(page).first().getAttribute('aria-label')).toBe('Video, Disaster Wais: the go bag, Philippine Red Cross')
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect((await page.getByTestId('watch').innerText()).toLowerCase()).not.toMatch(/error|failed|could not|offline|table/)
    })
  }
})

for (const [w, h] of [[390, 844], [360, 740]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`shots ${w}x${h} ${scheme}`, async ({ page }) => {
      test.skip(!SHOTS, 'S33_SHOTS_DIR not set')
      await page.setViewportSize({ width: w, height: h })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await open(page, 'rows')
      await page.screenshot({ path: `${SHOTS}/${PHASE}-${w}x${h}-${scheme}.png` })
    })
  }
}
