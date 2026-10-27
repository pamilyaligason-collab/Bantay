import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Session 12 lane F3: Discover > Play (memory match, word search, Alam mo ba?, fun facts) and Discover > News.
test.use({ viewport: { width: 390, height: 844 } })
test.beforeEach(async ({ page }) => { await skipOnboarding(page) })

const noSideScroll = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)

/** Put rows in the app's own kv store (wait until Dexie has made it; a bare indexedDB.open would create an empty database). */
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

test('Play hub: the games, the legal line, and a played game shows in Played today', async ({ page }) => {
  await page.goto('/#discover/play')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Nothing played yet today')).toBeVisible()
  await expect(page.getByText(/No claim about memory or dementia/)).toBeVisible()
  expect(await noSideScroll(page)).toBe(true)
  await page.getByRole('button', { name: /Memory match/ }).click()
  await expect(page.getByTestId('memory')).toBeVisible()
  const cards = page.locator('.fp-card')
  await expect(cards).toHaveCount(12)
  // pass 1: turn cards over two at a time and remember each label as it shows
  const where = new Map<string, number[]>()
  for (let i = 0; i < 12; i++) {
    await cards.nth(i).click()
    const l = (await cards.nth(i).getAttribute('aria-label'))!
    where.set(l, [...(where.get(l) ?? []), i])
  }
  // pass 2: tap each pair that is not found yet
  for (const [, idx] of where) {
    if ((await cards.nth(idx[0]!).getAttribute('data-done')) === 'true') continue
    await cards.nth(idx[0]!).click(); await cards.nth(idx[1]!).click()
  }
  await expect(page.getByText('Pairs found: 6 of 6')).toBeVisible()
  await expect(page.getByText(/found them all|sharp eye|Every pair is found/)).toBeVisible()
  await page.getByRole('button', { name: 'Back to Play' }).click()
  await expect(page.getByText('Played today: 1 game')).toBeVisible()
})

test('Word search: tap first and last letter, switch language, new puzzle; fits at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/#discover/play')
  await page.getByRole('button', { name: /Word search/ }).click()
  await expect(page.getByTestId('wordsearch')).toBeVisible()
  await expect(page.locator('.fp-cell')).toHaveCount(64)
  expect(await noSideScroll(page)).toBe(true)
  const cell = page.locator('.fp-cell').first()
  expect((await cell.boundingBox())!.width).toBeGreaterThanOrEqual(30)
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByLabel('Words to find')).toContainText(/[A-Z]{3}/)
  const before = await page.locator('.fp-ws').innerText()
  await page.getByRole('button', { name: 'New puzzle' }).click()
  expect(await page.locator('.fp-ws').innerText()).not.toBe(before)
  await page.getByRole('button', { name: 'Hint' }).click()
  await expect(page.locator('.fp-cell.is-hint')).toHaveCount(1)
})

test('Alam mo ba?: any answer is kind, the right one is marked, and there is no "wrong"', async ({ page }) => {
  await page.goto('/#discover/play')
  await page.getByRole('button', { name: /Alam mo ba/ }).click()
  const answers = page.getByRole('group', { name: 'Answers' }).locator('button')
  await expect(answers).toHaveCount(4)
  await answers.first().click()
  await expect(page.locator('.fp-ans.is-right')).toHaveCount(1)
  await expect(page.locator('.fp-ex')).toContainText(/^(Yes!|Close!) It is /)
  expect(await page.locator('body').innerText()).not.toMatch(/wrong/i)
  await expect(answers.first()).toBeDisabled()
})

test('Fun facts: On this day card with the CC BY-SA credit and a Wikipedia link, and a Philippine fact', async ({ page }) => {
  await page.route('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ events: [{ year: 1881, text: 'The Gunfight at the O.K. Corral takes place.', pages: [{ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Gunfight_at_the_O.K._Corral' } } }] }] }) }))
  await page.goto('/#discover/play')
  await page.getByRole('button', { name: /Fun facts today/ }).click()
  await expect(page.getByText(/1881: The Gunfight/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open on Wikipedia' })).toHaveAttribute('href', /wikipedia\.org\/wiki\//)
  await expect(page.getByLabel('On this day').getByText(/CC BY-SA 4\.0/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Did you know? Philippines' })).toBeVisible()
})

test('News: official advisories are pinned first, headlines link out, saved headlines show offline', async ({ page }) => {
  await page.goto('/#discover/news')
  const items = [
    { id: '1', title: 'GenSan fish port reports steady tuna landings this week', url: 'https://news.example/a', source: 'PNA', kind: 'article', published_at: new Date(Date.now() - 3_600_000).toISOString(), zone: null },
    { id: '2', title: 'Rain advisory for Soccsksargen', url: 'https://www.pagasa.dost.gov.ph/a', source: 'PAGASA', kind: 'article', published_at: new Date(Date.now() - 7_200_000).toISOString(), zone: null }
  ]
  await seedKv(page, [{ key: 'discover.news', value: { savedAt: Date.now(), zone: null, items } }])
  await page.reload()
  const links = page.locator('[data-testid="news"] a')
  await expect(links.first()).toContainText('Rain advisory for Soccsksargen') // pinned before the newer headline
  await expect(links.nth(1)).toContainText('GenSan fish port')
  await expect(links.nth(1)).toHaveAttribute('target', '_blank')
  await expect(page.getByText(/Headlines saved .* New ones when there is signal\./)).toBeVisible()
  expect(await noSideScroll(page)).toBe(true)
})
