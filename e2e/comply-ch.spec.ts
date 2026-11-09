import { expect, test, type Page } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'
import { full } from './fixtures/s16/health'
import { FIXED_CLOCKS, setScheme } from './v13'

declare const process: { env: Record<string, string | undefined> }

// Lane CH (compliance): Health and sub-screens against their boards. Invented data only. The file name keeps it in the chromium project,
// Pinned was a sideways row because a 2 x 2 grid put a tile under Jack; S21 (the owner's phone feedback) chose the 2 x 2 grid anyway.
// but the signed-in mock needs the Supabase-env build (served on PW_PORT + 500).
test.use({ baseURL: `http://localhost:${Number(process.env.PW_PORT ?? 4317) + 500}`, serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await skipOnboarding(page)
  await mock(page, FIXED_CLOCKS[1])
})

const at = async (page: Page, hash: string, h1: string | RegExp) => {
  await page.goto(`/${hash}`)
  await expect(page.locator('h1').first()).toHaveText(h1)
}

/** Whole scroller in one shot at width w (the app scrolls inside `.bt .scroll`). */
async function fullShot(page: Page, path: string, w: number) {
  const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? document.documentElement.scrollHeight)
  await page.setViewportSize({ width: w, height: Math.min(h + 140, 6000) })
  await page.waitForTimeout(400)
  await page.screenshot({ path, animations: 'disabled' })
  await page.setViewportSize({ width: w, height: 844 })
}

const ROUTES: [string, string][] = [['health', '#health'], ['readings', '#health/readings'], ['labs', '#health/labs'], ['meds', '#health/meds'], ['visits', '#health/visits'], ['move', '#health/move'], ['body', '#health/body'], ['member', '#health/member/ma']]

test('shots (CH_SHOTS)', async ({ page }) => {
  test.skip(!process.env.CH_SHOTS, 'evidence only, set CH_SHOTS=<dir>')
  test.setTimeout(420_000)
  const dir = process.env.CH_SHOTS!
  await full(page, FIXED_CLOCKS[1])
  for (const [name, hash] of ROUTES.filter(([n]) => !process.env.CH_ONLY || process.env.CH_ONLY.split(',').includes(n))) { // routes outer: member/ma (last) switches the person
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 844 })
      await page.goto(`/${hash}`)
      await expect(page.locator('h1').first()).toBeVisible()
      await page.waitForTimeout(500)
      for (const s of ['light', 'dark'] as const) {
        await setScheme(page, s)
        await fullShot(page, `${dir}/${name}-${w}-${s}.png`, w)
      }
    }
  }
  // Body wiki on a system that has numbers and one with a long emergency list
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#health/body')
  await page.getByRole('button', { name: 'Digestion and liver' }).click()
  await fullShot(page, `${dir}/body-digestion-390-light.png`, 390)
})

test('Visits: Prepare visit summary is a solid full-width 56 px button; Bring rows carry real sublines', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/visits', 'Doctors & Lab Appointments')
  const b = (await page.getByRole('link', { name: 'Prepare visit summary' }).boundingBox())!
  expect(b.height).toBeGreaterThanOrEqual(56)
  expect(b.width).toBeGreaterThanOrEqual(340)
  expect(await page.locator('.vs-bring .vs-sub').count()).toBeGreaterThanOrEqual(3)
})

test('Readings: 7-day averages are grouped rows, not tiles', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/readings', 'Readings')
  await expect(page.getByTestId('rd-averages').getByRole('listitem').first()).toBeVisible()
  expect(await page.getByTestId('rd-averages').getByRole('listitem').count()).toBeGreaterThanOrEqual(4)
  expect(await page.getByTestId('rd-averages').locator('.pt').count()).toBe(0)
})

test('A1: Body wiki shows the 911 and doctor lists for every system, with sources, ', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/body', 'Body wiki')
  const more = page.getByTestId('body-systems').getByRole('button', { name: /^Show \d+ more$/ })
  while (await more.count()) await more.first().click() // D-156 (S25): the systems show four at a time
  const chips = page.getByTestId('body-systems').locator('button.an-chip')
  const n = await chips.count()
  expect(n).toBe(9)
  for (let i = 0; i < n; i++) {
    await chips.nth(i).click()
    const info = page.getByTestId('system-info')
    await expect(info.getByTestId('care-911')).toHaveText('Get emergency help (911) if:')
    await expect(info.getByTestId('care-doctor')).toHaveText('Call a doctor if')
    expect(await info.locator('[data-kind="911"] li').count()).toBeGreaterThanOrEqual(5)
    expect(await info.locator('[data-kind="doctor"] li').count()).toBeGreaterThanOrEqual(4)
    await expect(info.getByTestId('care-sources').locator('a').first()).toHaveAttribute('href', /^https:\/\//)
  }
})

// ---- Round 2 measured assertions ----
/** Contrast of an element's text colour against the first opaque background above it (both read from computed style). */
const contrastOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => {
  const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
  const lum = ([r, g, b]: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!) }
  let bg = [255, 255, 255]
  for (let n: Element | null = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.9) { bg = c; break } }
  const fg = rgb(getComputedStyle(el).color)
  const [a, b] = [lum(fg), lum(bg)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
})

test('Labs: board order, board labels, bar with a You bubble, tick numbers clear of the sentence', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/labs', 'Labs')
  const sum = page.getByTestId('lab-summary')
  await expect(sum.locator('span')).toHaveText(['To ask about', 'Low', 'Normal'])
  await expect(page.getByRole('group', { name: 'Filter results' }).getByRole('button')).toHaveText(['All', 'To ask about', 'In range'])
  const y = (id: string) => page.getByTestId(id).evaluate((e) => e.getBoundingClientRect().top)
  expect(await y('lab-summary')).toBeLessThan(await page.locator('a.lr-card').first().evaluate((e) => e.getBoundingClientRect().top))
  expect(await page.locator('a.lr-card').last().evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThan(await y('lab-source')) // Source is below the cards
  expect(await y('lab-source')).toBeLessThan(await y('lab-questions'))
  const bubble = page.locator('.lr-box .lr-you b').first()
  await expect(bubble).toContainText(/^You \d/)
  expect(await contrastOf(page, '.lr-box .lr-you b')).toBeGreaterThanOrEqual(4.5)
  // no tick number overlaps the sentence under its bar
  const clear = await page.locator('.lr-box').evaluateAll((boxes) => boxes.every((bx) => {
    const say = bx.querySelector('.lr-say')?.getBoundingClientRect()
    const over = bx.querySelector('.lr-over')?.getBoundingClientRect() // the +N% over line must not sit on a tick number either
    const ticks = Array.from(bx.querySelectorAll('.lr-tick')).map((t) => t.getBoundingClientRect())
    return (!say || ticks.every((t) => t.bottom <= say.top + 1)) && (!over || ticks.every((t) => t.bottom <= over.top + 1))
  }))
  expect(clear).toBe(true)
  await expect(page.getByTestId('lab-actions').first().getByRole('link')).toHaveText(['What it means', 'Ask at next visit'])
})

test('Labs and Visits and Move back links take their board colours; Papers is red on Labs', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  const tones: [string, string, string][] = [['#health/labs', 'Labs', 'red'], ['#health/visits', 'Doctors & Lab Appointments', 'purple'], ['#health/move', 'Move and food', 'teal']]
  for (const [hash, h1, tone] of tones) {
    await at(page, hash, h1)
    await expect(page.locator('.lt-back')).toHaveAttribute('data-tone', tone)
    expect(await contrastOf(page, '.lt-back')).toBeGreaterThanOrEqual(4.5)
  }
  await at(page, '#health/meds', 'Medicines')
  await expect(page.locator('.lt-back')).not.toHaveAttribute('data-tone', /.+/) // default stays green
})

test('Medicines: Add is level with the Me line; Paused and Past are rows in Your lists', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/meds', 'Medicines')
  const me = (await page.getByTestId('who-line').boundingBox())!
  const add = (await page.getByRole('button', { name: 'Add' }).first().boundingBox())!
  expect(Math.abs(add.y + add.height / 2 - (me.y + me.height / 2))).toBeLessThanOrEqual(4)
  expect(add.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByTestId('meds-list-paused')).toContainText('None')
  await expect(page.getByTestId('meds-list-stopped')).toContainText('None')
})

test('Move: picture panel, posture chip, locked Start passes 4.5:1, Food block from real logs', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/move', 'Move and food')
  const card = page.locator('.mv-ccard').first()
  expect((await card.locator('.mv-pic').boundingBox())!.height).toBeGreaterThanOrEqual(96)
  await expect(card.getByTestId('posture-chip')).toHaveText(/Sitting|Standing|Lying down/)
  await expect(card).toHaveAttribute('aria-disabled', 'true') // locked until the Doctor OK row is tapped
  expect(await contrastOf(page, '.mv-ccard .mv-start')).toBeGreaterThanOrEqual(4.5) // was 2.8:1 at opacity .6
  expect(await contrastOf(page, '.mv-ccard .mv-card-t b')).toBeGreaterThanOrEqual(4.5)
  await expect(page.getByTestId('food-block').getByRole('heading', { name: 'Food' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log a meal' })).toBeVisible()
  await expect(page.getByTestId('salt-card')).toBeVisible()
  await expect(page.getByTestId('water-card')).toBeVisible()
})

test('7-day chart labels at 360: 12 px or more on screen, none touching the next, all inside the chart', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await page.setViewportSize({ width: 360, height: 844 })
  await at(page, '#health/readings', 'Readings')
  const svg = page.locator('svg.mc').first()
  await expect(svg.locator('text.mc-d')).toHaveCount(7)
  const m = await svg.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const t = Array.from(el.querySelectorAll('text.mc-d')).map((x) => x.getBoundingClientRect())
    return { px: parseFloat(getComputedStyle(el.querySelector('text.mc-d')!).fontSize) * (box.width / 320), gaps: t.slice(1).map((r, i) => r.left - t[i]!.right), inside: t.every((r) => r.left >= box.left && r.right <= box.right) }
  })
  expect(m.px).toBeGreaterThanOrEqual(12)
  expect(Math.min(...m.gaps)).toBeGreaterThanOrEqual(4)
  expect(m.inside).toBe(true)
})

test('Body wiki: every system has a 48 px solid Call 911 link under the emergency list; As reported labels show', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/body', 'Body wiki')
  const chips = page.getByTestId('body-systems').getByRole('button')
  for (let i = 0; i < (await chips.count()); i++) {
    await chips.nth(i).click()
    const call = page.getByTestId('care-call-911')
    await expect(call).toHaveAttribute('href', 'tel:911')
    expect((await call.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    const [r, g] = (await call.evaluate((e) => getComputedStyle(e).backgroundColor)).match(/\d+/g)!.map(Number) // solid red, not the green button style
    expect(r!).toBeGreaterThan(g! + 80)
    expect((await call.boundingBox())!.width).toBeGreaterThanOrEqual(280)
    expect(await contrastOf(page, '[data-testid=care-call-911]')).toBeGreaterThanOrEqual(4.5)
  }
  await chips.filter({ hasText: 'Lungs' }).click()
  await expect(page.getByTestId('care-reported')).toContainText('not DOH pages')
})
