import { expect, test, type Page } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'
import { empty, full } from './fixtures/s16/health'
import { assertHero, assertJackClear, assertNarrow, assertNoSideways, assertNoWrappedButtons, assertOrder, assertTargets, assertTextContrast, FIXED_CLOCKS, fullPageShot, setScheme, shotsLightDark } from './v13'

// v13 lane H: the Health overview (hero, Pinned, Family health, Browse, For you), the view-only member page and the six sub-screens.
// Signed in as the made-up member `me` (health-auth-mock); all data is invented. V13_SHOTS=<dir> also writes the 390x844 light and dark set (docs/redesign-2026-10-31/shots/health).

// The file name keeps it in the chromium project, but the signed-in mock needs the Supabase-env build the config serves on PW_PORT + 500.
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

test('overview: hero, Pinned, Family health, Browse, For you in that order, one hero near the top', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await expect(page.getByTestId('for-you')).toBeVisible()
  await assertHero(page)
  await assertOrder(page, ['bodyhero', 'glance', 'browse', 'for-you']) // Family health hides for a one-person roster; it is ordered below when present
  if (await page.getByTestId('family-health').count()) await assertOrder(page, ['glance', 'family-health', 'browse'])
  for (const k of ['readings', 'labs', 'meds', 'visits', 'move', 'body']) await expect(page.getByTestId(`browse-${k}`)).toBeVisible()
  await expect(page.getByTestId('foryou-video')).toHaveAttribute('href', '#discover/watch')
  await expect(page.getByTestId('nudge')).toBeVisible()
})

for (const [w, h] of [[390, 844], [360, 740]] as const) {
  test(`overview: 44 px targets and no sideways scroll at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await full(page, FIXED_CLOCKS[1])
    await expect(page.getByTestId('browse')).toBeVisible()
    await assertTargets(page)
    await assertNoSideways(page)
    await assertNoWrappedButtons(page)
  })
}

test('overview: no sideways scroll or small targets at 195 px (200% text zoom)', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await assertNarrow(page)
})

test('Me switcher opens the member page, which has no Take, Skip or Add; Back to me returns', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await page.locator('.ps-pill').click()
  await expect(page.getByRole('dialog', { name: 'Whose health' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Whose health' }).getByRole('button', { name: /Ma/ }).click()
  await expect(page).toHaveURL(/#health\/member\/ma$/)
  await expect(page.getByTestId('member-bar')).toContainText(/view only|you can log for them/) // the bar follows whether logging is shared
  await expect(page.getByRole('button', { name: /^(Take|Skip)\b/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^(Take|Skip)\b/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Reading|Add/ })).toHaveCount(0)
  await assertTargets(page)
  await page.getByRole('link', { name: 'Back to me' }).click()
  await expect(page).toHaveURL(/#health$/)
  await expect(page.getByTestId('bodyhero')).toBeVisible()
  await expect(page.locator('.ps-pill')).toContainText('Me')
})

test('sub-screens: Readings, Labs, Medicines, Visits, Move and food, Body wiki', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/readings', 'Readings')
  await expect(page.getByRole('group', { name: 'Period' })).toBeVisible() // segmented groups
  await expect(page.getByRole('group', { name: 'Time of day' })).toBeVisible()
  await expect(page.getByTestId('rd-hero')).toBeVisible() // chart with its band
  await assertHero(page)
  await at(page, '#health/labs', /Lab results|Labs/)
  await expect(page.getByTestId('labs-list')).toBeVisible()
  const zones = await page.locator('.lr-zones').first().evaluate((e) => e.textContent ?? '')
  expect(zones).toMatch(/Normal/)
  await expect(page.getByTestId('labs-list')).toContainText(/Above|Below|In range|Normal|Within/i) // a plain word, not colour alone
  await at(page, '#health/meds', 'Medicines')
  await at(page, '#health/visits', 'Visits')
  await expect(page.getByRole('link', { name: 'Plan a visit' })).toHaveAttribute('href', '#family/plan')
  await at(page, '#health/move', 'Move and food')
  await at(page, '#health/body', 'Body wiki')
  await expect(page.getByTestId('body-systems').getByRole('button')).not.toHaveCount(0) // system chips
})

test('Medicines with nobody added says so and offers the first step', async ({ page }) => {
  await empty(page, FIXED_CLOCKS[1])
  await at(page, '#health/meds', 'Medicines')
  await expect(page.getByText('No medicines yet').first()).toBeVisible()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`overview and sub-screens meet 4.5:1 contrast (${scheme})`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ colorScheme: scheme })
    await full(page, FIXED_CLOCKS[1])
    await setScheme(page, scheme)
    await expect(page.getByTestId('browse')).toBeVisible()
    await assertTextContrast(page)
    for (const hash of ['#health/readings', '#health/labs', '#health/meds', '#health/visits', '#health/move', '#health/body']) {
      await page.goto(`/${hash}`)
      await expect(page.locator('h1').first()).toBeVisible()
      await setScheme(page, scheme)
      await assertTextContrast(page)
    }
  })
}

test('reduced motion: the overview draws and nothing keeps animating', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await full(page, FIXED_CLOCKS[1])
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && (a.effect.getComputedTiming().iterations ?? 1) === Infinity).length)
  expect(running, 'infinite animations under reduce').toBe(0)
  await expect(page.getByTestId('for-you')).toBeVisible()
})

// ---- gaps lane H (2026-11-02): measured boxes, not pixels of page height ----
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!

test('H4: the hero is compact with two buttons in one row, and Pinned starts high', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  const hero = await box(page, '[data-hero]')
  expect(hero.height, 'hero height').toBeLessThanOrEqual(260)
  const btns = page.locator('[data-hero] .cd-act')
  expect(await btns.count()).toBe(2)
  const [a, b] = [(await btns.nth(0).boundingBox())!, (await btns.nth(1).boundingBox())!]
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2)
  expect(a.height).toBeGreaterThanOrEqual(44)
  expect(a.width).toBeGreaterThanOrEqual(140)
  await assertNoWrappedButtons(page)
  // the board keeps the "Needs attention" heading above the hero, so the tiles start at about 490, not 420
  expect((await box(page, '[data-testid=pinned]')).y).toBeLessThanOrEqual(500)
})

test('H5: the switcher pill is an avatar pill and the sheet rows are at least 56 tall', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  expect((await box(page, '.ps-pill')).height).toBeGreaterThanOrEqual(44)
  await page.locator('.ps-pill').click()
  const rows = page.getByRole('dialog', { name: 'Whose health' }).getByRole('listitem')
  expect(await rows.count()).toBeGreaterThan(1)
  for (let i = 0; i < await rows.count(); i++) expect((await rows.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(56)
})

// S10: the Metric page with a reading shows the "where the range comes from" source link; the empty-state sweep never reached it.
test('S10: the Metric source link is a 44 px target', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/metric/bp_systolic', /Blood pressure|Top number|Systolic/i)
  await expect(page.locator('#hv-src')).toBeVisible()
  await expect(page.locator('#hv-src ~ .grp a')).toBeVisible()
  await assertTargets(page)
})

test('S10: the Progress year arrows are 44 px', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/nudge', /progress/i)
  await expect(page.getByRole('button', { name: 'Previous year' })).toBeVisible()
  await expect(page.locator('.nu-cellbtn').first()).toBeEnabled() // today's open dose cells turn into buttons once the account is known: measure only after, so the check never races them
  await assertTargets(page)
})

test('S10: Pillbox dose buttons are 44 px wide at 360, 390 and 450, and each point of one is its own tap', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/nudge', /progress/i)
  const btns = page.locator('.nu-cellbtn')
  await expect(btns.first()).toBeEnabled()
  for (const w of [360, 390, 450]) {
    await page.setViewportSize({ width: w, height: 844 })
    for (let i = 0; i < await btns.count(); i++) {
      const r = await btns.nth(i).evaluate((el) => {
        el.scrollIntoView({ block: 'center' }) // elementFromPoint sees only what is in the viewport
        const b = el.getBoundingClientRect()
        const pts = [[b.left + 2, b.top + b.height / 2], [b.right - 2, b.top + b.height / 2], [b.left + b.width / 2, b.top + 2], [b.left + b.width / 2, b.bottom - 2]]
        return { w: b.width, h: b.height, own: pts.every(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.nu-cellbtn') === el) }
      })
      expect(r.w, `${w}px: button width`).toBeGreaterThanOrEqual(43.5)
      expect(r.h, `${w}px: button height`).toBeGreaterThanOrEqual(43.5)
      expect(r.own, `${w}px: edge points hit the button itself`).toBe(true)
    }
  }
})

test('H6: no chips on the sub-screens, the page says whose it is', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  for (const h of ['#health/readings', '#health/labs', '#health/meds', '#health/visits', '#health/metric/bp_systolic', '#health/nutrition', '#health/refill', '#health/summary', '#health/nudge', '#discover/learn/library']) {
    await page.goto(`/${h}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.getByTestId('person-chips')).toHaveCount(0)
    await expect(page.getByTestId('who-line')).toHaveText('Me')
  }
})

test('H7: Pinned has Edit; the sheet changes the tiles', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('dialog', { name: 'Pinned' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Medicines' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('pinned').locator('.pt')).toHaveCount(3)
})

test('H9: Browse rows are 56 to 64 tall and each has a second line', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  const rows = page.getByTestId('browse').locator('.rw')
  expect(await rows.count()).toBe(6)
  for (let i = 0; i < 6; i++) {
    const r = rows.nth(i)
    const h = (await r.boundingBox())!.height
    expect(h, `browse row ${i}`).toBeGreaterThanOrEqual(56)
    expect(h, `browse row ${i}`).toBeLessThanOrEqual(64)
    await expect(r.locator('.rw-sub')).toHaveCount(1)
  }
})

test('H10: For you is video, because of you, then the log row; the video card is wide and tall', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await assertOrder(page, ['foryou-video', 'foryou-because', 'foryou-log'])
  const v = await box(page, '[data-testid=foryou-video]')
  const scroller = await box(page, '.bt .scroll')
  expect(Math.abs(v.width - (scroller.width - 32))).toBeLessThanOrEqual(2)
  expect(v.height).toBeGreaterThanOrEqual(180)
})

test('H11: Readings sections are in the board order; the empty hero offers Add reading', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/readings', 'Readings')
  await expect(page.getByTestId('rd-tips')).toBeVisible()
  await assertOrder(page, ['rd-hero', 'rd-averages', 'rd-source', 'rd-last', 'rd-tips'])
  await expect(page.getByRole('heading', { name: 'Vitals' })).toHaveCount(0)
})

test('H11: with no reading the hero offers Add reading', async ({ page }) => {
  await empty(page, FIXED_CLOCKS[1])
  await at(page, '#health/readings', 'Readings')
  const add = page.getByTestId('rd-hero').getByRole('button', { name: 'Add reading' })
  const b = (await add.boundingBox())!
  expect(b.height).toBeGreaterThanOrEqual(44)
  expect(b.width).toBeGreaterThanOrEqual(140)
  await expect(page.getByTestId('rd-tips')).toBeVisible()
  await assertOrder(page, ['rd-hero', 'rd-averages', 'rd-source', 'rd-last', 'rd-tips'])
})

test('H12: Labs at 360 keep their buttons on one line and do not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/labs', /Labs/)
  await expect(page.getByTestId('lab-actions').first()).toBeVisible()
  await assertNoWrappedButtons(page)
  await assertNoSideways(page)
})

test('H13: empty Medicines holds both buttons inside the card', async ({ page }) => {
  await empty(page, FIXED_CLOCKS[1])
  await at(page, '#health/meds', 'Medicines')
  const card = await box(page, '[data-testid=meds-empty]')
  for (const name of ['Scan a prescription', 'Add by hand']) {
    const b = (await page.getByTestId('meds-empty').getByText(name).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.width).toBeGreaterThanOrEqual(140)
    expect(b.y + b.height).toBeLessThanOrEqual(card.y + card.height + 1)
  }
})

test('H14: Visits sections are in order', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/visits', 'Visits')
  await expect(page.getByTestId('vs-summary')).toBeVisible()
  await assertOrder(page, ['vs-hero', 'vs-bring', 'vs-questions', 'vs-asked', 'vs-summary'])
})

test('H15: Move and food is a short page with the Doctor OK row and a carousel', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/move', 'Move and food')
  await expect(page.getByTestId('doctor-ok')).toBeVisible()
  await expect(page.getByTestId('move-carousel')).toBeVisible()
  expect(await page.locator('.bt .scroll').evaluate((e) => e.scrollHeight)).toBeLessThan(2000)
  await expect(page.getByTestId('salt-card')).toBeVisible()
  await expect(page.getByTestId('water-card')).toBeVisible()
})

test('H17: the Body wiki figure is on the first screen; Jack stays clear', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/body', 'Body wiki')
  await assertHero(page)
  await assertJackClear(page)
})

test('Jack stays clear of controls on the Health root and its sub-screens', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await assertJackClear(page)
  for (const h of ['#health/readings', '#health/labs', '#health/meds', '#health/visits', '#health/move']) {
    await at(page, h, /./)
    await assertJackClear(page)
  }
})

test('S8: no lower-case full names in visible text on the Health screens', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  for (const h of ['#health', '#health/readings', '#health/labs', '#health/meds', '#health/visits']) {
    await page.goto(`/${h}`)
    await expect(page.locator('h1').first()).toBeVisible()
    const bad = await page.evaluate(() => {
      const out: string[] = []
      const w = document.createTreeWalker(document.querySelector('.bt')!, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) { const t = (n.textContent ?? '').trim(); if (/^[a-z]+ [a-z]+$/.test(t) && t !== 'latest reading') out.push(t) /* a section label that appears once the numbers load, not a name */ }
      return out
    })
    expect(bad, h).toEqual([])
  }
})

test('shots (V13_SHOTS)', async ({ page }) => {
  test.skip(!process.env.V13_SHOTS, 'evidence only, set V13_SHOTS=<dir>')
  test.setTimeout(240_000)
  await full(page, FIXED_CLOCKS[1])
  await page.mouse.move(0, 0)
  await shotsLightDark(page, 'health')
  for (const [name, hash] of [['readings', '#health/readings'], ['labs', '#health/labs'], ['meds', '#health/meds'], ['visits', '#health/visits'], ['move', '#health/move'], ['body', '#health/body'], ['member', '#health/member/ma']] as const) {
    await page.goto(`/${hash}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await page.waitForTimeout(400)
    await shotsLightDark(page, name)
  }
})

// ---- visual lane VH (2026-11-02): each `wrong` item measured so it cannot silently return ----
test('VH readings: the chart dot, its axis and the headline are one value', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/readings', 'Readings')
  const m = await page.getByTestId('metric-chart').evaluate((svg) => {
    const lines = [...svg.querySelectorAll('line.mc-grid')].map((l) => Number(l.getAttribute('y1')))
    const labels = [...svg.querySelectorAll('text.mc-t')].map((t) => Number(t.textContent))
    const dots = [...svg.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cy')))
    const k = (labels[0]! - labels[1]!) / (lines[0]! - lines[1]!)
    return { labels, values: dots.map((cy) => labels[0]! + (cy - lines[0]!) * k), days: svg.querySelectorAll('text.mc-d').length }
  })
  const head = Number((await page.getByTestId('rd-latest').textContent())!.split('/')[0])
  expect(m.values[m.values.length - 1]!).toBeCloseTo(head, 0)
  expect(Math.max(...m.labels)).toBeGreaterThanOrEqual(Math.max(...m.values) - 2)
  expect(Math.min(...m.labels)).toBeLessThanOrEqual(Math.min(...m.values) + 2)
  expect(m.days).toBe(7)
})

test('VH labs: the result number is large, the 4 and 5.6 labels sit under the zone words (board order: bar, zone words, numbers)', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/labs', /Labs/)
  const size = await page.locator('.lr-card .lr-val').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
  expect(size).toBeGreaterThanOrEqual(36)
  const tick = (await box(page, '.lr-tick'))
  const zones = (await box(page, '.lr-zones'))
  expect(tick.y, 'tick label top vs zone strip bottom').toBeGreaterThanOrEqual(zones.y + zones.height - 1)
  const sw = await box(page, '.lb-sw')
  const seg = await box(page, '[role=group][aria-label="Filter results"]')
  expect(sw.y - (seg.y + seg.height), 'gap between the filter and Show previous').toBeGreaterThanOrEqual(8)
})

test('VH move: ring holds the number, Stop if and the 911 line sit on the cards, Doctor OK is below the moves', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  await at(page, '#health/move', 'Move and food')
  const ring = await box(page, '.mv-ring')
  expect(ring.width).toBeGreaterThanOrEqual(100)
  await expect(page.locator('.mv-ring-n b')).toHaveText(/^\d+$/)
  await expect(page.getByTestId('move-911')).toHaveText('Chest pain that does not stop: call 911.')
  expect(await page.locator('.mv-ccard .mv-stopif').count()).toBeGreaterThanOrEqual(3)
  await expect(page.locator('.mv-ccard .mv-stopif').first()).toContainText('Stop if')
  await assertOrder(page, ['move-carousel', 'move-911', 'doctor-ok'])
})

test('VH sub-screens: the Me line sits right under the title (no 50 px gap)', async ({ page }) => {
  await full(page, FIXED_CLOCKS[1])
  for (const h of ['#health/readings', '#health/labs', '#health/meds', '#health/visits']) {
    await at(page, h, /./)
    const t = await box(page, 'h1')
    const w = await box(page, '[data-testid=who-line]')
    expect(w.y - (t.y + t.height), h).toBeLessThanOrEqual(28)
    const first = await box(page, '[data-testid=who-line] ~ *')
    expect(first.y - (w.y + w.height), `${h} first card`).toBeLessThanOrEqual(40)
  }
})

// Final gaps: full-page 390 shots of Readings and Labs (V13_SHOTS=<dir>), and no "0 kg" on them.
for (const scheme of ['light', 'dark'] as const) {
  for (const [name, hash, h1] of [['readings', '#health/readings', 'Readings'], ['labs', '#health/labs', /Labs/]] as const) {
    test(`final ${name} ${scheme}: no "0 kg", full page shot`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' }) // the count-up reads 0 under the frozen test clock
      await full(page, FIXED_CLOCKS[1])
      await at(page, hash, h1)
      await setScheme(page, scheme)
      await page.waitForTimeout(500)
      expect(await page.locator('main').innerText()).not.toMatch(/(^|\s)0\s+kg\b/)
      if (process.env.V13_SHOTS) await fullPageShot(page, `${process.env.V13_SHOTS}/${name}-${scheme}.png`)
    })
  }
}

declare const process: { env: Record<string, string | undefined> }
