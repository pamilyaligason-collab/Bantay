import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'

// Session 12 lane J (polish S2, S3, S5, S6, S7, S9). Made-up data, frozen clock, no network. PW_PORT=5607 for this lane.
// Shots (390x844, light and dark) go to docs/session-12/shots/J/ and are compared by eye with the mockup screens today-full, health-home, health-labs, family-home.
const SHOTS = 'docs/session-12/shots/J'
const NOW = new Date('2026-10-27T04:00:00Z') // 12:00 in Manila, a Tuesday
type Row = Record<string, unknown>

/** Committed shots are written only when SHOTS=1 (a normal gate run leaves the tree clean, ML-32); the clock is frozen in open(), fonts and animations are settled first. */
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS !== '1') return
  await page.evaluate(() => document.fonts.ready)
  // settled = two frames in a row are byte-identical (late paints such as the header avatar finish first), then that frame is the shot
  const take = () => page.screenshot({ animations: 'disabled', caret: 'hide' })
  let prev = await take()
  for (let i = 0; i < 20; i++) { const next = await take(); if (next.equals(prev)) break; prev = next }
  const file = `${SHOTS}/${name}.png`
  // The header avatar edge antialiases differently from one browser start to the next (a few dozen pixels). A rerun keeps the committed file unless the picture really changed.
  if (existsSync(file)) {
    const diff = await page.evaluate(async ([a, b]) => {
      const load = (b64: string) => new Promise<ImageData>((res, rej) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d')!; x.drawImage(i, 0, 0); res(x.getImageData(0, 0, i.width, i.height)) }; i.onerror = rej; i.src = `data:image/png;base64,${b64}` })
      const [p, q] = await Promise.all([load(a!), load(b!)])
      if (p.width !== q.width || p.height !== q.height) return Infinity
      let n = 0
      for (let k = 0; k < p.data.length; k += 4) if (Math.abs(p.data[k]! - q.data[k]!) > 8 || Math.abs(p.data[k + 1]! - q.data[k + 1]!) > 8 || Math.abs(p.data[k + 2]! - q.data[k + 2]!) > 8) n++
      return n
    }, [readFileSync(file).toString('base64'), prev.toString('base64')] as const)
    if (diff <= 200) return
  }
  writeFileSync(file, prev)
}

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
const endGap = async (page: Page) => {
  await expect(page.locator('main.scroll')).toBeVisible() // the screen has rendered
  await expect(page.locator('nav[aria-label="Main"]')).toBeVisible()
  return page.evaluate(async () => {
  const main = document.querySelector('main.scroll') as HTMLElement
  // the body of a closed <details> (Official sources on Weather) keeps a layout box but is not painted: it is not an item
  const closedDetails = (e: HTMLElement) => { const d = e.closest('details'); return !!d && !d.open && !e.closest('summary') }
  // settled = the scroll height stops growing across two animation frames (late-rendering cards), then pin to the end
  let last = -1
  for (let i = 0; i < 60 && main.scrollHeight !== last; i++) { last = main.scrollHeight; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) }
  main.scrollTop = main.scrollHeight
  const items = Array.from(main.querySelectorAll<HTMLElement>('*')).filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.position !== 'fixed' && cs.visibility !== 'hidden' && !closedDetails(e) })
  const bottom = Math.max(...items.map((e) => e.getBoundingClientRect().bottom))
  const over = Math.min(document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect().top, document.querySelector('.sh-tabs .sh-bub')?.getBoundingClientRect().top ?? Infinity)
  return { bottom, over, scrolls: main.scrollHeight > main.clientHeight }
  })
}

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
      const card = page.getByTestId('weather-hero') // S16: the scene hero (SceneHero) replaced the old .wxs-host card
      await expect(card).toBeVisible()
      for (const sel of ['.td-wxh-t', '.sc-kicker']) {
        const color = await card.locator(sel).first().evaluate((e) => getComputedStyle(e).color)
        expect(color, sel).toBe('rgb(255, 255, 255)') // white on SKY + SCRIM, which scene.test.ts proves is at least 4.5:1
      }
      await expect(page.getByRole('heading', { name: "Today's plan" })).toHaveCount(0) // S5
      await expect(page.getByText('Nothing planned for today')).toHaveCount(0)
      await shot(page, `today-${scheme}`)
    })

    test(`S6, S7: Health with old readings only has one empty hero and one Labs tile (${scheme})`, async ({ page }) => {
      await open(page, 'health')
      await expect(page.getByTestId('bodyhero')).toContainText('No readings yet')
      await expect(page.getByTestId('insight')).toHaveCount(0)
      await expect(page.getByTestId('nudge')).toHaveCount(0)
      const labs = page.getByTestId('glance-labs') // S14: the overview keeps one tile, the list lives on #health/labs
      await labs.scrollIntoViewIfNeeded()
      await expect(labs).toHaveAttribute('href', '#health/labs')
      await shot(page, `health-labs-${scheme}`)
    })

    test(`S7: the Lab results screen shows one decimal, never the raw stored value (${scheme})`, async ({ page }) => {
      await open(page, 'health/labs')
      await page.getByRole('group', { name: 'Whose records' }).getByRole('button', { name: 'loyd' }).click() // the readings belong to this person
      const labs = page.getByTestId('labs-list')
      await expect(labs).toBeVisible()
      await expect(labs).not.toContainText('226.74')
      await expect(labs).toContainText('226.7')
    })

    test(`S9: People bubbles say the last check-in in words, with no sleep icon (${scheme})`, async ({ page }) => {
      await open(page, 'family')
      const roll = page.getByRole('list', { name: 'Family roll call' })
      await expect(roll).toBeVisible()
      await expect(roll).toContainText('Last OK 3 days ago')
      await expect(roll).toContainText('No check-in yet')
      await expect(roll).not.toContainText('💤')
      await roll.getByRole('button', { name: /Papa Ben/ }).click() // S16: a face opens a sheet with the two things you can do (Faces row)
      const sheet = page.getByRole('dialog', { name: 'Papa' })
      await expect(sheet).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(sheet).toHaveCount(0)
      await roll.getByRole('button', { name: /Papa Ben/ }).click()
      await sheet.getByRole('link', { name: 'Send a message' }).click() // non-carers still reach Messages from the face (ML-13)
      await expect(page).toHaveURL(/#family\/messages$/)
      await page.goto('/#family')
      await roll.getByRole('button', { name: /Papa Ben/ }).click()
      await sheet.getByRole('link', { name: 'See their stats' }).click()
      await expect(page).toHaveURL(/#family\/people\/p2$/)
      await page.goto('/#family')
      await expect(roll).toContainText('Last OK 3 days ago') // the roll call is back (it reloads after the page change) before the shot
      await expect(roll.getByRole('button', { name: /Papa Ben/ })).toBeVisible()
      await shot(page, `family-${scheme}`)
    })
  })
}
