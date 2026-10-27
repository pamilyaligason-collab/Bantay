import { expect, test, type Page } from '@playwright/test'
import { openChat, skipOnboarding } from './helpers'

test.use({ viewport: { width: 390, height: 844 } })

/** Scroll the main area to its end, then report the bottom of the last visible element and the top of the tab bar. */
const measure = (page: Page) =>
  page.evaluate(async () => {
    const main = document.querySelector('main.scroll') as HTMLElement
    main.scrollTop = main.scrollHeight
    await new Promise((r) => setTimeout(r, 300))
    main.scrollTop = main.scrollHeight
    const kids = Array.from(main.querySelectorAll<HTMLElement>('*')).filter((e) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(e).position !== 'fixed' && getComputedStyle(e).visibility !== 'hidden'
    })
    const bottom = Math.max(...kids.map((e) => e.getBoundingClientRect().bottom))
    const bar = document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect()
    return { bottom, barTop: bar.top }
  })

for (const tab of ['today', 'health', 'discover', 'family', 'safety', 'me', 'weather', 'safety/dial', 'safety/warnings', 'health/meds']) {
  test(`${tab}: the last element ends above the tab bar`, async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/#' + tab)
    await page.waitForTimeout(500)
    const m = await measure(page)
    expect(m.bottom, `${tab}: content bottom ${m.bottom} vs tab bar top ${m.barTop}`).toBeLessThanOrEqual(m.barTop)
  })
}

test('family plan: the Add button sits above the tab bar', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#family/plan')
  const fab = page.locator('.fm-fab')
  await expect(fab).toBeVisible()
  await page.waitForTimeout(500)
  const m = await measure(page)
  const b = (await fab.boundingBox())!
  expect(b.y + b.height, `FAB bottom ${b.y + b.height} vs tab bar top ${m.barTop}`).toBeLessThanOrEqual(m.barTop)
  expect(m.bottom).toBeLessThanOrEqual(m.barTop)
})

test('greeting shows on Today only', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.locator('.sh-top-greet')).toBeVisible()
  for (const t of ['health', 'discover', 'family', 'safety']) {
    await page.goto('/#' + t)
    await expect(page.locator('.sh-top-greet')).toHaveCount(0)
  }
})

test('Ask: the composer sits at the bottom of the screen with no gap under it', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await openChat(page)
  const form = page.locator('.as-form')
  await expect(form).toBeVisible()
  await page.waitForTimeout(600) // the sheet slides in
  const b = (await form.boundingBox())!
  expect(b.y + b.height).toBeLessThanOrEqual(844)
  expect(844 - (b.y + b.height)).toBeLessThanOrEqual(40)
})

// F1 (session 12): the floating Jack button must never sit over page content. Its bottom edge is --tabbar-clear and the page adds its height to the
// content padding, so with the page scrolled to the end every item ends above it, and above the tab bar. Two phone widths.
for (const width of [360, 390]) {
  test.describe(`Jack button at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    const rects = (page: Page) =>
      page.evaluate(async () => {
        const main = document.querySelector('main.scroll') as HTMLElement
        main.scrollTop = main.scrollHeight
        await new Promise((r) => setTimeout(r, 300))
        main.scrollTop = main.scrollHeight
        const fab = document.querySelector('.sh-jackfab')?.getBoundingClientRect()
        const bar = document.querySelector('nav[aria-label="Main"]')!.getBoundingClientRect()
        const kids = Array.from(main.querySelectorAll<HTMLElement>('*')).filter((e) => {
          const r = e.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && getComputedStyle(e).position !== 'fixed' && getComputedStyle(e).visibility !== 'hidden'
        })
        const bottom = Math.max(...kids.map((e) => e.getBoundingClientRect().bottom))
        const hit = (sel: string) => Array.from(document.querySelectorAll(sel)).map((e) => { const r = e.getBoundingClientRect(); return !!fab && r.width > 0 && r.left < fab.right && r.right > fab.left && r.top < fab.bottom && r.bottom > fab.top })
        return { fab: fab && { top: fab.top, bottom: fab.bottom, right: fab.right }, barTop: bar.top, bottom, sos: hit('.sos-simple-btn'), taken: hit('.td-taken'), vw: window.innerWidth }
      })

    test('today: the SOS hold never sits under Jack at any scroll position', async ({ page }) => {
      await page.setViewportSize({ width, height: 480 }) // stress size: on a 640 px phone the hold (top 244) starts above Jack (top 482) and never meets it; at 480 px Jack sits at 322 and the hold scrolls up through it
      await skipOnboarding(page)
      await page.goto('/#today')
      await expect(page.locator('.sh-jackfab')).toBeVisible()
      await expect(page.locator('.sos-simple-btn')).toBeVisible()
      await page.waitForTimeout(500)
      // Step the page from the top to the end: at some step the hold's top crosses Jack's height (the hold is mid-page), and it must never touch the button.
      const r = await page.evaluate(async () => {
        const main = document.querySelector('main.scroll') as HTMLElement
        const fab = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
        const btn = document.querySelector('.sos-simple-btn') as HTMLElement
        let overlaps = 0; let crossed = false; let minTop = 1e9; let maxTop = -1e9
        for (let y = 0; y <= main.scrollHeight; y += 20) {
          main.scrollTop = y
          await new Promise((x) => requestAnimationFrame(() => x(null)))
          const b = btn.getBoundingClientRect()
          minTop = Math.min(minTop, b.top); maxTop = Math.max(maxTop, b.top)
          if (b.top < fab.bottom && b.bottom > fab.top) crossed = true
          if (b.left < fab.right && b.right > fab.left && b.top < fab.bottom && b.bottom > fab.top) overlaps++
        }
        const b0 = btn.getBoundingClientRect()
        return { overlaps, crossed, left: b0.left, right: b0.right, vw: window.innerWidth, fabLeft: fab.left, minTop, maxTop, fabTop: fab.top, fabBottom: fab.bottom, sh: main.scrollHeight, ch: main.clientHeight }
      })
      expect(r.crossed, `the hold passed the height of Jack while scrolling ${JSON.stringify(r)}`).toBe(true)
      expect(Math.abs((r.left + r.right) / 2 - r.vw / 2), `the SOS hold is centred: left ${r.left}, right ${r.right}, width ${r.vw}`).toBeLessThan(2) // D-88
      expect(r.overlaps, `hold right edge ${r.right} vs Jack left ${r.fabLeft}`).toBe(0)
    })

    for (const tab of ['today', 'health', 'discover', 'discover/play', 'family', 'safety']) {
      test(`${tab}: Jack sits above the tab bar and below the last item of the page`, async ({ page }) => {
        await skipOnboarding(page)
        await page.goto('/#' + tab)
        await expect(page.locator('.sh-jackfab')).toBeVisible()
        await page.waitForTimeout(500)
        const m = await rects(page)
        expect(m.fab, 'Jack button rendered').toBeTruthy()
        expect(m.fab!.bottom, `Jack bottom ${m.fab!.bottom} vs tab bar top ${m.barTop}`).toBeLessThanOrEqual(m.barTop)
        expect(m.bottom, `${tab}: content bottom ${m.bottom} vs Jack top ${m.fab!.top}`).toBeLessThanOrEqual(m.fab!.top)
        expect(m.fab!.right).toBeLessThanOrEqual(m.vw)
        expect(m.sos.every((x) => !x), 'Jack over the SOS hold').toBe(true) // the SOS hold arrives with lane K; an empty list passes until then
        expect(m.taken.every((x) => !x), 'Jack over the Taken pill').toBe(true) // the Taken pill needs seeded doses: e2e/s12-shell.auth.spec.ts
      })
    }
  })
}
