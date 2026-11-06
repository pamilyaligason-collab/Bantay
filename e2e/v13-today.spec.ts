import { expect, test } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { assertNoSideways, assertOrder, assertTargets, assertTextContrast, FIXED_CLOCKS, setScheme } from './v13'

// v13 lane T: the Today tab root per board Main. Hero, order, header, honest empty states; geometry helpers come from e2e/v13.ts.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  await stubWindy(page)
  const now = new Date(FIXED_CLOCKS[1])
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now, temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
  await page.goto('/#today')
  await expect(page.getByTestId('myday')).toBeVisible()
})

test('header: the greeting is the h1, the date is the kicker, bell and avatar are 44 px links', async ({ page }) => {
  const head = page.getByTestId('today-head')
  await expect(head.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)/)
  await expect(head.locator('.lt-kicker')).not.toBeEmpty()
  for (const name of [/^Notifications/, 'You and settings']) {
    const box = (await head.getByRole('link', { name }).boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await expect(page.locator('.sh-top')).toHaveCount(0) // the shell top bar is off on the Today root
})

test('order: hero, My day, Calm, Your numbers; no SOS pill, no family feed', async ({ page }) => {
  await assertOrder(page, ['weather-hero', 'myday', 'calm', 'numbers'])
  await expect(page.locator('.td-sos, [data-testid="family-feed"]')).toHaveCount(0)
})

test('the hero is one link to Weather', async ({ page }) => {
  await expect(page.getByTestId('weather-hero').getByRole('link').first()).toHaveAttribute('href', /#weather/)
})

test('My day: ring, the three rows and the breath row', async ({ page }) => {
  const day = page.getByTestId('myday')
  await expect(day.getByRole('img', { name: /of \d+ done/ })).toBeVisible()
  await expect(day.getByRole('button', { name: "I'm OK" })).toBeVisible()
  await expect(day.getByRole('link', { name: 'Log' })).toBeVisible()
  await expect(day.getByRole('button', { name: 'Add a glass of water' })).toBeVisible()
  await expect(day.getByTestId('selfcare')).toBeVisible()
})

test('Your numbers: empty tiles are honest, and the radio row opens Calm', async ({ page }) => {
  const nums = page.getByTestId('numbers')
  await expect(nums.getByText('--/--')).toBeVisible()
  await expect(nums.getByText('Log now').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Relaxing radio/ })).toHaveAttribute('href', '#calm/listen')
  await expect(page.getByRole('link', { name: 'Open Calm' })).toHaveAttribute('href', '#calm') // the only way into the Calm page
})

test('Calm card opens the breath sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'Breathe for 1 minute' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: targets and no sideways scroll at 360 px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await setScheme(page, scheme)
    await assertTargets(page)
    await assertNoSideways(page)
  })
}

// ---- Gaps batch 2, lane T (T4 T5 T7 T9 T10 T11 T14) ----
type Box = { x: number; y: number; width: number; height: number }
const box = async (l: import('@playwright/test').Locator): Promise<Box> => (await l.boundingBox())!
const FULL_SHOTS = process.env.V13_SHOTS

test('T4: the hero is 260 to 330 px, the temperature 76 px at weight 200, the condition and range to its right', async ({ page }) => {
  const hero = page.getByTestId('weather-hero')
  await expect(hero.locator('.td-wxh-t')).toBeVisible() // the forecast has landed, not the empty slot
  const h = await box(hero)
  expect(h.height).toBeGreaterThanOrEqual(260)
  expect(h.height).toBeLessThanOrEqual(330) // D-139: the hourly strip and the one-line rain estimate sit inside the hero (measured 317 here, was 300 max)
  const t = hero.locator('.td-wxh-t')
  expect(await t.evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight] })).toEqual(['76px', '200']) // D-115 A2: the weight-200 digit face is loaded (numfont.css), so 200 really renders
  const [tb, cb, hb] = [await box(t), await box(hero.locator('.td-wxh-c')), await box(hero.locator('.td-wxh-hl'))]
  expect(cb.x, 'the condition sits to the right of the temperature').toBeGreaterThanOrEqual(tb.x + tb.width - 1)
  expect(cb.x + cb.width, 'and ends at the hero right edge (right-aligned)').toBeGreaterThan(hb.x + hb.width - 2)
  expect(hb.y, 'High/Low is under the condition').toBeGreaterThanOrEqual(cb.y + cb.height - 1)
})

test('T6: no cloud crosses the words and every cloud sits in the top 40% of the hero (still sky)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  const hero = page.getByTestId('weather-hero')
  await expect(hero.locator('.td-wxh-t')).toBeVisible()
  const hb = await box(hero)
  const clouds = await Promise.all((await hero.locator('.wxs-cloud').all()).map(box))
  expect(clouds.length).toBeGreaterThan(0)
  const words = await Promise.all((await hero.locator('.sc-kicker, .td-wxh-t, .td-wxh-c, .td-wxh-hl, .td-act-box b').all()).map(box))
  for (const c of clouds) {
    expect(c.y + c.height, 'cloud bottom').toBeLessThanOrEqual(hb.y + hb.height * 0.4)
    for (const w of words) expect(c.x >= w.x + w.width || c.x + c.width <= w.x || c.y >= w.y + w.height || c.y + c.height <= w.y, `cloud ${JSON.stringify(c)} crosses ${JSON.stringify(w)}`).toBe(true)
  }
})

test('T5 / T7: slots carry a temperature, Full forecast is 44 px, the 55% evening line is a see-through pill with no icon', async ({ page }) => {
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(FIXED_CLOCKS[1]), temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: (h) => (h === 19 ? 55 : 5) }) }))
  await page.reload()
  const hero = page.getByTestId('weather-hero')
  const slots = hero.locator('[data-testid="hourly-strip"] li')
  await expect(slots).toHaveCount(12)
  for (const li of await slots.all()) await expect(li).toContainText('°')
  expect((await box(hero.getByRole('link', { name: /Full forecast/ }))).height).toBeGreaterThanOrEqual(44)
  await expect(hero.getByRole('link', { name: /Full forecast/ })).toHaveAttribute('href', '#weather')
  const pill = hero.locator('.td-act-box')
  await expect(pill).toContainText('Rain 55% this evening')
  expect(await pill.locator('svg').count()).toBe(0)
  expect(await pill.evaluate((e) => Number((getComputedStyle(e).backgroundColor.match(/[\d.]+/g) ?? [])[3] ?? 1))).toBeLessThan(0.3)
  await assertTextContrast(page)
  await page.setViewportSize({ width: 360, height: 800 })
  const boxes = await Promise.all((await slots.all()).map(box))
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.x, 'slots must not overlap').toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width)
  await assertNoSideways(page)
  if (FULL_SHOTS) { await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: `${FULL_SHOTS}/today-hero.png` }) }
})

test('T9 / T10 / T14: the ring is 64 px, the four rows share a text edge and height, the water plus is a 44 px button with a 22 px glyph', async ({ page }) => {
  const ring = await box(page.getByTestId('myday-ring').locator('svg'))
  expect([Math.round(ring.width), Math.round(ring.height)]).toEqual([64, 64])
  await expect(page.getByTestId('myday').getByText('All yours today')).toBeVisible()
  const ids = ['myday-checkin', 'myday-bp', 'myday-water', 'selfcare']
  const edges = await Promise.all(ids.map((i) => box(page.getByTestId(i).locator('.td-grow'))))
  const rows = await Promise.all(ids.map((i) => box(page.getByTestId(i))))
  for (const e of edges) expect(Math.abs(e.x - edges[0]!.x), 'text left edges').toBeLessThanOrEqual(1)
  for (const r of rows) expect(Math.abs(r.height - rows[0]!.height), `row heights ${rows.map((x) => x.height)}`).toBeLessThanOrEqual(2)
  const plus = page.getByRole('button', { name: 'Add a glass of water' })
  const [pb, gb] = [await box(plus), await box(plus.locator('svg'))]
  expect(pb.width).toBeGreaterThanOrEqual(44); expect(pb.height).toBeGreaterThanOrEqual(44)
  expect([Math.round(gb.width), Math.round(gb.height)]).toEqual([22, 22])
})

test('T11: Calm is deep teal with an 84 px orb, and nothing moves under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  const calm = page.getByRole('button', { name: 'Breathe for 1 minute' })
  await expect(calm).toHaveCSS('background-color', 'rgb(31, 59, 69)')
  const orb = await box(calm.locator('.bo-orb').locator('..'))
  expect([Math.round(orb.width), Math.round(orb.height)]).toEqual([84, 84])
  await assertTextContrast(page)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0)
})

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [390, 360] as const) {
    test(`shots ${scheme} ${width}`, async ({ page }) => {
      test.skip(!FULL_SHOTS, 'set V13_SHOTS to write screenshots')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 844 })
      await setScheme(page, scheme)
      await page.reload()
      await expect(page.getByTestId('weather-hero').locator('.td-wxh-t')).toBeVisible()
      await page.screenshot({ path: `${FULL_SHOTS}/today-${scheme}-${width}.png`, fullPage: true })
    })
  }
}

// T17: at scroll 0 no control sits under Jack's button or his one-time tip ("Help, scan or chat"), which assertJackClear does not know about
for (const width of [390, 360, 320] as const) {
  test(`T17: nothing under Jack or his tip at rest, ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.reload()
    await expect(page.getByTestId('myday')).toBeVisible()
    await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = 0 })
    const hits = await page.evaluate(() => {
      const hint = document.querySelector('.sh-hint') as HTMLElement | null
      const blocks = [document.querySelector('.sh-jackfab'), hint && getComputedStyle(hint).visibility !== 'hidden' ? hint : null].filter(Boolean).map((e) => e!.getBoundingClientRect())
      return [...document.querySelectorAll<HTMLElement>('button, a, [role=button]')].filter((n) => !n.closest('.sh-jackfab') && !n.classList.contains('sh-jackfab')).filter((n) => {
        const r = n.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && blocks.some((b) => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top)
      }).map((n) => { const r = n.getBoundingClientRect(); return `${(n.getAttribute('aria-label') || n.textContent || n.tagName).trim().slice(0, 40)} @${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)} blocks ${JSON.stringify(blocks.map((b) => [b.left, b.top, b.right, b.bottom].map(Math.round)))}` })
    })
    expect(hits, 'controls under Jack or the tip').toEqual([])
  })
}

// Log something else keeps whole words next to Jack: one line, or a wrap between words, at 320, 360 and 390 px
for (const width of [320, 360, 390] as const) {
  test(`Log something else never breaks a word, ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.reload()
    await expect(page.getByTestId('myday-more')).toBeVisible()
    await page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = 0 })
    const r = await page.getByTestId('myday-more').evaluate((row) => {
      const t = row.querySelector('.rw-title')!.firstChild as Text
      const words = [...t.data.matchAll(/\S+/g)].map((m) => { const g = document.createRange(); g.setStart(t, m.index!); g.setEnd(t, m.index! + m[0].length); return { w: m[0], lines: new Set([...g.getClientRects()].map((q) => Math.round(q.top))).size } })
      const el = row.querySelector('.rw-title') as HTMLElement
      return { words, over: row.scrollWidth > row.clientWidth + 1, cut: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 }
    })
    expect(r.words.map((x) => x.w).join(' ')).toBe('Log something else')
    expect(r.words.filter((x) => x.lines > 1), 'words split across lines').toEqual([])
    expect(r.over).toBe(false)
    expect(r.cut, 'title cut off or ending in an ellipsis').toBe(false)
  })
}
