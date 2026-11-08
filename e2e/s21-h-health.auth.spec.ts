import { expect, test, type Page } from '@playwright/test'
import { mock } from './health-auth-mock'
import { seed } from './fixtures/s16/health'
import { skipOnboarding } from './helpers'
import { assertNoSideways, setScheme, settled } from './v13'

declare const process: { env: Record<string, string | undefined> }

// Session 21 lane H: the Needs attention bar (a short "You" under the mark, inside the card at any value and width) and Pinned as a 2 x 2 grid.
// Frozen clock, made-up data. Shots go to S21_SHOTS (default test-results/s21), never into the repo.
const SHOTS = process.env.S21_SHOTS ?? 'test-results/s21'
const NOW = new Date(2026, 9, 26, 10, 20, 0)
test.use({ reducedMotion: 'reduce' })

type Row = { test: string; value: number; unit: string; ago: number; extra?: Record<string, unknown> }
const SUGAR = (value: number): Row[] => [{ test: 'fasting_glucose', value, unit: 'mg/dL', ago: 2 }] // the guide is 70 to 99, so the bar spans 55.5 to 113.5 and the lead card is this row
const DOCTOR = 'Dr. Alexandria Montgomery-Villanueva'
const med = (name: string, times: string[]) => ({ clientId: `c-${name}`, serverId: `s-${name}`, personId: 'me', name, medStatus: 'active', status: 'confirmed', schedule: { v: 1, times } })

async function open(page: Page, width: number, rows: Row[], opts: { height?: number; visit?: string; scheme?: 'light' | 'dark'; hash?: string; meds?: boolean } = {}) {
  await page.setViewportSize({ width, height: opts.height ?? (width >= 390 ? Math.round(width * 2.17) : 780) })
  await page.clock.setFixedTime(NOW)
  await skipOnboarding(page)
  await mock(page)
  await page.goto('/#health')
  await expect(page.locator('h1')).toHaveText('Health')
  const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
  await seed(page, 'bantay-health', { people: [{ id: 'me', name: 'Rey' }], readings: rows.map((r) => ({ personId: 'me', takenAt: ago(r.ago), test: r.test, value: r.value, unit: r.unit, ...r.extra })) })
  if (opts.visit) await seed(page, 'bantay-visits', { appointments: [{ clientId: 'a1', personId: 'me', startsAt: new Date(NOW.getTime() + 3 * 86_400_000).toISOString(), purpose: opts.visit, provider: DOCTOR, facility: 'Sample Heart and Kidney Clinic', apptStatus: 'planned' }] })
  if (opts.meds) await seed(page, 'bantay-log', { medications: [med('Sampletan', ['08:00']), med('Examplemin', ['08:00', '20:00']), med('Mockodipine', ['08:00'])] })
  await page.reload()
  await expect(page.getByTestId('bodyhero')).toBeVisible()
  await expect(page.getByTestId('pinned').locator('.pt').first()).toBeVisible()
  await expect(page.getByTestId('tk-meds').locator('.tk-s')).toHaveText(/\S/) // blank until the medicines have loaded (Medicines is on the Today row, not in Pinned)
  if (opts.scheme) await setScheme(page, opts.scheme)
  if (opts.hash) { await page.goto(`/${opts.hash}`); if (opts.scheme) await setScheme(page, opts.scheme) }
  await settled(page)
}

// ---- item 4: the label follows the mark, driven in the real bar with hand-computed spots ----
// Sugar guide 70 to 99: margin each side = (99 - 70) / 2 = 14.5, so the track is 55.5 to 113.5 (span 58).
//   99 (the guide's top, still in range): (99 - 55.5) / 58 = 75 %.   84.5 (mid-range): (84.5 - 55.5) / 58 = 50 %.
//   50 (below the low end) and 198 (twice the high end) are off the track: the mark sits at the arrow, 3 % and 97 %.
const CASES = [
  { name: 'at the guide top', value: 99, pct: 75, pos: 'within' },
  { name: 'in range', value: 84.5, pct: 50, pos: 'within' },
  { name: 'below the low end', value: 50, pct: 3, pos: 'below' },
  { name: 'twice the high end', value: 198, pct: 97, pos: 'above' }
] as const

for (const width of [195, 360, 390, 450]) {
  for (const c of CASES) {
    test(`You label hangs under the mark ${c.name} at ${width} px`, async ({ page }) => {
      await open(page, width, SUGAR(c.value))
      await expect(page.locator('.ah-val')).toContainText(String(c.value)) // the row shown is the sugar row, not another lab
      await expect(page.locator('.ah .lr-you')).toHaveClass(new RegExp(c.pos))
      await expect(page.locator('.ah .lr-you b')).toHaveText('You')
      // every box in one read, so a late layout shift cannot put them out of step
      const m = await page.evaluate(() => {
        const box = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
        return { card: box('.ah-card'), track: box('.ah .lr-track'), dot: box('.ah .lr-you'), label: box('.ah .lr-you b'), zones: box('.ah .lr-zones') }
      })
      const cx = m.dot.x + m.dot.width / 2
      expect(Math.abs(cx - (m.track.x + (c.pct / 100) * m.track.width)), `mark at ${c.pct} % of the bar`).toBeLessThanOrEqual(1)
      // the label hangs by the share of its own width the mark has travelled: its left edge = mark centre - pct x label width
      expect(Math.abs(m.label.x - (cx - (c.pct / 100) * m.label.width)), 'label left edge').toBeLessThanOrEqual(1.5)
      expect(m.label.x, 'label left').toBeGreaterThanOrEqual(m.card.x)
      expect(m.label.x + m.label.width, 'label right').toBeLessThanOrEqual(m.card.x + m.card.width)
      expect(m.label.y, 'label under the bar').toBeGreaterThanOrEqual(m.track.y + m.track.height)
      expect(m.label.y + m.label.height, 'label clear of the zone words').toBeLessThanOrEqual(m.zones.y + 0.5)
      expect(m.track.height).toBeLessThanOrEqual(8)
      expect(m.dot.width).toBeLessThanOrEqual(16)
      await assertNoSideways(page)
      if (width === 390 || width === 450) await page.screenshot({ path: `${SHOTS}/H/hero-${width}-${c.pct}-light.png`, animations: 'disabled' })
    })
  }
}

test('Hero at 195 px: both button labels fit their buttons, one above the other, and the range line is whole', async ({ page }) => {
  await open(page, 195, SUGAR(198))
  const m = await page.evaluate(() => {
    const foot = document.querySelector('.ah-foot')!
    return { foot: foot.scrollHeight - foot.clientHeight, btns: Array.from(document.querySelectorAll('.ah .cd-act')).map((b) => { const r = b.getBoundingClientRect(); return { y: r.y, h: r.height, over: b.scrollWidth - b.clientWidth } }) }
  })
  expect(m.btns.length).toBe(2)
  for (const b of m.btns) { expect(b.over, 'label wider than its button').toBeLessThanOrEqual(0); expect(b.h).toBeGreaterThanOrEqual(44) }
  expect(m.btns[1]!.y).toBeGreaterThanOrEqual(m.btns[0]!.y + m.btns[0]!.h)
  expect(m.foot, 'range line clipped').toBeLessThanOrEqual(0)
  await expect(page.locator('.ah-foot')).toContainText('70 to 99')
  await page.locator('.ah-card').screenshot({ path: `${SHOTS}/H/hero-195.png`, animations: 'disabled' })
})

// ---- item 5 and 7: marker colour and zone contrast, light and dark, with shots ----
const lum = (c: number[]) => { const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(c[0]! / 255) + 0.7152 * f(c[1]! / 255) + 0.0722 * f(c[2]! / 255) }
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
// Chrome resolves color-mix to rgb() or color(srgb r g b); read both. A gradient prints each colour once per stop, so a repeat of the colour before it (one zone's two stops) counts once; the gaps are transparent and dropped.
const colours = (s: string) => Array.from(s.matchAll(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g)).map((m) => {
  if (m[1]) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 } }
  const p = m[2]!.split(/[ /]+/).filter(Boolean).map(Number)
  return { rgb: p.slice(0, 3).map((v) => v * 255), a: p[3] ?? 1 }
}).filter((c) => c.a > 0).map((c) => c.rgb).filter((c, i, all) => i === 0 || c.join() !== all[i - 1]!.join())

for (const scheme of ['light', 'dark'] as const) {
  for (const c of CASES.filter((x) => x.name !== 'at the guide top')) {
    test(`bar zones and mark meet contrast, ${c.name}, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await open(page, 390, SUGAR(c.value), { scheme })
      const m = await page.evaluate(() => {
        const css = (sel: string, prop: string) => getComputedStyle(document.querySelector(sel)!).getPropertyValue(prop)
        return { track: css('.ah .lr-track', 'background-image'), mark: css('.ah .lr-you', 'background-color'), card: css('.ah-card', 'background-color'), label: css('.ah .lr-you b', 'color') }
      })
      const zone = colours(m.track) // low, normal, high
      expect(zone.length, `three zone colours in ${m.track}`).toBe(3)
      const [mark] = colours(m.mark)
      const [card] = colours(m.card)
      const [label] = colours(m.label)
      const mine = zone[c.pos === 'below' ? 0 : c.pos === 'above' ? 2 : 1]!
      const n = { markVsCard: ratio(mark!, card!), markVsZone: ratio(mark!, mine), labelVsCard: ratio(label!, card!), zonesVsCard: zone.map((z) => +ratio(z, card!).toFixed(2)) }
      console.log(`CONTRAST ${c.name} ${scheme}: mark/card ${n.markVsCard.toFixed(2)}, mark/own zone ${n.markVsZone.toFixed(2)}, You text/card ${n.labelVsCard.toFixed(2)}, zones (low, normal, high)/card ${n.zonesVsCard.join(', ')}`)
      expect(n.markVsCard, 'mark against the card (3:1 for a graphic)').toBeGreaterThanOrEqual(3)
      expect(n.markVsZone, 'mark against the zone it sits on').toBeGreaterThanOrEqual(3)
      expect(n.labelVsCard, 'You text against the card (4.5:1)').toBeGreaterThanOrEqual(4.5)
      // zones against the card stay under 3:1 on purpose: the strip is aria-hidden and the words carry the meaning (printed above, reported at the merge)
      for (const w of [390, 450]) {
        await page.setViewportSize({ width: w, height: Math.round(w * 2.17) })
        await page.screenshot({ path: `${SHOTS}/H/hero-${w}-${c.pct}-${scheme}.png`, animations: 'disabled' })
      }
    })
  }
}

// Each case is its own test, so each starts on an empty database and the lead card really is the row seeded here.
// Light: --red #B42318 = 180, 35, 24; --warn #8A4B06 = 138, 75, 6; in range = 80 % --ok #1E6B4E + 20 % --ink #1C1B19 = 29.6, 91, 67.4.
for (const c of [{ name: 'High', value: 198, mark: [180, 35, 24] }, { name: 'Low', value: 50, mark: [138, 75, 6] }, { name: 'in range', value: 84.5, mark: [29.6, 91, 67.4] }]) {
  test(`the mark colour when ${c.name}`, async ({ page }) => {
    await open(page, 390, SUGAR(c.value), { scheme: 'light' })
    await expect(page.locator('.ah-val')).toContainText(String(c.value))
    const [got] = colours(await page.locator('.ah .lr-you').evaluate((e) => getComputedStyle(e).backgroundColor))
    c.mark.forEach((v, i) => expect(Math.abs(got![i]! - v), `channel ${i} of ${got}`).toBeLessThanOrEqual(1))
  })
}

// Board: a High chip is --tint-red with --tint-red-ink. Light #FBE7E4 / #B42318, dark #3A1A17 / #F08A80.
for (const [scheme, bg, ink] of [['light', 'rgb(251, 231, 228)', 'rgb(180, 35, 24)'], ['dark', 'rgb(58, 26, 23)', 'rgb(240, 138, 128)']] as const) {
  test(`the High chip takes the board's red tint and ink (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, 390, SUGAR(198), { scheme })
    const chip = page.locator('.ah .lr-verdict.above')
    await expect(chip).toHaveCSS('background-color', bg)
    await expect(chip).toHaveCSS('color', ink)
  })
}

// ---- Pinned ----
const BP_AND_SUGAR: Row[] = [{ test: 'bp_systolic', value: 124, unit: 'mmHg', ago: 0.05 }, { test: 'bp_diastolic', value: 79, unit: 'mmHg', ago: 0.05 }, { test: 'fasting_glucose', value: 104, unit: 'mg/dL', ago: 2 }]

for (const width of [195, 360, 390, 450]) {
  test(`Pinned grid at ${width} px: no sideways scroll, equal tile heights per row`, async ({ page }) => {
    await open(page, width, BP_AND_SUGAR)
    await expect(page.getByTestId('pinned').locator('.pt')).toHaveCount(2) // S24: the inline row is always two tiles (no Edit)
    const tiles = await page.locator('[data-testid="pinned"] .pt').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), h: Math.round(b.height), r: Math.round(b.right) } }))
    expect(tiles.length).toBe(2)
    for (const t of tiles) expect(t.r).toBeLessThanOrEqual(width)
    for (const row of new Set(tiles.map((t) => t.y))) expect(new Set(tiles.filter((t) => t.y === row).map((t) => t.h)).size).toBe(1)
    if (width === 195) expect(new Set(tiles.map((t) => t.x)).size).toBe(1)
    else expect(new Set(tiles.map((t) => t.x)).size).toBe(2)
    await assertNoSideways(page)
    if (width === 390 || width === 450) {
      await page.getByTestId('glance').evaluate((el) => el.scrollIntoView({ block: 'start' }))
      for (const scheme of ['light', 'dark'] as const) {
        await setScheme(page, scheme)
        await page.screenshot({ path: `${SHOTS}/H/pinned-${width}-${scheme}.png`, animations: 'disabled' })
      }
    }
  })
}

// Every leaf text inside each tile stays inside that tile and is not clipped sideways.
const outOfTile = (page: Page) => page.locator('[data-testid="pinned"] .pt').evaluateAll((els) => els.flatMap((e) => {
  const t = e.getBoundingClientRect()
  return Array.from(e.querySelectorAll<HTMLElement>('*')).filter((n) => n.children.length === 0 && n.textContent?.trim()).filter((n) => { const b = n.getBoundingClientRect(); return b.right > t.right + 0.5 || b.left < t.left - 0.5 || b.bottom > t.bottom + 0.5 || n.scrollWidth > n.clientWidth + 1 }).map((n) => `${n.className}: ${n.textContent}`)
}))

test('Pinned at 195 px: a long visit title wraps inside the tile, nothing runs out of the card or the page', async ({ page }) => {
  const long = 'Follow-up on the blood pressure, kidney and cholesterol results with the whole family list'
  await open(page, 195, BP_AND_SUGAR, { visit: long })
  const tile = page.getByTestId('glance-visit')
  await expect(tile).toContainText(long) // the whole visit title is shown, not cut off
  expect(await outOfTile(page), 'text running out of its tile').toEqual([])
  await assertNoSideways(page)
  await tile.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: `${SHOTS}/H/pinned-long-195.png`, animations: 'disabled' })
})

test('Pinned at 195 px: the long dose line stays inside the Medicines tile', async ({ page }) => {
  await open(page, 195, BP_AND_SUGAR, { meds: true })
  // three medicines: 1 + 2 + 1 = 4 doses today, none taken
  await expect(page.getByTestId('browse-meds')).toContainText('4 of 4 left today') // Medicines is on Browse; Pinned inline leaves it out
  expect(await outOfTile(page), 'text running out of its tile').toEqual([])
  await assertNoSideways(page)
  await page.getByTestId('browse-meds').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/H/pinned-dose-195.png`, animations: 'disabled' })
})

// ---- Labs list and Lab detail keep the lean bar ----
// --red: light #B42318, dark #F08A80
for (const [scheme, red] of [['light', 'rgb(180, 35, 24)'], ['dark', 'rgb(240, 138, 128)']] as const) {
  test(`Labs list and Lab detail: lean bar, label inside the card, red mark when High (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    const ldl: Row[] = [{ test: 'ldl', value: 162, unit: 'mg/dL', ago: 2 }, { test: 'ldl', value: 171, unit: 'mg/dL', ago: 80 }]
    await open(page, 390, ldl, { scheme, hash: '#health/labs' })
    await expect(page.getByTestId('labs-list')).toBeVisible()
    const inList = await page.evaluate(() => {
      const box = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.x, width: r.width, height: r.height } }
      return { card: box('.lr-box'), label: box('.lr-box .lr-you b'), track: box('.lr-box .lr-track') }
    })
    expect(inList.label.x).toBeGreaterThanOrEqual(inList.card.x)
    expect(inList.label.x + inList.label.width).toBeLessThanOrEqual(inList.card.x + inList.card.width)
    expect(inList.track.height).toBeLessThanOrEqual(8)
    await expect(page.locator('.lr-box .lr-you.above').first()).toHaveCSS('background-color', red)
    await page.locator('.lr-box').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/H/labs-390-${scheme}.png`, animations: 'disabled' })
    await page.setViewportSize({ width: 450, height: 949 })
    await page.screenshot({ path: `${SHOTS}/H/labs-450-${scheme}.png`, animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 846 })
    // Lab detail
    await page.goto('/#health/metric/ldl')
    await setScheme(page, scheme)
    const top = page.getByTestId('lab-top')
    await expect(top).toBeVisible()
    await settled(page)
    const inTop = await top.evaluate((t) => {
      const box = (e: Element) => { const r = e.getBoundingClientRect(); return { x: r.x, width: r.width, height: r.height } }
      return { card: box(t), label: box(t.querySelector('.lr-you b')!), track: box(t.querySelector('.lr-track')!) }
    })
    expect(inTop.label.x).toBeGreaterThanOrEqual(inTop.card.x)
    expect(inTop.label.x + inTop.label.width).toBeLessThanOrEqual(inTop.card.x + inTop.card.width)
    await expect(top.locator('.lr-you')).toHaveClass(/above/)
    await expect(top.locator('.lr-you')).toHaveCSS('background-color', red)
    expect(inTop.track.height).toBeLessThanOrEqual(8)
    await assertNoSideways(page)
    await page.screenshot({ path: `${SHOTS}/H/labdetail-390-${scheme}.png`, animations: 'disabled' })
    await page.setViewportSize({ width: 450, height: 949 })
    await page.screenshot({ path: `${SHOTS}/H/labdetail-450-${scheme}.png`, animations: 'disabled' })
    await page.setViewportSize({ width: 195, height: 780 })
    await assertNoSideways(page)
  })
}
