import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { assertJackClear, assertJackHitRestAndEnd, assertNoSideways, FIXED_CLOCKS, setScheme } from './v13'

// S22 B-TODAY fix1: the Today News section rendered in a real browser from invented rows (the e2e build has no Supabase env, so loadFeed reads its 7-day saved list in IndexedDB; a bantay:refresh pull makes Today reload it).
test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const NOW = new Date(FIXED_CLOCKS[1]).getTime()
const long = 'Invented harbour council posts a very long headline about the new ferry timetable, the pier repairs and the market hours for the coming week of rain'.slice(0, 140)
const rows = [
  { id: 'n1', title: long, url: 'https://news.example/n1', source: 'Example Daily', kind: 'article', published_at: new Date(NOW - 3_600_000).toISOString(), zone: null, image_url: 'https://img.example/n1.svg' },
  { id: 'n2', title: 'Invented market opens early on Saturday', url: 'https://news.example/n2', source: 'Example Daily', kind: 'article', published_at: new Date(NOW - 2 * 3_600_000).toISOString(), zone: null },
  { id: 'n3', title: 'Invented school schedule update', url: 'https://news.example/n3', source: 'Example Wire', kind: 'article', published_at: new Date(NOW - 3 * 3_600_000).toISOString(), zone: null }
]
const THUMB = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#7a9"/></svg>'

async function seedKv(page: Page, list: { key: string; value: unknown }[]) {
  await expect.poll(() => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'bantay')) return false
    return new Promise<boolean>((res) => { const o = indexedDB.open('bantay'); o.onerror = () => res(false); o.onsuccess = () => { const ok = o.result.objectStoreNames.contains('kv'); o.result.close(); res(ok) } })
  })).toBe(true)
  await page.evaluate(async (l) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open('bantay')
      open.onerror = () => rej(open.error)
      open.onsuccess = () => { const tx = open.result.transaction('kv', 'readwrite'); for (const r of l) tx.objectStore('kv').put(r); tx.oncomplete = () => { open.result.close(); res() }; tx.onerror = () => rej(tx.error) }
    })
  }, list)
}

for (const width of [320, 360, 390]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`Today News at ${width} wide, ${scheme}: no sideways scroll, titles inside rows and clamped to 2 lines, thumbnail clear of text, Jack clear`, async ({ page }) => {
      expect(long).toHaveLength(140)
      await page.setViewportSize({ width, height: 844 })
      await page.clock.setFixedTime(FIXED_CLOCKS[1])
      await skipOnboarding(page)
      await stubWindy(page)
      await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(NOW), temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
      await page.route('https://img.example/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: THUMB }))
      await page.goto('/#today')
      await expect(page.getByTestId('myday')).toBeVisible()
      await setScheme(page, scheme)
      await seedKv(page, [{ key: 'discover.news', value: { savedAt: NOW, zone: null, items: rows } }])
      // the pull-to-refresh contract (look/refresh.ts): collect the promises, then wait for them
      const news = page.getByTestId('today-news')
      await expect.poll(async () => { // repeat until Today's listener is registered (the place settles first)
        await page.evaluate(async () => { const pending: Promise<unknown>[] = []; window.dispatchEvent(new CustomEvent('bantay:refresh', { detail: { waitUntil: (p: Promise<unknown>) => void pending.push(p) } })); await Promise.allSettled(pending) })
        return news.locator('.tn-row').count()
      }).toBe(3)
      // Jack at rest (scroll 0, not yet peeked) with News in the page; no new allowance
      // News gets no allowance. At 320 My day's own Log button (MyDay.tsx, lane B) is 71% tappable next to Jack with or without News; it is named here, not hidden.
      await assertJackHitRestAndEnd(page, width === 320 ? [{ name: 'My day Log (pre-existing, lane B)', sel: '[data-testid="myday"] a.td-todo-go' }] : [], `today-news ${width} ${scheme} rest`)
      await assertJackClear(page, { at: 'rest', allow: width === 320 ? '[data-testid="myday"] a.td-todo-go' : undefined })
      await news.scrollIntoViewIfNeeded()
      await expect(news.locator('.tn-img img')).toHaveCount(1)
      await expect.poll(() => news.locator('.tn-img img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)

      const m = await news.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>('.tn-row')).map((row) => {
        const rr = row.getBoundingClientRect(); const t = row.querySelector<HTMLElement>('.tn-title')!; const tr = t.getBoundingClientRect()
        const pic = row.querySelector<HTMLElement>('.tn-img img'); const pr = pic?.getBoundingClientRect()
        const body = row.querySelector<HTMLElement>('.tn-body')!.getBoundingClientRect()
        const lh = parseFloat(getComputedStyle(t).lineHeight)
        return { rowRight: rr.right, titleRight: tr.right, lines: Math.round(tr.height / lh), scrollH: t.scrollHeight, clientH: t.clientHeight, picLeft: pr?.left ?? null, picW: pr?.width ?? null, picH: pr?.height ?? null, bodyRight: body.right }
      }))
      expect(m).toHaveLength(3)
      for (const r of m) {
        expect(r.titleRight, 'title inside its row').toBeLessThanOrEqual(r.rowRight + 0.5)
        expect(r.lines).toBeLessThanOrEqual(2)
      }
      expect(m[0]!.lines).toBe(2)
      expect(m[0]!.scrollH, 'the 140-character title is clamped (cut off)').toBeGreaterThan(m[0]!.clientH)
      expect(m[0]!.picW).toBe(64)
      expect(m[0]!.picH).toBe(64)
      expect(m[0]!.picLeft!, 'thumbnail does not overlap the text').toBeGreaterThanOrEqual(m[0]!.bodyRight)
      expect(m[1]!.picLeft).toBeNull()

      // News itself never reaches past the phone's right edge, at any width
      expect(await news.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>('*')).filter((n) => n.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map((n) => String(n.className))), 'News content past the right edge').toEqual([])
      // Whole page: at 320 My day's own rows (td-todo, lane B, MyDay.tsx) already reach 339 px with or without News, so the page-wide check starts at 360.
      if (width >= 360) await assertNoSideways(page)
    })
  }
}
