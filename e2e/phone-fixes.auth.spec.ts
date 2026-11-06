import { expect, test, type Page } from '@playwright/test'
import { mockFamily, NOW } from './fixtures/s16/family'
import { openFamily } from './fixtures/v13/family'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> }

// Phone fixes (owner's phone, about 450 x 997 CSS px). Signed-in build on purpose: it loads the Docs css before Discover's, which is how .dc-thumb lost.
// Shots only with PHONE_SHOTS=<dir> (invented data).
test.use({ timezoneId: 'Asia/Manila', serviceWorkers: 'block' })
const SHOTS = process.env.PHONE_SHOTS
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#6b8"/></svg>'
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' }) }

async function discover(page: Page, w: number, h: number) {
  await skipOnboarding(page)
  await mockFamily(page)
  await page.route('**/i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }))
  await page.clock.setFixedTime(new Date('2026-10-31T09:00:00+08:00'))
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/#discover')
  await expect(page.getByTestId('dc-learn')).toBeVisible()
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.dc-still img')).every((i) => (i as HTMLImageElement).complete))
}

for (const [w, h] of [[450, 997], [390, 997], [360, 997], [390, 844]] as const) {
  test(`discover ${w}x${h}: video pictures fill their boxes, no empty band under the season card (D-124), Learn link clear of Jack`, async ({ page }) => {
    await discover(page, w, h)
    await shot(page, `discover-${w}x${h}`)
    const m = await page.evaluate(() => {
      const box = (e: Element) => e.getBoundingClientRect()
      const fill = Array.from(document.querySelectorAll('.dc-herocard .dc-still, .dc-vc .dc-still')).map((e) => { const a = box(e); const p = box(e.parentElement!); return { w: a.width, h: a.height, pw: p.width, ph: p.height } })
      const sea = document.querySelector('[data-testid="season-row"]')!.getBoundingClientRect()
      const head = document.querySelector('[data-testid="dc-watch"]')!.getBoundingClientRect() // D-124 kept in S22: the Watch section follows the season card at once (Be prepared became a Learn card, D-135)
      const link = Array.from(document.querySelectorAll('[data-testid="dc-learn"] a')).find((n) => n.textContent === 'All topics')!.getBoundingClientRect()
      const fab = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
      return { fill, gap: head.top - sea.bottom, overlap: link.left < fab.right && link.right > fab.left && link.top < fab.bottom && link.bottom > fab.top }
    })
    expect(m.fill).toHaveLength(4) // the hero, both small main-video cards and the DIY card (the Be prepared cards became the Learn card, D-135)
    for (const f of m.fill) { expect(f.w, 'picture width').toBeGreaterThanOrEqual(f.pw - 1); expect(f.h, 'picture height').toBeGreaterThanOrEqual(f.ph - 1) }
    expect(m.gap, 'gap between the season card and the next section').toBeLessThan(40)
    expect(m.overlap, 'Learn link under Jack at rest').toBe(false)
  })
}

// D-124: the floor that lifted Learn's link below Jack is gone; at every height around the old thresholds the link stays clear of Jack and no band opens under the season card.
for (const day of ['2026-10-31', '2026-11-10', '2026-12-10']) {
  test(`${day}: Learn link clear of Jack on both sides of the floor thresholds, no band above them`, async ({ page }) => {
    test.setTimeout(120_000)
    await discover(page, 390, 900)
    await page.clock.setFixedTime(new Date(`${day}T09:00:00+08:00`))
    for (const [w, th] of [[360, 980], [374, 980], [375, 920], [390, 920], [412, 920], [450, 920]] as const) {
      await page.setViewportSize({ width: w, height: 900 })
      await page.reload()
      await expect(page.getByTestId('dc-learn')).toBeVisible()
      for (const h of [th - 40, th - 1, th, th + 1, th + 40]) {
        await page.setViewportSize({ width: w, height: h })
        const m = await page.evaluate(() => {
          ;(document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0
          const sea = document.querySelector('[data-testid="season-row"]')!.getBoundingClientRect()
          const head = document.querySelector('[data-testid="dc-watch"]')!.getBoundingClientRect()
          const link = Array.from(document.querySelectorAll('[data-testid="dc-learn"] a')).find((n) => n.textContent === 'All topics')!.getBoundingClientRect()
          const fab = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
          return { gap: head.top - sea.bottom, overlap: link.left < fab.right && link.right > fab.left && link.top < fab.bottom && link.bottom > fab.top }
        })
        expect(m.overlap, `${w}x${h}: Learn link under Jack`).toBe(false)
        expect(m.gap, `${w}x${h}: band under the season card (th ${th})`).toBeLessThan(40)
      }
    }
  })
}

test('family: an empty Activity card hugs its one line (no floor)', async ({ page }) => {
  await page.setViewportSize({ width: 450, height: 997 })
  await skipOnboarding(page)
  await mockFamily(page)
  await page.clock.setFixedTime(NOW)
  await page.goto('/#family')
  const sec = page.getByTestId('activity')
  await expect(page.getByTestId('ac-empty')).toBeVisible()
  await page.waitForTimeout(300)
  await shot(page, 'family-activity-empty-450x997')
  const empty = (await sec.boundingBox())!.height
  expect(empty, 'empty Activity section height').toBeLessThan(260)
  expect(await sec.evaluate((e) => getComputedStyle(e).minHeight)).toMatch(/^(0px|auto)$/)
})

test('family: with BP data an empty tab keeps the chart space inside the card, no floor on the section (tabs jump by the legend lines only)', async ({ page }) => {
  await page.setViewportSize({ width: 450, height: 997 })
  await openFamily(page, { person: 'Ate Joy' }) // her readings draw the chart (D-109: Family opens on Me)
  const sec = page.getByTestId('activity')
  await expect(sec.locator('svg.wk').first()).toBeVisible()
  const bp = (await sec.boundingBox())!.height
  expect(await sec.evaluate((e) => getComputedStyle(e).minHeight), 'no floor on the section').toMatch(/^(0px|auto)$/)
  await sec.getByRole('button', { name: 'Steps' }).click()
  await expect(page.getByTestId('ac-empty')).toBeVisible()
  expect(Math.abs((await sec.boundingBox())!.height - bp), 'switching to an empty tab: only the chart height is kept, the legend and note lines go (measured 90 px)').toBeLessThanOrEqual(95)
  expect((await sec.locator('.card.ac').boundingBox())!.height, 'the empty tab still holds the 170 px chart space').toBeGreaterThan(240)
})

test('jack: scrolled down he peeks at the right edge, a real 48 px target (elementFromPoint), returns at the top and on keyboard focus', async ({ page }) => {
  await discover(page, 450, 997)
  const jack = page.getByTestId('jack')
  const scrollTo = (y: number) => page.evaluate((v) => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = v }, y)
  await expect(jack).not.toHaveAttribute('data-peek', /.*/)
  const rest = await jack.boundingBox()
  expect(rest!.x + rest!.width, 'at rest Jack is inside the viewport').toBeLessThanOrEqual(450)
  await scrollTo(600)
  await expect(jack).toHaveAttribute('data-peek', 'true')
  await page.waitForTimeout(400)
  const r = await jack.boundingBox()
  const vw = 450
  expect(r!.x + r!.width, 'mostly off the edge').toBeGreaterThan(vw)
  expect(r!.x + r!.width / 2, 'centre stays on screen').toBeLessThan(vw)
  // every point in the 48 px wide strip at the screen edge, 40 px above and below the centre, must land on the button
  const cy = r!.y + r!.height / 2
  const miss = await page.evaluate(([cyy]) => {
    const bad: string[] = []
    for (const dy of [-40, -30, -20, 0, 20, 30, 40]) for (const dx of [2, 10, 24, 36, 47]) {
      const el = document.elementFromPoint(innerWidth - dx, (cyy as number) + dy)
      if (!el?.closest('.sh-jackfab')) bad.push(`${dx},${dy}:${el?.className}`)
    }
    return bad
  }, [cy])
  expect(miss, 'points not on Jack').toEqual([])
  await shot(page, 'jack-peek-450x997')
  await scrollTo(0)
  await expect(jack).not.toHaveAttribute('data-peek', /.*/)
  await scrollTo(600)
  await expect(jack).toHaveAttribute('data-peek', 'true')
  await jack.focus() // no pointer used: focus-visible matches, as for a keyboard user
  await expect(jack).not.toHaveAttribute('data-peek', /.*/)
})

// The sheet holds Help: a press on a peeked Jack must open it, held for 0, 120 or 300 ms, with a mouse or a real touch, with and without reduced motion.
// "rest" is the control: the same press on Jack at the top of the page.
for (const motion of ['no-preference', 'reduce'] as const) {
  for (const state of ['rest', 'peeked'] as const) {
    test.describe(`${motion} ${state}`, () => {
      test.use({ hasTouch: true })
      const press = async (page: Page, how: string) => {
        const jack = page.getByTestId('jack')
        const b = (await jack.boundingBox())!
        const x = state === 'peeked' ? 450 - 10 : b.x + b.width / 2
        const y = b.y + b.height / 2
        if (how === 'touch') return page.touchscreen.tap(x, y)
        await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(Number(how)); await page.mouse.up()
      }
      for (const how of ['0', '120', '300', 'touch']) {
        test(`${how === 'touch' ? 'touch tap' : `mouse held ${how} ms`} opens the Jack sheet`, async ({ page }) => {
          await page.emulateMedia({ reducedMotion: motion })
          await discover(page, 450, 997)
          if (state === 'peeked') {
            await page.evaluate(() => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 600 })
            await expect(page.getByTestId('jack')).toHaveAttribute('data-peek', 'true')
            await page.waitForTimeout(400)
          }
          await press(page, how)
          await expect(page.getByRole('dialog')).toBeVisible()
        })
      }
    })
  }
}

test('jack: under reduced motion the move has no transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await discover(page, 450, 997)
  await page.evaluate(() => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 600 })
  await expect(page.getByTestId('jack')).toHaveAttribute('data-peek', 'true')
  expect(await page.getByTestId('jack').evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s')
})
