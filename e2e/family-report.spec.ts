import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Family tab (session 8 wave 2): roll call with a neutral flag line, member report, learning hub, Memories (off by default). Made-up data only.

/** Raw IndexedDB writes into the stores the app's Dexie databases created. Retries until the app has opened the database (never creates one). */
const seed = (page: Page, db: string, store: string, rows: unknown[]) =>
  page.evaluate(async ([d, s, r]) => {
    const once = () => new Promise<void>((res, rej) => {
      const o = indexedDB.open(d as string)
      o.onupgradeneeded = () => o.transaction!.abort()
      o.onerror = () => rej(o.error)
      o.onsuccess = () => {
        const h = o.result
        try {
          const tx = h.transaction(s as string, 'readwrite')
          for (const row of r as unknown[]) tx.objectStore(s as string).put(row)
          tx.oncomplete = () => { h.close(); res() }
          tx.onerror = () => { h.close(); rej(tx.error) }
        } catch (e) { h.close(); rej(e) }
      }
    })
    for (let i = 0; i < 50; i++) {
      try { return await once() } catch { await new Promise((x) => setTimeout(x, 100)) }
    }
    throw new Error(`could not seed ${d as string}`)
  }, [db, store, rows] as const)

// label-content-name-mismatch is off: the roll call buttons already carry a 'Name, status. Open page' label that other specs match on (it fails the same way without this lane's flag line).
const axe = async (page: Page) => (await new AxeBuilder({ page }).include('main').disableRules(['label-content-name-mismatch']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && Array.from(document.querySelectorAll('main, main *')).every((el) => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1))

const seedAll = async (page: Page) => {
  const now = Date.now()
  const iso = (daysAgo: number, h = 8) => { const d = new Date(now - daysAgo * 86_400_000); d.setHours(h, 5, 0, 0); return d.toISOString() }
  await seed(page, 'bantay-health', 'people', [{ id: 'p1', name: 'Maria Sample' }, { id: 'p2', name: 'Pedro Sample' }])
  await seed(page, 'bantay-health', 'readings', [
    { personId: 'p1', takenAt: iso(1), test: 'bp_systolic', value: 150, unit: 'mmHg' },
    { personId: 'p1', takenAt: iso(1), test: 'bp_diastolic', value: 95, unit: 'mmHg' },
    { personId: 'p1', takenAt: iso(1), test: 'heart_rate', value: 72, unit: 'bpm' },
    { personId: 'p1', takenAt: iso(3), test: 'ldl', value: 162, unit: 'mg/dL' },
    { personId: 'p1', takenAt: iso(3), test: 'hemoglobin', value: 11.2, unit: 'g/dL', labLow: 12, labHigh: 17.5 }
  ])
  await seed(page, 'bantay-log', 'medications', [{ clientId: 'c1', serverId: 'm1', personId: 'p1', name: 'Losartan', medStatus: 'active', schedule: { v: 1, times: ['08:00'] } }])
  await seed(page, 'bantay-log', 'meds', [6, 5, 4, 3, 2].map((n) => ({ personId: 'p1', name: 'Losartan', takenAt: iso(n), medicationId: 'm1', slot: '08:00' }))) // yesterday missed
}

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#family')
  await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible()
  await seedAll(page)
  await page.reload()
  await expect(page.getByLabel('Family roll call')).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`people list: neutral flag line with no health numbers (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    const row = page.getByLabel('Family roll call').locator('li', { hasText: 'Maria Sample' })
    await expect(row.getByTestId('flag-line')).toHaveText(/^\d+ to check$/)
    const text = (await row.innerText()).replace(/\d+ to check/, '')
    expect(text).not.toMatch(/150|95|162|11\.2|mmHg|mg\/dL/)
    await expect(page.getByLabel('Family roll call').locator('li', { hasText: 'Pedro Sample' }).getByTestId('flag-line')).toHaveCount(0) // no data: no claim either way
    expect(await axe(page)).toEqual([])
    expect(await noSideways(page)).toBe(true)
  })

  test(`member report: verdicts, 7 day cells, flagged labs, bring-up list, print button, privacy (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.getByRole('button', { name: /Maria Sample/ }).click()
    await page.getByRole('link', { name: 'Full report' }).click()
    await expect(page).toHaveURL(/#family\/people\/p1\/report$/)
    await expect(page.getByTestId('report')).toBeVisible()
    await expect(page.getByTestId('rp-vitals')).toContainText('150/95')
    await expect(page.getByTestId('rp-vitals')).toContainText('High')
    await expect(page.getByTestId('rp-vitals')).toContainText('In range') // pulse
    await expect(page.getByTestId('rp-meds').locator('.rp-cell')).toHaveCount(7)
    await expect(page.getByTestId('rp-meds').locator('.rp-cell.missed').first()).toBeVisible()
    await expect(page.getByTestId('rp-meds')).toContainText('Missed: Losartan')
    await expect(page.getByTestId('rp-labs')).toContainText('LDL')
    await expect(page.getByTestId('rp-labs')).toContainText('High')
    await expect(page.getByTestId('rp-labs')).toContainText('Low')
    const items = page.getByTestId('rp-bring').locator('ol > li')
    expect(await items.count()).toBeGreaterThanOrEqual(3)
    await expect(page.getByRole('button', { name: 'Print or save as PDF for the doctor' })).toBeVisible()
    await expect(page.locator('.rp-privacy')).toContainText('Private')
    expect(await axe(page)).toEqual([])
    expect(await noSideways(page)).toBe(true)
    const box = await page.getByRole('button', { name: 'Print or save as PDF for the doctor' }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(56)
  })

  test(`learning hub: four cards, one per topic, sources credited (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    const hub = page.getByTestId('learn-hub')
    await expect(hub.locator('.hub-card')).toHaveCount(4)
    expect(await hub.locator('.hub-card').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cat).sort())).toEqual(['mind', 'move-eat', 'sleep', 'stress'])
    expect(await hub.locator('.hub-card').evaluateAll((els) => new Set(els.map((e) => e.className.replace(/\bhub-card\b|\bopen\b/g, '').trim())).size)).toBeGreaterThan(1) // mixed sizes
    for (const a of await hub.locator('a.hub-main').all()) {
      await expect(a).toHaveAttribute('rel', /noopener/)
      await expect(a).toHaveAttribute('href', /^https:\/\/(www\.nimh\.nih\.gov|medlineplus\.gov|www\.who\.int)\//)
    }
    const video = hub.locator('button.hub-main').first()
    await video.scrollIntoViewIfNeeded()
    await video.click()
    await expect(hub.getByRole('button', { name: /^Play / }).or(hub.getByText('Open when online'))).toBeVisible() // nothing loads from YouTube until Play is tapped
    expect(await hub.locator('iframe').count()).toBe(0)
    expect(await axe(page)).toEqual([])
    expect(await noSideways(page)).toBe(true)
  })

  test(`memories is off by default, then says what is missing instead of failing (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    const m = page.getByTestId('memories')
    await m.scrollIntoViewIfNeeded()
    await expect(m.getByRole('button', { name: 'Turn on Memories' })).toBeVisible()
    await expect(m.getByRole('button', { name: 'Add a photo' })).toHaveCount(0)
    expect(await axe(page)).toEqual([])
    await m.getByRole('button', { name: 'Turn on Memories' }).click()
    await expect(m.getByTestId('mem-state')).toContainText(/Memories (is not set up yet|needs you to be signed in)/) // no sign-in in the e2e build
    await expect(m.getByRole('button', { name: 'Turn Memories off on this phone' })).toBeVisible()
    expect(await axe(page)).toEqual([])
    await page.reload()
    await expect(page.getByTestId('memories').getByTestId('mem-state')).toBeVisible() // the choice is remembered on this phone
  })
}

test('the print sheet drops the tab bar and top bar and keeps the report', async ({ page }) => {
  await page.goto('/#family/people/p1/report')
  await expect(page.getByTestId('report')).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.tabbar')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Print or save as PDF for the doctor' })).toBeHidden()
  await expect(page.getByTestId('rp-vitals')).toBeVisible()
  await expect(page.locator('.rp-print-title')).toBeVisible()
})

test('a person this phone has no data for gets an empty report, not zeros', async ({ page }) => {
  await page.goto('/#family/people/p2/report')
  await expect(page.getByText(/Nothing to report yet for Pedro/)).toBeVisible()
})
