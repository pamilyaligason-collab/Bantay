import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'

// Session 12 lane J (polish S2, S3, S5, S6, S7, S9). Made-up data, frozen clock, no network. PW_PORT=5607 for this lane.
// Shots (390x844, light and dark) go to docs/session-12/shots/J/ and are compared by eye with the mockup screens today-full, health-home, health-labs, family-home.
const SHOTS = 'docs/session-12/shots/J'
const NOW = new Date('2026-10-27T04:00:00Z') // 12:00 in Manila, a Tuesday
type Row = Record<string, unknown>

/** Wait until the app has created the database and the store (opening a missing one would make an empty database), then write the rows. */
async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await expect.poll(() => page.evaluate(async ([name]) => (await indexedDB.databases()).some((d) => d.name === name), [dbName] as const), { message: `${dbName} exists`, timeout: 20_000 }).toBe(true)
  await page.evaluate(async ([name, st, list]) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open(name as string)
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        if (!open.result.objectStoreNames.contains(st as string)) { open.result.close(); return rej(new Error(`no store ${String(st)}`)) }
        const tx = open.result.transaction(st as string, 'readwrite')
        for (const r of list as Row[]) tx.objectStore(st as string).put(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows] as const)
}

const ago = (days: number, h = 7, m = 40) => { const d = new Date(NOW.getTime() - days * 86_400_000); d.setUTCHours(h - 8, m, 0, 0); return d.toISOString() }
const TESTS = ['ldl', 'hdl', 'total_cholesterol', 'triglycerides', 'hba1c', 'fasting_glucose', 'egfr', 'creatinine', 'uric_acid', 'hemoglobin', 'platelets', 'wbc', 'alt', 'ast', 'mystery_a', 'mystery_b']

/** Three people, one with 16 lab results (long page), check-ins for two of them. */
async function open(page: Page, hash: string) {
  await page.clock.setFixedTime(NOW)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: openMeteoFixture({ now: NOW, temp: 34, humidity: 62, feels: 38, code: 2, hourlyProb: () => 10 }) }))
  await skipOnboarding(page)
  await page.goto('/#health')
  await expect(page.getByRole('heading', { name: 'Health', level: 1 })).toBeVisible()
  await seed(page, 'bantay-health', 'people', [{ id: 'p1', name: 'loyd sevilla' }, { id: 'p2', name: 'Papa Ben' }, { id: 'p3', name: 'Lola Remy' }])
  await seed(page, 'bantay-health', 'readings', TESTS.map((test, i) => ({ personId: 'p1', takenAt: ago(60 + i), test, value: 226.74 - i * 7.11, unit: 'mg/dL' })))
  await page.goto('/#today') // Today opens the log database
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
  await seed(page, 'bantay-log', 'activity', [
    { personId: 'p1', kind: 'check-in', minutes: null, steps: null, startedAt: ago(0), source: 'manual' },
    { personId: 'p2', kind: 'check-in', minutes: null, steps: null, startedAt: ago(3), source: 'manual' }
  ])
  await page.goto('/#' + hash)
  await page.reload()
}

/** Scroll the one scrolling root to its end; the last painted item's bottom and the top of whatever sits over the content (tab bar or the raised Ask bubble). */
const endGap = (page: Page) => page.evaluate(async () => {
  const main = document.querySelector('main.scroll') as HTMLElement
  main.scrollTop = main.scrollHeight
  await new Promise((r) => setTimeout(r, 300))
  main.scrollTop = main.scrollHeight
  const items = Array.from(main.querySelectorAll<HTMLElement>('*')).filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.position !== 'fixed' && cs.visibility !== 'hidden' })
  const bottom = Math.max(...items.map((e) => e.getBoundingClientRect().bottom))
  const over = Math.min(document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect().top, document.querySelector('.sh-tabs .sh-bub')?.getBoundingClientRect().top ?? Infinity)
  return { bottom, over, scrolls: main.scrollHeight > main.clientHeight }
})

test.use({ viewport: { width: 390, height: 844 } })

// S3: measured with bounding boxes on pages long enough to scroll, not read from the CSS text.
for (const hash of ['today', 'health', 'family', 'safety', 'health/meds', 'family/plan', 'weather']) {
  test(`S3: ${hash} ends with room above the tab bar`, async ({ page }) => {
    await open(page, hash)
    const g = await endGap(page)
    expect(g.bottom, `${hash}: last item bottom ${g.bottom} vs tab bar top ${g.over}`).toBeLessThanOrEqual(g.over - 8)
  })
}

test('S3: the spacer is a flex item, so a webview that drops padding-bottom still clears the bar', async ({ page }) => {
  await open(page, 'health')
  await expect(page.getByRole('heading', { name: 'Health', level: 1 })).toBeVisible()
  await expect(page.locator('nav[aria-label="Main"]')).toBeVisible()
  const m = await page.evaluate(() => {
    const main = document.querySelector('main.scroll') as HTMLElement
    return { pad: parseFloat(getComputedStyle(main).paddingBottom), spacer: parseFloat(getComputedStyle(main, '::after').height), bar: document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect().height }
  })
  expect(m.pad).toBe(0)
  expect(m.spacer).toBeGreaterThanOrEqual(m.bar) // at least the bar's own height sits under the last item
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme })

    test(`S2: the temperature on the weather card is white on the dark sky, and no empty plan card (${scheme})`, async ({ page }) => {
      await open(page, 'today')
      const card = page.locator('section[aria-label="Weather"] .wxs-host')
      await expect(card).toBeVisible()
      for (const sel of ['.td-wx-t, .td-wxh-t', '.td-k, .td-wx-row b']) {
        const color = await card.locator(sel).first().evaluate((e) => getComputedStyle(e).color)
        expect(color, sel).toBe('rgb(255, 255, 255)') // white on SKY + SCRIM, which scene.test.ts proves is at least 4.5:1
      }
      await expect(page.getByRole('heading', { name: "Today's plan" })).toHaveCount(0) // S5
      await expect(page.getByText('Nothing planned for today')).toHaveCount(0)
      await page.screenshot({ path: `${SHOTS}/today-${scheme}.png` })
    })

    test(`S6, S7: Health with old readings only has one empty state, a proper-case name and folded labs (${scheme})`, async ({ page }) => {
      await open(page, 'health')
      await expect(page.getByTestId('no-vitals')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'No vitals yet for Loyd' })).toBeVisible()
      await expect(page.getByTestId('insight')).toHaveCount(0)
      await expect(page.getByTestId('nudge')).toHaveCount(0)
      await expect(page.getByText(/No vitals yet/)).toHaveCount(1)
      const labs = page.getByTestId('labs-list')
      await labs.scrollIntoViewIfNeeded()
      await expect(labs).not.toContainText('226.74')
      await expect(labs.locator('details.lr-fold').first()).toBeVisible()
      expect(await labs.locator('details[open]').count()).toBe(0) // folded until tapped
      await page.screenshot({ path: `${SHOTS}/health-labs-${scheme}.png` })
    })

    test(`S9: People bubbles say the last check-in in words, with no sleep icon (${scheme})`, async ({ page }) => {
      await open(page, 'family')
      const roll = page.getByRole('list', { name: 'Family roll call' })
      await expect(roll).toBeVisible()
      await expect(roll).toContainText('Last OK 3 days ago')
      await expect(roll).toContainText('No check-in yet')
      await expect(roll).not.toContainText('💤')
      await roll.getByRole('button', { name: /Papa Ben/ }).click()
      await expect(page).toHaveURL(/#family\/people\/p2$/)
      await page.goto('/#family')
      await page.screenshot({ path: `${SHOTS}/family-${scheme}.png` })
    })
  })
}
