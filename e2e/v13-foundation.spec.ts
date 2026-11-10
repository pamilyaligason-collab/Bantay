import { expect, test } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { seed } from './fixtures/s16/today'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { assertHero, assertJackClear, assertJackHit, FAMILY_ALLOW, type JackAllow, FIXED_CLOCKS, assertNarrow, assertNoSideways, assertTargets, assertTextContrast, outsideWarning, setScheme, settled, shotsLightDark } from './v13'

// v13 Phase 0 foundation: the shell and the four tab roots Phase 0 touched, light and dark at 390x844, then the 195 px narrow check.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  await stubWindy(page)
  const now = new Date(FIXED_CLOCKS[1])
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now, temp: 28, humidity: 55, feels: 30, code: 63, hourlyProb: () => 10 }) }))
})

// Known until a Phase 1 lane lands (listed in TESTING.md): the root test is fixme, never deleted.
const KNOWN: Record<string, string> = {
}

for (const root of ['today', 'health', 'safety', 'me']) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`#${root} ${scheme}: targets, contrast, no sideways scroll, Jack clear at the end`, async ({ page }) => {
      test.fixme(!!KNOWN[root], KNOWN[root])
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(`/#${root}`)
      await expect(page.locator('h1').first()).toBeVisible()
      await setScheme(page, scheme)
      if (root === 'today') await assertHero(page)
      await assertTargets(page)
      await assertTextContrast(page)
      await assertNoSideways(page)
      await assertJackClear(page, { at: 'end' }) // at rest: the "no control under Jack at rest" tests below
    })
  }

  test(`#${root}: holds at 195 px`, async ({ page }) => {
    await page.goto(`/#${root}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await assertNarrow(page)
  })

  test(`#${root}: shots light and dark (only with V13_SHOTS=<dir>)`, async ({ page }) => {
    await page.goto(`/#${root}`)
    await expect(page.locator('h1').first()).toBeVisible()
    if (root === 'today') await expect(page.getByTestId('weather-hero')).not.toContainText('Finding your weather') // the first position has settled
    await shotsLightDark(page, root)
  })
}

test('the tab bar is 64 px tall and every tab is a 44 px target', async ({ page }) => {
  await page.goto('/#today')
  const bar = (await page.getByTestId('tabbar').boundingBox())!
  expect(Math.round(bar.height)).toBe(64)
  for (const t of ['today', 'health', 'discover', 'family', 'safety']) {
    const box = (await page.getByTestId(`tab-${t}`).boundingBox())!
    expect(box.height, `tab-${t}`).toBeGreaterThanOrEqual(44)
    expect(box.width, `tab-${t}`).toBeGreaterThanOrEqual(44)
  }
})

// ---- Gaps batch 1, lane G0 (S1 S2 S3 S4 S5 S6 S9 S10 S11 T12 X7) ----
const ROOTS = ['today', 'health', 'discover', 'family', 'safety'] as const

// S3 / S11: no control under Jack at scroll 0. Roots and sub-screens that still fail name the lane that fixes them; the fixme goes when that lane lands.
// D-122: with no Activity data the card hugs its line, so a People row (`.rw-main`) may sit under Jack at scroll 0 depending on the viewport height (rows are under him at 450x950, 925, 900 and 844, clear at about 997). Every other control must still clear him.
// S24: Family's Together list is a 2x2 grid of whole-card tiles (a.fm-tile, board S24Family); they and the rows keep the named FAMILY_ALLOW whole-card allowance, hit-tested (more than half stays tappable)
// D-135 Discover (Today view): the whole-card links (hero card, video cards, Learn cards, recipe card) may lose part of their box to Jack, hit-tested by assertJackHit (more than half stays tappable, measured 4 to 10 %); every small control still has no allowance.
const DISCOVER_CARDS: JackAllow[] = [{ name: 'Video link card', sel: 'a.md' }, { name: 'Video button card', sel: 'button.md' }, { name: 'Learn card', sel: 'a.dc-lc' }, { name: 'Recipe card', sel: 'a.dc-rcard-t' }]
// S24: Listen stacks the listen shelf and the Calm guided video above the read-aloud rows; the opened big player poster may lose part of its box to Jack (more than half stays tappable). The media cards have no allowance: they may not touch Jack at rest.
const LISTEN_POSTERS: JackAllow[] = [{ name: 'Video poster', sel: '.dc-bigrow button.lv-play' }]
const jackRest = (page: import('@playwright/test').Page, route: string) => route === '#discover' ? assertJackHit(page, DISCOVER_CARDS, 'discover at rest') : route === '#discover/listen' ? assertJackHit(page, LISTEN_POSTERS, 'listen at rest') : route === '#family' ? assertJackHit(page, FAMILY_ALLOW, 'family at rest') : assertJackClear(page, { at: 'rest' })
const JACK_REST_KNOWN: Record<string, string> = {
}
for (const route of [...ROOTS.map((r) => `#${r}`), '#discover/listen', '#discover/play', '#discover/news', '#medid', '#safety/sources']) {
  test(`${route}: no control under Jack at rest`, async ({ page }) => {
    test.fixme(!!JACK_REST_KNOWN[route], JACK_REST_KNOWN[route])
    await page.goto(`/${route}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await jackRest(page, route)
  })
}
// 360 px, one test per root: a root named in JACK_REST_KNOWN is a fixme naming its lane, every other root is really asserted (390 is the route tests above).
for (const r of ROOTS) {
  test(`#${r}: Jack clears controls at rest at 360 px`, async ({ page }) => {
    test.fixme(!!JACK_REST_KNOWN[`#${r}`], JACK_REST_KNOWN[`#${r}`])
    await page.setViewportSize({ width: 360, height: 844 })
    await page.goto(`/#${r}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await jackRest(page, `#${r}`)
  })
}

// S10: every tap target >= 44 px on every root and the eight named sub-routes; owners fix their own and remove the fixme.
const TARGETS_KNOWN: Record<string, string> = {}
for (const route of [...ROOTS.map((r) => `#${r}`), '#safety/cards', '#safety/sources', '#medid', '#discover/play/wordsearch', '#discover/play/facts', '#health/metric/bp_systolic', '#health/nudge', '#discover/learn/recipes']) {
  test(`${route}: every tap target is 44 px`, async ({ page }) => {
    test.fixme(!!TARGETS_KNOWN[route], TARGETS_KNOWN[route])
    await page.goto(`/${route}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await settled(page)
    // the word search grid is 8 columns across 360 px: its letter cells cannot reach 44 (on the owner's differences list); every other control there still must
    await assertTargets(page)
  })
}

// S10: the Facts Licence and Wikipedia links only draw once the On this day events arrive; the sweep above only saw "Loading".
test('#discover/play/facts with an On this day event: Licence and Open on Wikipedia are 44 px', async ({ page }) => {
  await page.route('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ events: [{ year: 1881, text: 'An invented event.', pages: [{ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Example' } } }] }] }) }))
  await page.goto('/#discover/play/facts')
  await expect(page.getByRole('link', { name: 'Licence' })).toBeVisible()
  await settled(page)
  await assertTargets(page)
})

// S6: a link styled as a button has no underline.
for (const route of ['#safety/firstaid/cpr', '#health/metric/bp_systolic', ...ROOTS.map((r) => `#${r}`)]) {
  test(`${route}: a.btn, a.btn2 and a.pill are not underlined`, async ({ page }) => {
    await page.goto(`/${route}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await settled(page)
    const bad = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('a.btn, a.btn2, a.pill')).filter((a) => a.getBoundingClientRect().width > 0 && getComputedStyle(a).textDecorationLine !== 'none').map((a) => (a.textContent ?? '').trim().slice(0, 30)))
    expect(bad, 'underlined button-links').toEqual([])
  })
}

// outsideWarning drops a row inside a warning or SOS block and keeps a plain one (the selectors are the app's real ones).
test('outsideWarning excludes a warning row and keeps a plain row', async ({ page }) => {
  await page.setContent('<div class="td-alertband"><a class="rw-main" id="w1">w</a></div><div data-testid="warning-card"><a class="rw-main" id="w2">w</a></div><section class="fm-storm"><a class="rw-main" id="w3">w</a></section><div data-testid="storm-block"><a class="rw-main" id="w4">w</a></div><a class="rw-main" id="plain">p</a>')
  expect(await page.locator(outsideWarning('.rw-main')).evaluateAll((els) => els.map((e) => e.id))).toEqual(['plain'])
})

// T12: the first tile of a carousel sits on the 16 px page gutter (12 px at 195). D-135: Today's Your numbers is a 2-column grid, not a carousel, so Today is measured on that grid's first tile; the carousel is measured on Move and food.
for (const [width, gutter, scheme] of [[390, 16, 'light'], [390, 16, 'dark'], [360, 16, 'light'], [195, 12, 'light']] as const) {
  test(`carousel gutter at ${width} px ${scheme}: first tile at x ${gutter}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    for (const route of ['#today', '#health/move']) { // #family is in v13-g0.auth.spec.ts (needs sign-in)
      await page.goto(`/${route}`)
      await expect(page.locator('h1').first()).toBeVisible()
      await setScheme(page, scheme)
      await settled(page)
      const lefts = () => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.carousel, [data-testid="move-carousel"], [role=group][aria-label="Your numbers"]')).map((c) => ({ scroll: c.scrollLeft, left: (c.firstElementChild as HTMLElement).getBoundingClientRect().left })))
      expect((await lefts()).length, `${route} has a carousel`).toBeGreaterThan(0)
      // the reveal tween moves a tile by a pixel or two on arrival: wait until the measured edge settles on the gutter
      await expect.poll(async () => (await lefts()).every((l) => Math.abs(l.left - gutter) <= 1), { message: `${route}: first tile left edge settles on ${gutter}` }).toBe(true)
      expect((await lefts()).map((l) => l.scroll), 'no carousel starts scrolled').toEqual((await lefts()).map(() => 0))
    }
  })
}

// S1: a glass band the height of the status bar inset stays over the top; the title starts under it.
for (const [route, scheme] of [['#health', 'light'], ['#health', 'dark'], ['#safety/warnings', 'light'], ['#safety/warnings', 'dark']] as const) {
  test(`${route} ${scheme}: status band over a 47 px inset`, async ({ page }) => {
    await page.goto(`/${route}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await setScheme(page, scheme)
    await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-inset-top', '47px'))
    await settled(page)
    const band = await page.evaluate(() => {
      const bt = document.querySelector('.bt')!; const b = getComputedStyle(bt, '::before')
      const sc = document.querySelector('.bt .scroll') as HTMLElement; sc.scrollTop = 0
      return { h: b.height, pos: b.position, z: b.zIndex, bg: b.backgroundColor, ptr: b.pointerEvents, h1: document.querySelector('h1')!.getBoundingClientRect().top, box: bt.getBoundingClientRect().top }
    })
    expect(band.h).toBe('47px'); expect(band.pos).toBe('absolute'); expect(band.z).toBe('7'); expect(band.ptr).toBe('none')
    expect(band.bg, 'glass fill, not clear').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    expect(band.h1 - band.box, 'the title starts below the band').toBeGreaterThanOrEqual(47)
  })
}

// S2: the strip under the tab bar is covered; nothing interactive sits in it at the end of the scroll.
for (const [route, scheme] of [['#today', 'light'], ['#today', 'dark'], ['#health', 'light'], ['#health', 'dark'], ['#weather', 'light'], ['#weather', 'dark']] as const) {
  test(`${route} ${scheme}: bottom strip is covered and empty at scroll end`, async ({ page }) => {
    await page.goto(`/${route}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await setScheme(page, scheme)
    await settled(page)
    const r = await page.evaluate(async () => {
      const sc = document.querySelector('.bt .scroll') as HTMLElement
      for (let i = 0; i < 3; i++) { sc.scrollTop = sc.scrollHeight; await new Promise((x) => requestAnimationFrame(() => x(null))) }
      const bt = document.querySelector('.bt')!; const a = getComputedStyle(bt, '::after'); const bar = document.querySelector('[data-testid="tabbar"]')!
      const barBottom = bar.getBoundingClientRect().bottom; const edge = bt.getBoundingClientRect().bottom
      const inStrip = Array.from(sc.querySelectorAll<HTMLElement>('a[href], button, input, [role=button]')).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > barBottom && b.top < edge })
      return { h: parseFloat(a.height), z: a.zIndex, barZ: getComputedStyle(bar).zIndex, bg: a.backgroundImage, strip: inStrip.map((e) => (e.textContent ?? '').trim().slice(0, 30)) }
    })
    expect(r.strip, 'controls in the strip under the bar').toEqual([])
    expect(r.h).toBeCloseTo(90, 0) // 64 bar + 14 gap + 0 safe area + 12
    expect(Number(r.z)).toBeLessThan(Number(r.barZ)); expect(r.bg).toContain('linear-gradient')
  })
}

// S2 in Simple mode: there is no tab bar, so no fade is drawn over the last item.
test('#today in Simple mode: the bottom fade is hidden with the tab bar', async ({ page }) => {
  await page.goto('/#today')
  await expect(page.locator('h1').first()).toBeVisible()
  await expect(page.locator('.bt[data-simple]')).toHaveCount(0)
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.bt')!, '::after').display), 'normal mode draws the fade').toBe('block')
  await seed(page, 'bantay', 'kv', [{ key: 'mode.simple', value: true }])
  await page.reload()
  await expect(page.locator('.bt[data-simple]')).toHaveCount(1)
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.bt')!, '::after').display)).toBe('none')
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="tabbar"]')!).display)).toBe('none')
})

// S5: the old top bar is gone from every tab root; the title row holds the bell and the avatar (44 px each); Admin is not a key here.
const LAST_FIX = { lat: 9.65, lon: 123.85 } // Tagbilaran area, an invented stored fix
async function titleRow(page: import('@playwright/test').Page) {
  await expect(page.locator('h1.lt-title').first()).toBeVisible()
  await settled(page)
  return page.evaluate(() => {
    const sc = document.querySelector('.bt .scroll') as HTMLElement
    const row = document.querySelector('header.lt .lt-row') as HTMLElement
    const chip = document.querySelector('header.lt .zp .sf-chip') as HTMLElement | null
    const box = (id: string) => { const b = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect(); return b ? [Math.round(b.width), Math.round(b.height)] : null }
    return {
      t: document.querySelector('h1.lt-title')!.getBoundingClientRect().top - sc.getBoundingClientRect().top,
      rowH: row.getBoundingClientRect().height, rowOverflow: row.scrollWidth - row.clientWidth, docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      chipH: chip ? chip.getBoundingClientRect().height : null, chipText: chip?.innerText ?? null,
      bell: box('head-bell'), me: box('head-me'), admin: !!document.querySelector('a[aria-label="Admin"]')
    }
  })
}
// S5: the old top bar is gone from every tab root; the title row holds the bell and the avatar (44 px each); Admin is not a key here.
for (const width of [390, 360]) {
  test(`tab roots at ${width} px: no top bar, title starts near the top, bell and avatar are 44 px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    for (const r of ROOTS) {
      await page.goto(`/#${r}`)
      await expect(page.locator('.sh-top, .topbar')).toHaveCount(0)
      const m = await titleRow(page)
      expect(m.t, `${r}: first h1.lt-title top`).toBeLessThanOrEqual(70)
      expect(m.bell, `${r}: bell`).toEqual([44, 44]); expect(m.me, `${r}: avatar`).toEqual([44, 44]); expect(m.admin).toBe(false)
    }
  })
}
// S5 with the long chip strings: "<zone> · your home area" (no fix ever) and "<area> · last known, 3 h ago" (stale fix); one line, title <= 70 at 390 and 360, no overflow down to 320.
for (const [name, withFix] of [['home area', false], ['last known', true]] as const) {
  for (const width of [390, 360, 320]) {
    test(`Safety title row with the "${name}" chip at ${width} px stays one line`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/#safety')
      await expect(page.locator('h1.lt-title').first()).toBeVisible()
      if (withFix) {
        await seed(page, 'bantay', 'kv', [{ key: 'loc.last', value: { ...LAST_FIX, at: new Date(FIXED_CLOCKS[1]).getTime() - 3 * 3_600_000 } }])
        await page.reload()
      }
      await expect.poll(async () => (await titleRow(page)).chipText, { message: 'the chip shows its words' }).toMatch(withFix ? /last known/ : /your home area/)
      const m = await titleRow(page)
      expect(m.chipH, 'chip is at most three lines (64 px) at 320; one or two lines wider').toBeLessThanOrEqual(64) // S28: long-form ages ("3 hours ago") and barangay names make the words longer
      expect(m.rowH, 'title row stays one line').toBeLessThanOrEqual(56)
      expect(m.rowOverflow, 'row does not overflow sideways').toBeLessThanOrEqual(0)
      expect(m.docOverflow, 'page does not overflow sideways').toBeLessThanOrEqual(0)
      if (width >= 360) expect(m.t, 'h1.lt-title top').toBeLessThanOrEqual(70)
    })
  }
}
test('the bell opens the inbox and the avatar opens Me', async ({ page }) => {
  await page.goto('/#health')
  await page.getByTestId('head-bell').click(); await expect(page).toHaveURL(/#notif$/)
  await page.goto('/#safety'); await page.getByTestId('head-me').click(); await expect(page).toHaveURL(/#me$/)
})

// S4 / X7: one place wording; no home-zone frame before the first fix.
const DAVAO_NAME = 'Barangay 29-C, Davao City'
const DAVAO = { latitude: 7.0731, longitude: 125.6128 } // an invented reading inside the Davao area
test.describe('place words', () => {
  test.use({ permissions: ['geolocation'], geolocation: DAVAO })
  test('Today kicker, Safety chip and World chip say the same place and never "Near you"', async ({ page }) => {
    await page.goto('/#today')
    const kicker = page.getByTestId('weather-hero').locator('.sc-kicker')
    await expect(kicker).toContainText(DAVAO_NAME) // the offline pack answers a moment after the area name
    const hero = (await kicker.innerText()).split(' · as of')[0]!.trim()
    await page.goto('/#safety')
    const chip = page.locator('.sf-chip').first()
    await expect(chip).toHaveText(DAVAO_NAME) // D-181: the offline OSM pack names the barangay and city, the same words on every screen
    await page.goto('/#safety/world')
    await expect(page.locator('.sf-chip').first()).toHaveText(DAVAO_NAME)
    expect([hero, await chip.innerText()]).toEqual([DAVAO_NAME, DAVAO_NAME])
    expect([hero, ...(await page.locator('.sf-chip').allInnerTexts())].join('|')).not.toContain('Near you')
  })
  test('the Safety chip never names a home zone before the GPS area arrives', async ({ page }) => {
    for (const delay of [0, 1000]) {
      await page.addInitScript((ms) => {
        const g = navigator.geolocation; const real = g.getCurrentPosition.bind(g)
        g.getCurrentPosition = (ok, no, o) => { setTimeout(() => real(ok, no, o), ms) }
        const seen: string[] = ((window as unknown as { __chips: string[] }).__chips = [])
        setInterval(() => { const c = document.querySelector('.sf-chip'); if (c) seen.push((c as HTMLElement).innerText) }, 20)
      }, delay)
      await page.goto('/#safety')
      await expect(page.locator('.sf-chip').first()).toHaveText(DAVAO_NAME)
      const seen = await page.evaluate(() => (window as unknown as { __chips: string[] }).__chips)
      expect(seen.filter((x) => x !== DAVAO_NAME && x !== 'Davao' && x !== 'where you are'), `delay ${delay}: chip frames that are not the area or "where you are"`).toEqual([])
    }
  })
  test('the hero never shows a home zone before the GPS area arrives', async ({ page }) => {
    await page.addInitScript(() => {
      const g = navigator.geolocation; const real = g.getCurrentPosition.bind(g)
      g.getCurrentPosition = (ok, no, o) => { setTimeout(() => real(ok, no, o), 800) } // the fix arrives late
      const seen: string[] = ((window as unknown as { __seen: string[] }).__seen = [])
      setInterval(() => { const h = document.querySelector('[data-testid="weather-hero"]'); if (h) seen.push((h as HTMLElement).innerText) }, 25)
    })
    await page.goto('/#today')
    await expect(page.getByTestId('weather-hero').locator('.sc-kicker')).toContainText('Davao')
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)
    expect(seen.some((s) => /Finding your weather/.test(s)), 'a skeleton frame came first').toBe(true)
    expect(seen.filter((s) => /Dampas|Conel|home area|Tagbilaran|General Santos/.test(s)), 'frames that name a home zone').toEqual([])
  })
})

test('#discover: shots light and dark (only with V13_SHOTS=<dir>)', async ({ page }) => {
  await page.goto('/#discover')
  await expect(page.locator('h1').first()).toBeVisible()
  await shotsLightDark(page, 'discover')
})
