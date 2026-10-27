import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'

// Session 13 lane T (Today): dose done-morph, first-week My week, More heading, weather cards. Auth project (test Supabase env, PostgREST mocked, invented data).
// The clock is frozen at Tue 2026-10-20 10:00 Manila and animations are off in screenshots, so a rerun rewrites no PNG (ML-32).
// Shots go to docs/session-13/shots/T/ (light and dark).
const SHOTS = 'docs/session-13/shots/T'
const NOW = new Date('2026-10-20T10:00:00+08:00')
type Row = Record<string, unknown>

test.use({ timezoneId: 'Asia/Manila', viewport: { width: 390, height: 844 } })

async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await page.evaluate(async ([name, st, list]) => { // wait until the app's own Dexie made the store (ML-25)
    for (let i = 0; i < 100; i++) {
      const ok = await new Promise<boolean>((res, rej) => {
        const open = indexedDB.open(name as string)
        open.onupgradeneeded = () => { open.transaction?.abort() }
        open.onerror = () => res(false)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(st as string)) { db.close(); res(false); return }
          const tx = db.transaction(st as string, 'readwrite')
          for (const r of list as Row[]) tx.objectStore(st as string).put(r)
          tx.oncomplete = () => { db.close(); res(true) }
          tx.onerror = () => { db.close(); rej(tx.error) }
        }
      })
      if (ok) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`store ${st as string} never appeared in ${name as string}`)
  }, [dbName, store, rows] as const)
}

async function start(page: Page, scheme: 'light' | 'dark', o: { code?: number; dose?: boolean; since?: string; reduced?: boolean } = {}) {
  await page.clock.setFixedTime(NOW)
  await skipOnboarding(page)
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Lloyd' }])))
  await mock(page)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: openMeteoFixture({ now: NOW, temp: 31, humidity: 60, feels: 33, code: o.code ?? 0, hourlyProb: () => 10 }) }))
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await page.goto('/')
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
  if (o.dose) await seed(page, 'bantay-log', 'medications', [{ clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', dose: '50 mg', schedule: { v: 1, times: ['09:45'] }, startedOn: '2026-10-01', medStatus: 'active' }])
  if (o.since) await seed(page, 'bantay', 'kv', [{ key: 'today.myweek.since', value: o.since }])
  if (o.dose || o.since) await page.reload() // raw IndexedDB writes do not notify live queries
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Meals today' })).toBeVisible() // appears once sign-in finished: wait so a rerun draws the same page (ML-25, ML-32)
}
const shot = (page: Page, name: string, scheme: string) => page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png`, animations: 'disabled' })

for (const scheme of ['light', 'dark'] as const) {
  test(`dose card: Taken morphs in place, then the card collapses ${scheme}`, async ({ page }) => {
    await start(page, scheme, { dose: true })
    const card = page.locator('.td-next')
    await expect(card.getByRole('heading', { name: /Losartan/ })).toBeVisible()
    await shot(page, 'dose-before', scheme)
    await page.getByRole('button', { name: 'Taken', exact: true }).click()
    const done = page.getByRole('button', { name: /^Taken \d{1,2}:\d{2}/ })
    await expect(done).toBeVisible()
    await expect(card).not.toHaveClass(/leaving/) // the morph holds first, the collapse comes after
    await shot(page, 'dose-after', scheme)
    await expect(card).toHaveCount(0, { timeout: 3000 }) // collapsed and freed
    await page.waitForTimeout(100)
    await shot(page, 'dose-gone', scheme)
  })

  test(`reduced motion: no height collapse, a 150 ms cross-fade only ${scheme}`, async ({ page }) => {
    await start(page, scheme, { dose: true, reduced: true })
    await page.evaluate(() => { // the fade is only 150 ms: record the card's style the moment it starts leaving
      const w = window as unknown as { __leave?: { rows: string; dur: string } }
      new MutationObserver(() => {
        const e = document.querySelector('.td-next.leaving')
        if (e && !w.__leave) { const c = getComputedStyle(e); w.__leave = { rows: c.gridTemplateRows, dur: c.transitionDuration } }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] })
    })
    await page.getByRole('button', { name: 'Taken', exact: true }).click()
    await expect(page.locator('.td-next')).toHaveCount(0, { timeout: 3000 })
    const leave = await page.evaluate(() => (window as unknown as { __leave?: { rows: string; dur: string } }).__leave)
    expect(leave?.dur).toBe('0.15s')
    expect(leave?.rows).not.toBe('0px') // 1fr stays: no height animation, opacity only
  })

  test(`today full: first-week My week empty state, More heading ${scheme}`, async ({ page }) => {
    await start(page, scheme)
    await shot(page, 'today-full', scheme)
    await expect(page.getByRole('heading', { name: 'My week' })).toBeVisible()
    await expect(page.getByText('Your week will show here')).toBeVisible()
    await page.getByRole('heading', { name: 'My week' }).scrollIntoViewIfNeeded()
    await shot(page, 'today-myweek-empty', scheme)
    const more = page.getByRole('heading', { name: 'More', exact: true })
    if (await more.count()) { await more.scrollIntoViewIfNeeded(); await shot(page, 'today-more', scheme) }
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true)
  })

  test(`after the first week an empty My week draws nothing ${scheme}`, async ({ page }) => {
    await start(page, scheme, { since: '2026-10-01' })
    await expect(page.getByText('Your week will show here')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'My week' })).toHaveCount(0)
  })

  for (const [name, code] of [['clear', 0], ['storm', 95]] as const) {
    test(`weather card ${name} ${scheme}`, async ({ page }) => {
      await start(page, scheme, { code })
      const wx = page.getByRole('region', { name: 'Weather' })
      await expect(wx).toBeVisible()
      await wx.screenshot({ path: `${SHOTS}/weather-${name}-${scheme}.png`, animations: 'disabled' })
    })
  }

  test(`weather card compact with a dose due ${scheme}`, async ({ page }) => {
    await start(page, scheme, { dose: true, code: 0 })
    const wx = page.getByRole('region', { name: 'Weather' })
    await expect(wx).toBeVisible()
    await wx.screenshot({ path: `${SHOTS}/weather-compact-${scheme}.png`, animations: 'disabled' })
  })
}
