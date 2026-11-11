import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { API, mock } from './health-auth-mock'

// S34 L1: the Watch shelves also show the older videos of the same channels (watch_videos.evergreen, migration 0068) after the New ones, without a tag, before the checked list.
// watch_videos is mocked here (invented rows, thumbnails stubbed with a flat picture, nothing leaves the PC). The recent read and the evergreen read (evergreen=eq.true in the URL) are answered separately.
const CLOCK = '2026-11-11T09:00:00+08:00'
const NOW = Date.parse(CLOCK)
const DAY = 86_400_000
const at = (days: number) => new Date(NOW - days * DAY).toISOString()
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const json = { ...cors, 'content-type': 'application/json' }

const row = (id: string, shelf: string, channel_id: string, channel: string, title: string, days: number) => ({ video_id: id, shelf, channel_id, channel, title, published_at: at(days), fetched_at: at(1) })
const FRESH = [
  row('frshPrep001', 'prepping', 'UCGHvTM8z9r8zd49VyKbD-dA', 'Philippine Red Cross', 'Typhoon safety: what to pack in your go bag', 2),
  row('frshRcp0001', 'recipes', 'UCqwRZhIEyiQ3cMCLQ9hI88Q', 'Kawaling Pinoy', 'Authentic Pinakbet in one pan', 1)
]
const OLD = [
  row('evrgRcp0002', 'recipes', 'UCIjw46txjW6oD4NU6FHaj_w', 'Panlasang Pinoy', 'Chicken Afritada recipe', 400),
  row('evrgRcp0001', 'recipes', 'UCqwRZhIEyiQ3cMCLQ9hI88Q', 'Kawaling Pinoy', 'Beef Caldereta recipe', 90),
  row('evrgFarm001', 'farm-diy', 'UCrtbYU40QsuSTYFIaEM_Cyw', 'ATI Central Office', 'Backyard gulayan guide', 300),
  row('evrgPrep001', 'prepping', 'UCpyLikj1x70S8UPxVqsPr6g', 'DOST-PAGASA', 'Earthquake safety basics', 700),
  row('oTyYzHntBxQ', 'prepping', 'UCGHvTM8z9r8zd49VyKbD-dA', 'Philippine Red Cross', 'Disaster Wais: the go bag', 200) // also in the checked list: must show once
]
const FLAT = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#8aa08a"/></svg>'

type Mode = 'both' | 'no-column' | 'missing'
async function open(page: Page, mode: Mode) {
  await page.clock.setFixedTime(CLOCK)
  await skipOnboarding(page)
  await mock(page, CLOCK)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: FLAT }))
  await page.route(`${API}/rest/v1/watch_videos*`, (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
    if (mode === 'missing') return r.fulfill({ status: 404, headers: json, body: JSON.stringify({ code: '42P01', message: 'relation "public.watch_videos" does not exist' }) })
    if (r.request().url().includes('evergreen=eq.true')) {
      if (mode === 'no-column') return r.fulfill({ status: 400, headers: json, body: JSON.stringify({ code: '42703', message: 'column watch_videos.evergreen does not exist' }) })
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify(OLD) })
    }
    return r.fulfill({ status: 200, headers: json, body: JSON.stringify(FRESH) })
  })
  await page.goto('/#discover/watch')
  await expect(page.getByTestId('watch')).toBeVisible()
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
}

const count = (page: Page) => page.getByRole('heading', { name: 'Watch · All videos' }).locator('xpath=following-sibling::span[1]')
const cards = (page: Page) => page.getByRole('button', { name: /^Video, / })
const labels = (page: Page) => cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

test.describe('Watch shelves with the back catalogue (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' }) })

  test('New first, then the older videos of the same channels with no tag, then the checked list; a video in two lists shows once', async ({ page }) => {
    await open(page, 'both')
    await expect(count(page)).toHaveText('61') // 55 checked + 2 New + 5 older - 1 in both
    await expect(page.locator('.md-flag')).toHaveCount(2)
    expect(await labels(page)).toEqual([
      'Video, Authentic Pinakbet in one pan, Kawaling Pinoy, New', 'Video, Typhoon safety: what to pack in your go bag, Philippine Red Cross, New',
      'Video, Beef Caldereta recipe, Kawaling Pinoy', 'Video, Disaster Wais: the go bag, Philippine Red Cross' // the 4 shown; the rest are behind Show more
    ])
    const more = page.locator('button.more-grid-btn', { hasText: /Show \d+ more/ })
    for (let i = 0; i < 30 && (await more.count()) > 0; i++) await more.first().click()
    await expect(cards(page)).toHaveCount(61)
    const all = await labels(page)
    expect(all.slice(0, 7)).toEqual([
      'Video, Authentic Pinakbet in one pan, Kawaling Pinoy, New', 'Video, Typhoon safety: what to pack in your go bag, Philippine Red Cross, New',
      'Video, Beef Caldereta recipe, Kawaling Pinoy', 'Video, Disaster Wais: the go bag, Philippine Red Cross', 'Video, Backyard gulayan guide, ATI Central Office',
      'Video, Chicken Afritada recipe, Panlasang Pinoy', 'Video, Earthquake safety basics, DOST-PAGASA'
    ])
    expect(all.filter((l) => l!.includes('Disaster Wais: the go bag'))).toHaveLength(1)
    expect(await page.getByRole('tab').allTextContents()).toEqual(['All', 'Be prepared', 'Farming and DIY', 'Listen', 'Recipe videos']) // the chips do not move
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('a topic chip keeps New, then the older ones; an older card opens its player', async ({ page }) => {
    await open(page, 'both')
    await page.getByTestId('playlist-Recipe videos').click()
    expect((await labels(page)).slice(0, 3)).toEqual(['Video, Authentic Pinakbet in one pan, Kawaling Pinoy, New', 'Video, Beef Caldereta recipe, Kawaling Pinoy', 'Video, Chicken Afritada recipe, Panlasang Pinoy'])
    await cards(page).nth(1).click()
    await expect(page.getByTestId('watch-player').getByRole('link', { name: /Open in YouTube/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=evrgRcp0001')
    await expect(page.locator('iframe')).toHaveCount(0) // loads nothing until its own tap
  })

  test('migration 0068 not applied (the evergreen read fails): the New videos still show and no error is shown', async ({ page }) => {
    await open(page, 'no-column')
    await expect(count(page)).toHaveText('57') // 55 checked + 2 New
    await expect(page.locator('.md-flag')).toHaveCount(2)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect((await page.getByTestId('watch').innerText()).toLowerCase()).not.toMatch(/error|failed|could not|offline|table|column/)
  })

  test('table missing: the checked list only, no tag and no error shown', async ({ page }) => {
    await open(page, 'missing')
    await expect(count(page)).toHaveText('55')
    await expect(page.locator('.md-flag')).toHaveCount(0)
    expect((await labels(page))[0]).toBe('Video, Disaster Wais: the go bag, Philippine Red Cross')
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect((await page.getByTestId('watch').innerText()).toLowerCase()).not.toMatch(/error|failed|could not|offline|table|column/)
  })
})
