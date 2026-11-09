import { expect, test, type Page } from '@playwright/test'
import { seed, startToday, type Variant } from './fixtures/s16/today'

declare const process: { env: Record<string, string | undefined> }

// R11: the signed-in build loads global CSS after the feature CSS, so `.card` can beat a feature class that sets the same property.
// This moves every top-level `.card` rule to the front of its sheet (the plain build's order) and fails when any card with a second class
// changes background, padding, radius or shadow. Run on the auth project, it is the check the plain build cannot give.
const SHOTS = process.env.R11_SHOTS
test.use({ timezoneId: 'Asia/Manila' })

const orderDiffs = async (page: Page, min = 1) => { const r = await orderScan(page); expect(r.n, 'no card with a second class rendered: the check would pass on nothing').toBeGreaterThanOrEqual(min); return r.diffs }
const orderScan = (page: Page) => page.evaluate(() => {
  const props = ['backgroundColor', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopLeftRadius', 'boxShadow'] as const
  const els = [...document.querySelectorAll<HTMLElement>('.card')].filter((e) => e.classList.length > 1 && e.getClientRects().length > 0)
  const read = () => els.map((e) => { const c = getComputedStyle(e); return props.map((p) => c[p]) })
  const before = read()
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i] as CSSStyleRule
      if (r.selectorText === '.card') { const t = r.cssText; sheet.deleteRule(i); sheet.insertRule(t, 0) }
    }
  }
  const after = read()
  const out: string[] = []
  els.forEach((e, i) => props.forEach((p, j) => { if (before[i]![j] !== after[i]![j]) out.push(`${e.className.replace(/\s+/g, '.')} ${p}: signed-in ${before[i]![j]} vs plain order ${after[i]![j]}`) }))
  return { n: els.length, diffs: [...new Set(out)] }
})

/** Settled: a card is on screen, fonts are in and two frames have passed (no fixed sleep). */
const settle = async (page: Page, ready = '.card') => {
  await expect(page.locator(ready).first()).toBeVisible()
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) })
}

const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled', mask: [page.locator('nav.tabbar')] }) }

const states: [string, Variant, { dose?: boolean; notice?: boolean }][] = [['calm', 'calm', { dose: true, notice: true }], ['quake', 'quake', {}], ['alertsOff', 'alertsOff', {}], ['storm', 'storm', {}]]
for (const [name, variant, opts] of states) {
  test(`signed-in cards keep their own look: Today ${name}`, async ({ page }) => {
    await startToday(page, variant, { ...opts, scheme: 'light' })
    await shot(page, `today-${name}-light`)
    if (name === 'calm') { await page.getByTestId('calm').scrollIntoViewIfNeeded(); await shot(page, 'today-calm-card-light') }
    expect(await orderDiffs(page)).toEqual([])
  })
}

for (const route of ['#discover', '#discover/learn', '#health', '#health/meds', '#family', '#safety', '#weather', '#calm']) {
  test(`signed-in cards keep their own look: ${route}`, async ({ page }) => {
    await startToday(page, 'calm', { dose: true, scheme: 'light' })
    await page.goto(`/${route}`)
    const rowsOnly = route === '#health/meds' // the medicine list is rows, not multi-class cards (md-paused is visited below)
    await settle(page, rowsOnly ? '.md' : '.card')
    await shot(page, `route-${route.replace(/[#/]/g, '-')}-light`)
    expect(await orderDiffs(page, rowsOnly ? 0 : 1)).toEqual([])
  })
}

for (const w of [360, 195]) {
  test(`signed-in Hotlines at ${w} px`, async ({ page }) => {
    await startToday(page, "calm", { scheme: "light" })
    await page.setViewportSize({ width: w, height: 844 })
    await page.goto("/#safety/dial")
    await expect(page.locator('[data-testid^="dial-"]').first()).toBeVisible()
    await shot(page, `hotlines-${w}-light`)
    expect(await orderDiffs(page, 0)).toEqual([]) // dial rows are not multi-class cards
    const em = page.getByText('Houston consulate: emergency')
    await em.scrollIntoViewIfNeeded()
    await expect(page.getByText('Houston consulate: main line')).toBeVisible() // the two rows read differently
    await shot(page, `hotlines-houston-${w}-light`)
  })
}

// The classes the plain routes above do not reach: each needs its own seeded state or route, and the test fails when the card is not on screen.
// md-check ("N medicines to check", MedsToCheckCard) is NOT visited: it has no caller in src today (exported from MedReview.tsx, used nowhere), so it never renders in the app.
const FAR_QUAKE = { id: 'q2', kind: 'quake', level: 'Magnitude 4.2', title: 'Earthquake', what: 'Magnitude 4.2, far north.', where: 'Off Sample Province', when: 'Just now', doNow: 'Nothing to do.', source: 'PHIVOLCS', sourceUrl: null, issuedAt: new Date('2026-10-20T10:00:00+08:00').toISOString(), lat: 18.5, lon: 121.0, bulletin: 'b', checkedAt: new Date('2026-10-20T10:00:00+08:00').toISOString() }
const PAUSED = { clientId: 'c-paused', serverId: 's-paused', personId: 'me', name: 'Samplemed', dose: '10 mg', schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-10-01', medStatus: 'paused' }

test('signed-in cards keep their own look: Today with a far, small quake (td-arow)', async ({ page }) => {
  await startToday(page, 'calm', { scheme: 'light', alert: FAR_QUAKE })
  await expect(page.locator('.card.td-arow')).toBeVisible()
  await settle(page)
  await shot(page, 'today-arow-light')
  expect(await orderDiffs(page)).toEqual([])
})

test('signed-in cards keep their own look: Today with a family SOS notice (al-row)', async ({ page }) => {
  await startToday(page, 'calm', { scheme: 'light', notice: 'sos' })
  await expect(page.locator('.card.al-row')).toBeVisible()
  await settle(page)
  await shot(page, 'today-alrow-light')
  expect(await orderDiffs(page)).toEqual([])
})

test('signed-in cards keep their own look: a paused medicine (md-paused)', async ({ page }) => {
  await startToday(page, 'calm', { scheme: 'light' })
  await seed(page, 'bantay-log', 'medications', [PAUSED])
  await page.goto('/#health/med/c-paused')
  await page.reload()
  await expect(page.locator('.card.md-paused')).toBeVisible()
  await settle(page)
  await shot(page, 'med-paused-light')
  expect(await orderDiffs(page)).toEqual([])
})

test('signed-in cards keep their own look: a Learn topic with video cards', async ({ page }) => {
  await startToday(page, 'calm', { scheme: 'light' })
  await page.goto('/#discover/learn/prepping')
  await expect(page.getByTestId('ready-videos').locator('button.md').first()).toBeVisible()
  await settle(page)
  await shot(page, 'learn-prepping-light')
  expect(await orderDiffs(page)).toEqual([])
})

// R12-TDNU-NARROW: a late dose's actions must not run into Jack's column at rest on the signed-in build.
for (const [w, h] of [[360, 800], [390, 844]] as const) {
  test(`signed-in late dose at ${w}x${h}: actions clear of Jack`, async ({ page }) => {
    await startToday(page, 'calm', { dose: true, scheme: 'light' })
    await page.setViewportSize({ width: w, height: h })
    await page.reload()
    await expect(page.locator('.td-next')).toBeVisible()
    await settle(page)
    const m = await page.evaluate(() => {
      ;(document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0
      const fab = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
      const acts = [...document.querySelectorAll('.td-nu-acts button, .td-nu-acts a')].map((b) => { const r = b.getBoundingClientRect(); return { t: (b.textContent ?? '').trim(), l: r.left, r: r.right, top: r.top, bottom: r.bottom } })
      return { fab: { l: fab.left, r: fab.right, top: fab.top, bottom: fab.bottom }, acts }
    })
    await shot(page, `dose-actions-${w}x${h}`)
    expect(m.acts.length, 'dose actions rendered').toBeGreaterThan(0)
    for (const a of m.acts) {
      const hit = a.l < m.fab.r && a.r > m.fab.l && a.top < m.fab.bottom && a.bottom > m.fab.top
      expect(hit, `${a.t} ${a.l}-${a.r} x ${a.top}-${a.bottom} vs Jack ${JSON.stringify(m.fab)}`).toBe(false)
    }
  })
}

// R12-AC-COLLISION: two cards share .ac. The signed-in AlertCard keeps 16 px all round; the Family Activity card keeps its own 14 14 12.
test('signed-in .ac cards: AlertCard 16 px, Family Activity 14 14 12', async ({ page }) => {
  await startToday(page, 'quake', { scheme: 'light' })
  await settle(page) // the quake card is on Today
  const pad = (sel: string) => page.locator(sel).first().evaluate((e) => { const c = getComputedStyle(e); return [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].join(' ') })
  await expect(page.locator('.card.ac[data-tone]').first()).toBeVisible()
  expect(await pad('.card.ac[data-tone]')).toBe('16px 16px 16px 16px')
  await shot(page, 'alertcard-light')
  await page.goto('/#family')
  await settle(page, '[data-testid="activity"] .card.ac')
  expect(await pad('[data-testid="activity"] .card.ac')).toBe('14px 14px 12px 14px')
})

// R13-ALERT-ACTION: .card.ac must stay a flex column, or the action ("What to do" / "See details") shrinks to a left pill with tight spacing.
for (const scheme of ['light', 'dark'] as const) {
  test(`signed-in AlertCard action is full width with a gap, ${scheme}`, async ({ page }) => {
    await startToday(page, 'quake', { scheme })
    await settle(page)
    await expect(page.locator('.card.ac[data-tone] .cd-act').first()).toBeVisible()
    const m = await page.locator('.card.ac[data-tone]').first().evaluate((card) => {
      const c = getComputedStyle(card), a = card.querySelector('.cd-act')!.getBoundingClientRect(), r = card.getBoundingClientRect()
      return { display: c.display, dir: c.flexDirection, gap: c.rowGap, cardW: r.width, actW: a.width, left: a.left - r.left }
    })
    await shot(page, `alertcard-action-${scheme}`)
    expect(m.actW, JSON.stringify(m)).toBeCloseTo(m.cardW - 32, 0)
    expect(m.left).toBeCloseTo(16, 0)
    expect(m.display).toBe('flex'); expect(m.dir).toBe('column'); expect(m.gap).toBe('10px')
  })
}
