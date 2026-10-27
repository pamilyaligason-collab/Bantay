import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Session 12 lane F3 shots: fun-play, fun-memory, fun-wordsearch, fun-trivia, fun-facts, fun-news at 390x844, light and dark.
// The clock is frozen at the mockup's own time (26 October, 10:20) so a rerun writes the same pixels.
const SHOTS = 'docs/session-12/shots/F3'
test.use({ viewport: { width: 390, height: 844 } })

async function seedKv(page: Page, rows: { key: string; value: unknown }[]) {
  await expect.poll(() => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === 'bantay')) return false
    return new Promise<boolean>((res) => { const o = indexedDB.open('bantay'); o.onerror = () => res(false); o.onsuccess = () => { const ok = o.result.objectStoreNames.contains('kv'); o.result.close(); res(ok) } })
  })).toBe(true)
  await page.evaluate(async (list) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open('bantay')
      open.onerror = () => rej(open.error)
      open.onsuccess = () => { const tx = open.result.transaction('kv', 'readwrite'); for (const r of list) tx.objectStore('kv').put(r); tx.oncomplete = () => { open.result.close(); res() }; tx.onerror = () => rej(tx.error) }
    })
  }, rows)
}

const NOW = new Date(2026, 9, 26, 10, 20, 0)
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()
/** Scroll the feature to the top of the 390x844 window, let every transition finish, then shoot the window (not the page): the app scrolls inside its own container. */
async function shot(page: Page, name: string, scheme: string, anchor?: string) {
  if (anchor) await page.locator(anchor).evaluate((el) => { (el as HTMLElement).style.scrollMarginTop = '84px'; el.scrollIntoView({ block: 'start' }) })
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png`, animations: 'disabled' })
}
const settled = (page: Page) => expect(page.locator('.fp-card[data-up="true"]:not([data-done="true"])')).toHaveCount(0)

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' })
      await page.clock.setFixedTime(NOW)
      await page.route('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/**', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ events: [
          { year: 1881, text: 'The Gunfight at the O.K. Corral takes place in Tombstone, Arizona.', pages: [{ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Gunfight_at_the_O.K._Corral' } } }] },
          { year: 1858, text: 'Theodore Roosevelt is born in New York City.', pages: [{ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Theodore_Roosevelt' } } }] },
          { year: 1994, text: 'Israel and Jordan sign a peace treaty.', pages: [{ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Israel-Jordan_peace_treaty' } } }] }] }) }))
    })

    test('fun-play hub', async ({ page }) => {
      await page.goto('/#discover/play')
      await expect(page.getByText('Nothing played yet today')).toBeVisible()
      await seedKv(page, [{ key: 'play.day', value: { day: '2026-10-26', n: 2, games: ['Memory match', 'Alam mo ba?'], days: { '2026-10-26': 2 } } }])
      await page.reload()
      await expect(page.getByText('Played today: 2 games')).toBeVisible()
      await shot(page, 'fun-play', scheme)
    })

    test('fun-memory in progress', async ({ page }) => {
      await page.goto('/#discover/play')
      await page.getByRole('button', { name: /Memory match/ }).click()
      const cards = page.locator('.fp-card')
      await expect(cards).toHaveCount(12)
      const where = new Map<string, number[]>()
      for (let k = 0; k < 6; k++) { // pass 1: turn cards over two at a time and note each label
        for (const i of [2 * k, 2 * k + 1]) {
          if ((await cards.nth(i).getAttribute('data-done')) === 'true') continue
          await cards.nth(i).click()
          const l = (await cards.nth(i).getAttribute('aria-label'))!
          where.set(l, [...new Set([...(where.get(l) ?? []), i])])
        }
        await settled(page)
      }
      let found = 0
      for (const [, idx] of where) { // pass 2: finish two pairs, then turn one card of a third pair
        if (found === 2) { await cards.nth(idx[0]!).click(); break }
        if ((await cards.nth(idx[0]!).getAttribute('data-done')) !== 'true') { await cards.nth(idx[0]!).click(); await cards.nth(idx[1]!).click() }
        found++
      }
      await expect(page.getByText(/Pairs found: [23] of 6/)).toBeVisible()
      await shot(page, 'fun-memory', scheme, '.fp-head')
    })

    test('fun-wordsearch with words found', async ({ page }) => {
      await page.goto('/#discover/play')
      await page.getByRole('button', { name: /Word search/ }).click()
      const cells = page.locator('.fp-cell')
      await expect(cells).toHaveCount(64)
      const done = page.locator('.fp-chip.is-done')
      for (let n = 1; n <= 2; n++) { // the hint marks a first letter; try every cell across and down from it
        await page.getByRole('button', { name: 'Hint' }).click()
        const at = await page.evaluate(() => [...document.querySelectorAll('.fp-cell')].findIndex((c) => c.classList.contains('is-hint')))
        const r = Math.floor(at / 8), c = at % 8
        const ends = [...Array(8).keys()].flatMap((k) => [r * 8 + k, k * 8 + c]).filter((e) => e !== at)
        for (const e of ends) {
          await cells.nth(at).click(); await cells.nth(e).click()
          if ((await done.count()) >= n) break
        }
        await expect(done).toHaveCount(n)
      }
      await cells.nth(63).click() // a first letter picked, as in the mockup
      await expect(page.locator('.fp-cell.is-start')).toHaveCount(1)
      await shot(page, 'fun-wordsearch', scheme, '.fp-head')
    })

    test('fun-trivia answered', async ({ page }) => {
      await page.goto('/#discover/play')
      await page.getByRole('button', { name: /Alam mo ba/ }).click()
      await page.getByRole('group', { name: 'Answers' }).locator('button').nth(1).click()
      await expect(page.locator('.fp-ex')).toBeVisible()
      await shot(page, 'fun-trivia', scheme, '.fp-head')
    })

    test('fun-facts', async ({ page }) => {
      await page.goto('/#discover/play')
      await page.getByRole('button', { name: /Fun facts today/ }).click()
      await expect(page.getByText(/1 of 3 events/)).toBeVisible()
      await shot(page, 'fun-facts', scheme, '.fp-head')
    })

    test('fun-news', async ({ page }) => {
      await page.goto('/#discover/news')
      const row = (id: string, title: string, source: string, min: number) => ({ id, title, url: `https://news.example/${id}`, source, kind: 'article', published_at: ago(min), zone: null })
      await seedKv(page, [{ key: 'discover.news', value: { savedAt: new Date(2026, 9, 26, 7, 0).getTime(), zone: null, items: [
        row('1', 'PAGASA: rain advisory, Soccsksargen', 'PAGASA', 80),
        row('2', 'GenSan fish port reports steady tuna landings this week', 'PNA', 60),
        row('3', 'DOH reminds public to keep medicines dry during rainy days', 'GMA News', 180),
        row('4', 'New bus route links General Santos and Koronadal', 'Inquirer', 300)] } }])
      await page.reload()
      await expect(page.getByText(/Headlines saved 7:00 AM/)).toBeVisible()
      await shot(page, 'fun-news', scheme)
    })
  })
}
