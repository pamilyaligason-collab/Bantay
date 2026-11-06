import { expect, test, type Locator, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// FX-DISC fix1 (D-142): long titles in the lead card, Top stories and Latest stay inside their rows, never run under the picture or the Read later button, never scroll sideways.
// The e2e build has no Supabase env, so the rows are the saved list the screen reads when it cannot fetch (same rendering path as a fetched list).
const LONG = 'Regional disaster office reports that water levels along the river basin have risen steadily overnight and families in low lying barangays are asked to prepare go bags and listen'.slice(0, 160)
const UNBROKEN = 'Supercalifragilisticexpialidocious'.repeat(4)
const now = Date.now()
const row = (i: number, title: string, topic: string | null, image: boolean) => ({ id: 'r' + i, title, url: 'https://news.example/' + i, source: 'Example Source', kind: 'article', published_at: new Date(now - i * 600_000).toISOString(), zone: null, topic, image_url: image ? 'https://img.example/p.svg' : null })
const rows = [
  row(1, LONG, 'prepping', false), row(2, LONG, 'health', true), row(3, UNBROKEN, 'national', true), row(4, LONG + ' ' + UNBROKEN, 'wellbeing', false),
  row(5, LONG, null, true), row(6, UNBROKEN, null, false), row(7, LONG, null, false)
]

async function seedKv(page: Page, list: { key: string; value: unknown }[]) {
  await expect.poll(() => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'bantay')) return false
    return new Promise<boolean>((res) => { const o = indexedDB.open('bantay'); o.onerror = () => res(false); o.onsuccess = () => { const ok = o.result.objectStoreNames.contains('kv'); o.result.close(); res(ok) } })
  })).toBe(true)
  await page.evaluate(async (items) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open('bantay')
      open.onerror = () => rej(open.error)
      open.onsuccess = () => { const tx = open.result.transaction('kv', 'readwrite'); for (const r of items) tx.objectStore('kv').put(r); tx.oncomplete = () => { open.result.close(); res() }; tx.onerror = () => rej(tx.error) }
    })
  }, list)
}

type Box = { l: number; r: number; t: number; b: number }
const box = (loc: Locator): Promise<Box> => loc.evaluate((x) => { const r = x.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom } })
const inside = (c: Box, p: Box) => c.l >= p.l - 0.5 && c.r <= p.r + 0.5
const apart = (a: Box, b: Box) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5

async function open(page: Page, width: number) {
  await skipOnboarding(page)
  await page.setViewportSize({ width, height: 844 })
  await page.route('https://img.example/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#456"/></svg>' }))
  await page.goto('/#discover/news')
  await seedKv(page, [{ key: 'discover.news', value: { savedAt: now, zone: null, items: rows } }])
  await page.reload()
  return page.getByTestId('news')
}
const sideways = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth)

for (const width of [320, 360, 390]) {
  test(`news rows at ${width}: no sideways scroll, text inside its row, no overlap with the picture or Read later`, async ({ page }) => {
    const news = await open(page, width)
    await expect(news.getByTestId('nw-lead')).toBeVisible()
    await expect(news.getByTestId('nw-story').first()).toBeVisible()
    expect(await sideways(page)).toBeLessThanOrEqual(0)
    const vw = await page.evaluate(() => document.documentElement.clientWidth)
    // lead card: the title wraps (more than one 26 px line) inside the card
    const lead = await box(news.getByTestId('nw-lead')); const lt = await box(news.getByTestId('nw-lead').locator('.nw-title'))
    expect(inside(lt, lead)).toBe(true); expect(lead.r).toBeLessThanOrEqual(vw + 0.5)
    expect(lt.b - lt.t).toBeGreaterThan(30)
    // Top stories: text column and picture side by side
    const stories = news.getByTestId('nw-story')
    expect(await stories.count()).toBe(3)
    for (let i = 0; i < 3; i++) {
      const it = stories.nth(i)
      const row = await box(it), body = await box(it.locator('.nw-body')), title = await box(it.locator('.nw-title')), thumb = await box(it.locator('.nw-thumb'))
      expect(inside(body, row) && inside(title, row) && inside(thumb, row)).toBe(true)
      expect(apart(title, thumb)).toBe(true)
      expect(thumb.r - thumb.l).toBeGreaterThanOrEqual(64); expect(thumb.r - thumb.l).toBeLessThanOrEqual(72.5)
      expect(title.b - title.t).toBeLessThanOrEqual(3 * 23 + 1) // clamped to 3 lines
    }
    // Latest (Top chip shows what is left; the Latest chip shows all): Read later has its own 44 px column
    for (const chip of ['Top', 'Latest']) {
      await news.getByRole('button', { name: chip, exact: true }).click()
      const lat = news.getByTestId('nw-latest')
      await expect(lat.first()).toBeVisible()
      for (let i = 0; i < await lat.count(); i++) {
        const it = lat.nth(i)
        const row = await box(it), body = await box(it.locator('.nw-body')), title = await box(it.locator('.nw-title')), save = await box(it.locator('.nw-save'))
        expect(inside(body, row) && inside(title, body) && inside(save, row)).toBe(true)
        expect(save.r).toBeLessThanOrEqual(vw + 0.5)
        expect(apart(title, save) && apart(body, save)).toBe(true)
        expect(save.r - save.l).toBeGreaterThanOrEqual(44); expect(save.b - save.t).toBeGreaterThanOrEqual(44)
        expect(title.b - title.t).toBeLessThanOrEqual(3 * 23 + 1)
      }
    }
    expect(await sideways(page)).toBeLessThanOrEqual(0)
  })
}

test('a story shows once on the Top screen: lead, Top stories and Latest never repeat a headline', async ({ page }) => {
  const news = await open(page, 390)
  await expect(news.getByTestId('nw-lead')).toBeVisible()
  const urls = await news.locator('a[href^="https://news.example/"]').evaluateAll((a) => a.map((x) => (x as HTMLAnchorElement).href))
  expect(urls.length).toBe(rows.length)
  expect(new Set(urls).size).toBe(urls.length)
})
