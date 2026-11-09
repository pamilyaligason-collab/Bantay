import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { skipOnboarding } from './helpers'
import { assertNoSideways, assertTargets, assertTextContrast, setScheme } from './v13'
import { shotPath } from './shotPath'

// Lane CB: the Alerts inbox built to docs/redesign-2026-10-31/mockup/AlertsInbox.dc.html (empty, unread first visit, all seen, row opened). Invented rows only.
declare const process: { env: Record<string, string | undefined> }
const DIR = shotPath('docs/redesign-2026-10-31/shots/comply-CB')
mkdirSync(DIR, { recursive: true })
type Row = Record<string, unknown>

async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await page.evaluate(async ([name, st, list]) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open(name as string)
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction(st as string, 'readwrite')
        for (const r of list as Row[]) tx.objectStore(st as string).put(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows] as const)
}
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
const alertRow = (id: string, kind: string, template: string, minAgo: number, extra: Row = {}) => ({ id, personId: 'p1', kind, template, ref: id, createdAt: ago(minAgo), pushedAt: null, seenAt: null, expiresAt: inDays(7), ...extra })
const FRESH = [alertRow('a1', 'dose_missed', 'dose_missed', 70, { ref: 'm1:2026-10-26:09:00' }), alertRow('a2', 'hazard', 'storm_warning', 130), alertRow('a3', 'mood_unwell', 'mood_unwell', 200)]
const SEEN = [alertRow('a4', 'digest', 'digest', 24 * 60 + 30, { seenAt: ago(24 * 60) }), alertRow('a5', 'review_open', 'review_open', 26 * 60, { seenAt: ago(25 * 60) })]

async function open(page: Page, scheme: 'light' | 'dark', w: number, rows: Row[], introSeen: boolean) {
  await skipOnboarding(page)
  await page.setViewportSize({ width: w, height: 844 })
  await page.goto('/#today')
  await expect(page.locator('h1').first()).toBeVisible()
  if (rows.length) await seed(page, 'bantay-alerts', 'alerts', rows)
  await seed(page, 'bantay', 'kv', [{ key: 'notif.intro', value: introSeen }])
  await setScheme(page, scheme)
  await page.goto('/#notif')
  await page.reload()
  await setScheme(page, scheme)
  await expect(page.getByRole('heading', { name: 'Alerts', exact: true })).toBeVisible()
}
async function full(page: Page, name: string) {
  const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? 844)
  const w = page.viewportSize()!.width
  await page.setViewportSize({ width: w, height: Math.min(h + 140, 4000) })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DIR}/${name}.png`, animations: 'disabled' })
  await page.setViewportSize({ width: w, height: 844 })
}
const geometry = (page: Page) => page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('[data-testid="inbox-row"]'))
  const q = (s: string) => document.querySelector(s) as HTMLElement | null
  return {
    rowH: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
    chip: Array.from(document.querySelectorAll('[data-testid="inbox-row"] .rw-ic')).map((c) => Math.round(c.getBoundingClientRect().width)),
    radius: q('[data-testid="inbox-row"]')?.closest('.grp') ? getComputedStyle(q('[data-testid="inbox-row"]')!.closest('.grp') as HTMLElement).borderRadius : '',
    h: q('.lt-title') ? parseFloat(getComputedStyle(q('.lt-title')!).fontSize) : 0,
    weights: [Array.from(document.querySelectorAll('[data-testid="inbox-new"] .rw-title')).map((e) => getComputedStyle(e).fontWeight), Array.from(document.querySelectorAll('[data-testid="inbox-earlier"] .rw-title')).map((e) => getComputedStyle(e).fontWeight)],
    dupTime: rows.filter((r) => { const v = r.querySelector('.rw-value')?.textContent ?? ''; return v !== '' && (r.querySelector('.rw-sub')?.textContent ?? '').includes(v) }).length,
    sec: Array.from(document.querySelectorAll('.in-h')).map((e) => ({ t: e.textContent, size: parseFloat(getComputedStyle(e).fontSize), upper: getComputedStyle(e).textTransform }))
  }
})

for (const scheme of ['light', 'dark'] as const) {
  for (const w of [390, 360]) {
    test(`unread, first visit (${scheme} ${w})`, async ({ page }) => {
      await open(page, scheme, w, [...FRESH, ...SEEN], false)
      await expect(page.getByRole('heading', { name: 'New (3)' })).toBeVisible()
      await expect(page.getByRole('note').getByText('Missed doses, storms and SOS from your family appear in this list.')).toBeVisible() // the full intro card on the first visit
      const g = await geometry(page)
      expect(g.rowH.length).toBe(5)
      for (const h of g.rowH) expect(h).toBeGreaterThanOrEqual(56) // board: 56 px rows
      for (const c of g.chip) expect(c).toBe(32)
      expect(g.radius).toBe('16px')
      expect(g.weights[0]!.every((x) => x === '700')).toBe(true) // board: unread titles bold, seen titles regular
      expect(g.weights[1]!.every((x) => x === '600')).toBe(true) // S28 tokens (L0): .rw-title is 600 for every row
      expect(g.dupTime).toBe(0) // the time is on the right once, not also in the sub line
      expect(g.h).toBe(34)
      expect(g.sec.map((s) => s.upper)).toEqual(['uppercase', 'uppercase']) // board: 13 px caps section labels
      expect(g.sec.every((s) => s.size === 13)).toBe(true)
      await assertTargets(page); await assertTextContrast(page); await assertNoSideways(page)
      await full(page, `inbox-unread-${scheme}-${w}`)
    })
  }
  test(`empty (${scheme})`, async ({ page }) => {
    await open(page, scheme, 390, [], false)
    await expect(page.getByText('No alerts yet')).toBeVisible()
    await assertTargets(page); await assertTextContrast(page)
    await full(page, `inbox-empty-${scheme}-390`)
  })
  test(`all seen (${scheme})`, async ({ page }) => {
    await open(page, scheme, 390, SEEN, true)
    await expect(page.getByTestId('inbox-new')).toHaveCount(0)
    await expect(page.locator('.in-info1')).toBeVisible() // later visits: the intro is one line
    await assertTargets(page); await assertTextContrast(page)
    await full(page, `inbox-seen-${scheme}-390`)
  })
  test(`row opened (${scheme})`, async ({ page }) => {
    await open(page, scheme, 390, FRESH, true)
    await page.getByTestId('inbox-new').getByRole('button', { name: /storm|Storm/ }).first().click()
    await expect(page.getByTestId('alert-sheet')).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeInViewport()
    const widths = await page.getByTestId('alert-sheet').locator('.in-act').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
    expect(widths.length).toBeGreaterThanOrEqual(2)
    for (const wd of widths) expect(wd).toBeGreaterThanOrEqual(350) // board: full-width actions, one per line
    await assertTargets(page)
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${DIR}/inbox-sheet-${scheme}-390.png`, animations: 'disabled' })
  })
}
