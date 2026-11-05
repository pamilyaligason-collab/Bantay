import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { skipOnboarding } from './helpers'
import { mock } from './health-auth-mock'
import { full as healthFull } from './fixtures/s16/health'
import { startToday, seed as seedToday } from './fixtures/s16/today'
import { admin } from './fixtures/s16/settings'
import { openFamily } from './fixtures/v13/family'
import { emptyNeeds } from './fixtures/s16/family'
import { assertJackClear, assertNoSideways, assertTextContrast, FIXED_CLOCKS, outsideWarning, setScheme } from './v13'
import { shotPath } from './shotPath'

declare const process: { env: Record<string, string | undefined> }

// Lane CL (comply round): the gaps that had no evidence (T2, T15, W12, S10, S6) and the re-shoots after the count-up settles. Invented data only.
// Shots go to shots/comply-CL only with DOC_SHOTS=1 (shotPath). The signed-in mock needs the Supabase-env build (PW_PORT + 500), as comply-ch does.
const SHOTS = shotPath('docs/redesign-2026-10-31/shots/comply-CL')
const AUTH_URL = `http://localhost:${Number(process.env.PW_PORT ?? 4317) + 500}`
const DAY = '2026-10-26T10:00:00+08:00'
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

/** Nothing on the page still changes: the scroller's text is the same on three reads 150 ms apart (count-ups, late cards). */
async function stable(page: Page) {
  let prev = '', same = 0
  for (let i = 0; i < 60 && same < 3; i++) {
    const t = await page.evaluate(() => document.querySelector('.bt .scroll')?.textContent ?? '')
    same = t === prev ? same + 1 : 0
    prev = t
    await page.waitForTimeout(150)
  }
  await page.evaluate(() => document.fonts.ready)
}

/** The whole scroller in one shot at the current width. */
async function shoot(page: Page, name: string, fixed = false) {
  await stable(page)
  if (fixed) { // Family shots are taken at the real 844 phone, never a stretched page: the first screen is what the owner sees (D-124: no Activity floor any more)
    await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement | null; if (s) s.scrollTop = 0 })
    await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' })
    return
  }
  await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement | null; if (s) s.scrollTop = 0 })
  const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? 844)
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(h + 20, 844), 5000) })
  await stable(page) // tiles that were below the fold start their count-up only now (IntersectionObserver): wait for it
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' })
  await page.setViewportSize(vp)
}

/** Every visible link, button or input in `.bt` under 44 px, with its size. */
const small = (page: Page) => page.evaluate(() => {
  const out: string[] = []
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.bt a[href], .bt button, .bt input:not([type=hidden]), .bt [role=button]'))) {
    if (el.closest('[aria-hidden="true"], [inert]')) continue
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
    if (r.width <= 1 || r.height <= 1 || s.visibility === 'hidden' || s.display === 'none') continue
    if (r.width < 43.5 || r.height < 43.5) out.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)}`)
  }
  return out
})

const SCHEMES = ['light', 'dark'] as const
const WIDTHS = [390, 360] as const

// ---------------------------------------------------------------- signed out build
test.describe('plain build', () => {
  for (const w of WIDTHS) {
    test(`W12 Safety Hotlines ${w}: grouped rows as the Safety board, one Call per row`, async ({ page }) => {
      await page.clock.setFixedTime(DAY)
      await skipOnboarding(page)
      await page.setViewportSize({ width: w, height: 844 })
      await page.goto('/#safety/dial')
      await expect(page.locator('h1').first()).toBeVisible()
      await expect(page.locator('[data-testid^="dial-"]').first()).toBeVisible()
      for (const s of SCHEMES) {
        await setScheme(page, s)
        await shoot(page, `hotlines-${s}-${w}`)
      }
      const m = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="dial-"]'))
        const lines = (e: Element) => { const l = parseFloat(getComputedStyle(e).lineHeight) || 22; return Math.round(e.getBoundingClientRect().height / l) }
        return {
          n: rows.length,
          h: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
          title: rows.map((r) => ({ px: parseFloat(getComputedStyle(r.querySelector('.rw-title, b') ?? r).fontSize), lines: lines(r.querySelector('.rw-title, b') ?? r) })),
          calls: rows.map((r) => r.querySelectorAll('a.sf-callbtn').length),
          tagsRepeat: Array.from(document.querySelectorAll('.sf section')).flatMap((sec) => { const t = Array.from(sec.querySelectorAll('.sf-kind-h')).map((e) => e.textContent ?? ''); return t.filter((x, i) => t.indexOf(x) !== i) }),
          cut: rows.filter((r) => { const t = r.querySelector('.rw-title') as HTMLElement; return t.scrollHeight > t.clientHeight + 1 }).map((r) => r.textContent?.slice(0, 40) ?? ''),
          grp: Array.from(document.querySelectorAll('.sf .grp')).map((e) => getComputedStyle(e).borderRadius)
        }
      })
      console.log('CL-W12', w, JSON.stringify(m))
      expect(m.n).toBeGreaterThan(5)
      expect(Math.min(...m.h), 'board .row min-height 56').toBeGreaterThanOrEqual(56)
      expect(Math.max(...m.title.map((t) => t.lines)), 'name: 3 lines at most').toBeLessThanOrEqual(3)
      expect(await page.locator('.sf-kind .rw-title').first().evaluate((e) => getComputedStyle(e).webkitLineClamp), 'name clamp: 3 lines').toBe('3')
      expect(m.calls.every((c) => c === 1), 'one Call or Open per row').toBe(true)
      expect(m.tagsRepeat, 'a group tag is never repeated inside one set').toEqual([])
      console.log('CL-W12-CUT', w, m.cut.length, 'of', m.n, 'names are longer than 3 lines; the full name opens with the row')
      await assertNoSideways(page)
      expect(await small(page), 'hotlines targets under 44 px').toEqual([])
    })
  }

  for (const w of WIDTHS) {
    test(`S10 Facts fully loaded ${w}: Licence and Open on Wikipedia are 44 px targets`, async ({ page }) => {
      await page.clock.setFixedTime(DAY)
      await skipOnboarding(page)
      await page.route('https://en.wikipedia.org/api/rest_v1/feed/onthisday/**', (r) => r.fulfill({
        json: { events: [1, 2, 3, 4, 5].map((i) => ({ year: 1800 + i * 20, text: `A made-up harbour opens bell tower number ${i}.`, pages: [{ content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/Invented_${i}` } } }] })) }
      }))
      await page.setViewportSize({ width: w, height: 844 })
      await page.goto('/#discover/play/facts')
      const card = page.getByRole('region', { name: 'On this day' })
      await expect(card.getByRole('link', { name: 'Open on Wikipedia' })).toBeVisible() // loaded, not stopped at Loading
      await expect(card.getByRole('link', { name: 'Licence' })).toBeVisible()
      for (const s of SCHEMES) {
        await setScheme(page, s)
        await shoot(page, `facts-${s}-${w}`)
      }
      const boxes = await card.locator('a').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${e.textContent} ${Math.round(r.width)}x${Math.round(r.height)}` }))
      console.log('CL-S10-FACTS', w, JSON.stringify(boxes))
      expect(await small(page), 'Facts targets under 44 px').toEqual([])
      await assertNoSideways(page)
    })
  }

  // #safety, #health/metric/bp_systolic and #discover/play/wordsearch are asserted in v13-foundation ('<route>: every tap target is 44 px'); the rest of the S10 routes are swept here
for (const route of ['#safety/cards', '#safety/sources', '#safety/warnings', '#medid', '#discover/play', '#discover/learn/recipes']) {
    for (const w of WIDTHS) {
      test(`S10 sweep ${route} ${w}: every target is 44 px`, async ({ page }) => {
        await page.clock.setFixedTime(DAY)
        await skipOnboarding(page)
        await page.setViewportSize({ width: w, height: 844 })
        await page.goto(`/${route}`)
        await expect(page.locator('h1').first()).toBeVisible()
        await stable(page)
        expect(await small(page), `${route} targets under 44 px`).toEqual([])
        if (w === 390) await shoot(page, `${route.replace(/[#/]/g, '-').slice(1)}-light-${w}`)
      })
    }
  }

  test('S6 a.pill links show no underline (PAGASA bulletin on the storm track), at rest and on hover', async ({ page }) => {
    await page.clock.setFixedTime(DAY)
    await skipOnboarding(page)
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(DAY), temp: 28, humidity: 50, code: 0, hourlyProb: () => 5 }) }))
    await page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' }))
    await page.goto('/#weather')
    await expect(page.locator('.wx-temp')).toHaveText(/\d°/)
    const cyclone = { id: 'gdacs-TC-9001', kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone INVENTED', what: 'Tropical cyclone', where: 'Philippines', when: 'Now', doNow: 'Prepare', source: 'GDACS', sourceUrl: null, issuedAt: DAY, lat: 10.1, lon: 124.5, bulletin: 'b' }
    await seedToday(page, 'bantay', 'kv', [{ key: 'alerts:checkedAt', value: DAY }, { key: 'safety.alerts', value: [cyclone] }])
    await page.reload()
    const pill = page.locator('a.pill', { hasText: 'PAGASA bulletin' })
    await pill.scrollIntoViewIfNeeded()
    await expect(pill).toBeVisible()
    const line = () => pill.evaluate((e) => getComputedStyle(e).textDecorationLine)
    expect(await line()).toBe('none')
    await pill.hover()
    expect(await line(), 'hover too').toBe('none')
    await pill.focus()
    expect(await line(), 'focus too').toBe('none')
    const all = await page.locator('a.pill').evaluateAll((els) => els.map((e) => getComputedStyle(e).textDecorationLine))
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((d) => d === 'none'), `every a.pill on the page: ${all}`).toBe(true)
    await page.evaluate(() => { const e = document.querySelector('a.pill') as HTMLElement; e.scrollIntoView({ block: 'center' }) })
    await page.screenshot({ path: `${SHOTS}/s6-pill-light-390.png`, animations: 'disabled' })
  })
})

// ---------------------------------------------------------------- signed-in build (Supabase env, PostgREST mocked)
test.describe('signed in', () => {
  test.use({ baseURL: AUTH_URL })

  for (const scheme of SCHEMES) {
    for (const w of WIDTHS) {
      test(`T2 Today ${scheme} ${w}: another person's missed medicine is a first-name row in My day`, async ({ page }) => {
        await startToday(page, 'calm', { notice: true, scheme })
        await page.setViewportSize({ width: w, height: 844 })
        await setScheme(page, scheme)
        const row = page.getByTestId('myday-missed-ma')
        await expect(row).toBeVisible()
        await stable(page)
        const m = await page.evaluate(() => {
          const r = document.querySelector('[data-testid="myday-missed-ma"]') as HTMLElement
          const day = document.querySelector('[data-testid="myday"]') as HTMLElement
          const rows = Array.from(day.querySelectorAll('.td-todo')).map((e) => (e.getAttribute('data-testid') || '?'))
          const open = r.querySelector('a') as HTMLAnchorElement
          const tt = r.querySelector('.rw-title') as HTMLElement
          return { cut: tt.scrollWidth > tt.clientWidth + 1 || tt.scrollHeight > tt.clientHeight + 1, text: r.textContent, meta: day.querySelector('.sec-meta, [class*="meta"]')?.textContent ?? null, h: Math.round(r.getBoundingClientRect().height), open: [Math.round(open.getBoundingClientRect().width), Math.round(open.getBoundingClientRect().height)], href: open.getAttribute('href'), rows, needs: day.querySelector('.td-day-s')?.textContent }
        })
        console.log('CL-T2', scheme, w, JSON.stringify(m))
        expect(m.text).toMatch(/missed a medicine/)
        expect(m.cut, 'the row title is never cut with an ellipsis').toBe(false)
        expect(m.text, 'the time, and no stray Open in the line').toMatch(/^Ma missed a medicine9:00 AM\s*Open$/)
        expect(m.text, 'a name, not "Someone"').not.toMatch(/^Someone/)
        expect(m.text, 'no medicine name (D-109)').not.toMatch(/Losartan/)
        expect(m.needs).toMatch(/needs you$/)
        expect(m.h).toBeGreaterThanOrEqual(56)
        expect(m.open[0]).toBeGreaterThanOrEqual(44); expect(m.open[1]).toBeGreaterThanOrEqual(44)
        expect(m.href).toBe('#family/people/ma')
        await expect(page.getByTestId('family-notice')).toHaveCount(0)
        await assertNoSideways(page)
        await assertJackClear(page, { at: 'rest' })
        await shoot(page, `today-missed-${scheme}-${w}`)
      })

      test(`T15 Today warning ${scheme} ${w}: the red Hold pill, its font and size`, async ({ page }) => {
        await startToday(page, 'quake', { scheme })
        await page.setViewportSize({ width: w, height: 844 })
        await setScheme(page, scheme)
        const sos = page.getByTestId('warning-sos')
        await expect(sos).toBeVisible()
        await stable(page)
        const m = await page.evaluate(() => {
          const b = document.querySelector('[data-testid="warning-sos"] .sos-simple-btn') as HTMLElement
          const lbl = b.querySelector('.sos-simple-tx span, span') as HTMLElement
          const cs = getComputedStyle(b); const ls = getComputedStyle(lbl)
          const btn = document.querySelector('.btn, .btn2, .pill') as HTMLElement | null
          const r = b.getBoundingClientRect()
          const card = document.querySelector('[data-testid="warning-card"]')!.getBoundingClientRect()
          return {
            family: ls.fontFamily, weight: ls.fontWeight, size: ls.fontSize, bg: cs.backgroundColor, fg: ls.color,
            body: getComputedStyle(document.body).fontFamily, ui: getComputedStyle(document.documentElement).getPropertyValue('--f-ui').trim(),
            otherFamily: btn ? getComputedStyle(btn).fontFamily : null, otherWeight: btn ? getComputedStyle(btn).fontWeight : null,
            box: [Math.round(r.width), Math.round(r.height)], aboveCard: r.bottom <= card.top + 1
          }
        })
        console.log('CL-T15', scheme, w, JSON.stringify(m))
        expect(m.family, 'the v13 UI stack, like every other control').toBe(m.body)
        expect(Number(m.weight), 'not heavier than the board (700)').toBeLessThanOrEqual(700)
        expect(m.box[1]).toBeGreaterThanOrEqual(76)
        expect(m.fg).toBe('rgb(255, 255, 255)')
        await assertTextContrast(page) // the red pill's white text is >= 4.5 on its fill, light and dark
        await assertNoSideways(page)
        await shoot(page, `today-warning-${scheme}-${w}`)
      })
    }
  }

  for (const w of WIDTHS) {
    for (const [name, readings] of [['chart', true], ['calm', null]] as const) {
      test(`Family ${name} ${w}: Activity card height, no control but a People row under Jack`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 844 })
        await skipOnboarding(page)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        if (readings === null) await emptyNeeds(page) // nothing needs the carer: the Today row is shortest, so Activity starts highest
        else await openFamily(page, { readings, person: 'Ate Joy' })
        await expect(page.getByTestId('activity')).toBeVisible()
        if (readings) await expect(page.getByTestId('week-chart')).toBeVisible()
        else await expect(page.getByTestId('ac-empty')).toBeVisible({ timeout: 15_000 })
        await stable(page)
        // D-124: no floor under Activity, with or without data; the section hugs its content and the next section follows at once
        const r = await page.evaluate(() => {
          const act = document.querySelector('[data-testid="activity"]') as HTMLElement
          const next = act.nextElementSibling as HTMLElement
          return { cur: parseFloat(getComputedStyle(act).minHeight) || 0, height: Math.round(act.getBoundingClientRect().height), gap: Math.round(next.getBoundingClientRect().top - act.getBoundingClientRect().bottom) }
        })
        console.log('CL-FAMILY', name, w, JSON.stringify(r))
        expect(r.cur, 'Activity has no floor').toBe(0)
        expect(r.gap, 'gap between Activity and the next section').toBeLessThan(40)
        if (readings === null) expect(r.height, 'empty Activity hugs its line').toBeLessThan(260)
        for (const s of SCHEMES) {
          await setScheme(page, s)
          await shoot(page, `family-${name}-${s}-${w}`, true)
        }
        await assertNoSideways(page)
        await assertJackClear(page, { at: 'rest', allow: outsideWarning('.rw-main') }) // D-124: with the floor gone, only Needs/People rows (full-width links, tappable from the left) may be under him; every other control must clear
      })
    }
  }

  test('Family calm on tall phones (430x932, 448x998): the empty Activity card hugs its line (no hole), no control but a People row under Jack (D-122, D-124)', async ({ page }) => {
    await skipOnboarding(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 430, height: 932 })
    await emptyNeeds(page)
    await expect(page.getByTestId('ac-empty')).toBeVisible({ timeout: 15_000 })
    expect((await page.getByTestId('activity').boundingBox())!.height).toBeLessThan(260)
    await assertJackClear(page, { at: 'rest', allow: outsideWarning('.rw-main') })
    await page.setViewportSize({ width: 448, height: 998 })
    await stable(page)
    expect((await page.getByTestId('activity').boundingBox())!.height).toBeLessThan(260)
    await assertJackClear(page, { at: 'rest', allow: outsideWarning('.rw-main') })
  })

  for (const w of WIDTHS) {
    test(`Readings with real values ${w}, after the count-up`, async ({ page }) => {
      await skipOnboarding(page)
      await page.setViewportSize({ width: w, height: 844 })
      await page.emulateMedia({ reducedMotion: 'reduce' }) // CountUp renders its final value; with a fixed clock (Date.now frozen) GSAP's ticker never advances, so the tiles would stay at 0
      const now = new Date().toISOString() // the fixture dates readings from the Node clock, so the page clock starts there too (else "latest" sits in the future)
      await mock(page, now)
      await healthFull(page, now)
      await page.goto('/#health/readings')
      await expect(page.locator('h1').first()).toHaveText('Readings')
      await expect(page.getByTestId('rd-averages')).toBeVisible()
      for (const s of SCHEMES) {
        await setScheme(page, s)
        await shoot(page, `readings-${s}-${w}`)
      }
      await expect(page.getByTestId('rd-averages')).toBeVisible()
      const txt = await page.locator('.bt .scroll').innerText()
      expect(txt, 'real numbers, not a count-up frame').toMatch(/138\/88/)
      expect(txt, 'weight is the logged 61 kg, not 0').not.toMatch(/Weight\s*0\s*kg/)
      await assertNoSideways(page)
    })

    test(`Body wiki with Call 911 ${w}`, async ({ page }) => {
      await skipOnboarding(page)
      await page.setViewportSize({ width: w, height: 844 })
      await mock(page, FIXED_CLOCKS[1])
      await healthFull(page, FIXED_CLOCKS[1])
      await page.goto('/#health/body')
      await expect(page.locator('h1').first()).toHaveText('Body wiki')
      await page.getByTestId('body-systems').getByRole('button').filter({ hasText: 'Lungs' }).click()
      const call = page.getByTestId('care-call-911')
      await expect(call).toBeVisible()
      const b = (await call.boundingBox())!
      expect(b.height).toBeGreaterThanOrEqual(48)
      await expect(call).toHaveAttribute('href', 'tel:911')
      for (const s of SCHEMES) {
        await setScheme(page, s)
        await shoot(page, `body-wiki-${s}-${w}`)
      }
      expect(await small(page), 'Body wiki targets under 44 px').toEqual([])
      await assertNoSideways(page)
    })
  }

  for (const s of SCHEMES) {
    test(`Visits at 195 px ${s}`, async ({ page }) => {
      await skipOnboarding(page)
      await mock(page, FIXED_CLOCKS[1])
      await healthFull(page, FIXED_CLOCKS[1])
      await page.setViewportSize({ width: 195, height: 800 })
      await page.goto('/#health/visits')
      await expect(page.locator('h1').first()).toHaveText('Visits')
      await setScheme(page, s)
      await shoot(page, `visits-${s}-195`)
      await assertNoSideways(page)
      expect((await small(page)).filter((x) => !/^(Today|Health|Discover|Family|Safety|Me)\b/.test(x)), 'targets under 44 px at 195').toEqual([])
    })

    test(`Settings Alerts at 195 px ${s}`, async ({ page }) => {
      await skipOnboarding(page)
      await admin(page)
      await page.setViewportSize({ width: 195, height: 800 })
      await page.goto('/#me/alerts')
      await expect(page.locator('h1').first()).toBeVisible()
      await setScheme(page, s)
      await shoot(page, `settings-alerts-${s}-195`)
      await assertNoSideways(page)
      // no title runs over the line under it, and no row text is squeezed into a column under 90 px
      const over = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.st-row')).flatMap((r) => {
        const b = r.querySelector('b') as HTMLElement | null; const sub = r.querySelector('.sh-sub') as HTMLElement | null
        if (!b) return []
        const out: string[] = []
        if (b.scrollWidth > b.clientWidth + 1) out.push(`${b.textContent} wider than its box`)
        if (sub && b.getBoundingClientRect().bottom > sub.getBoundingClientRect().top + 1) out.push(`${b.textContent} overlaps its line`)
        if ((b.parentElement as HTMLElement).getBoundingClientRect().width < 90) out.push(`${b.textContent} column ${Math.round((b.parentElement as HTMLElement).getBoundingClientRect().width)} px`)
        return out
      }))
      expect(over, 'Settings rows at 195 px').toEqual([])
    })
  }
})
