import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding, stubWindy } from './helpers'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { assertJackClear, assertNoSideways, FIXED_CLOCKS, setScheme } from './v13'
import { shotPath } from './shotPath'

// Lane CT (comply round): Today, shell and Jack sheet against boards Main and JackSheet. Shots go to shots/comply-CT with DOC_SHOTS=1. Invented data only.
const SHOTS = shotPath('docs/redesign-2026-10-31/shots/comply-CT')
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

async function shoot(page: Page, name: string) {
  await page.evaluate(() => { const s = document.querySelector('.bt .scroll') as HTMLElement | null; if (s) s.scrollTop = 0 })
  const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? 844)
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(h + 20, 844), 4000) })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  await page.setViewportSize(vp)
}
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity))

for (const scheme of ['light', 'dark'] as const) {
  for (const w of [390, 360] as const) {
    test(`Today ${scheme} ${w}: shot, weight-200 temperature, no control under Jack`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 })
      await page.clock.setFixedTime(FIXED_CLOCKS[1])
      await skipOnboarding(page)
      const now = new Date(FIXED_CLOCKS[1])
      await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now, temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
      await page.goto('/#today')
      await expect(page.getByTestId('myday')).toBeVisible()
      await setScheme(page, scheme)
      await page.evaluate(() => document.fonts.ready)
      await shoot(page, `today-${scheme}-${w}`)
      await assertNoSideways(page)
      await assertJackClear(page, { at: 'rest' })
      // A2: the number really renders in the 200 face (a loaded font-face, not a system fallback)
      const f = await page.evaluate(async () => {
        const e = document.querySelector('.td-wxh-t') as HTMLElement
        const s = getComputedStyle(e)
        await document.fonts.load(`200 76px "Bantay Num"`, '26°')
        return { fw: s.fontWeight, fam: s.fontFamily, loaded: document.fonts.check('200 76px "Bantay Num"', '26°'), faces: Array.from(document.fonts).filter((x) => x.family.includes('Bantay Num')).map((x) => `${x.weight}:${x.status}`) }
      })
      console.log('FONT', scheme, w, JSON.stringify(f))
      expect(f.fw).toBe('200'); expect(f.fam).toMatch(/^"?Bantay Num/); expect(f.loaded).toBe(true); expect(f.faces).toEqual(['200:loaded'])
    })
  }
}

/** Rendered contrast of thin glyphs: the extreme 0.5% of pixels in the box (the stroke cores) against the median pixel (the sky), from a real screenshot, so anti-aliasing at weight 200 is included. */
async function glyphContrast(page: Page, sel: string) {
  const png = (await page.locator(sel).first().screenshot({ animations: 'disabled' })).toString('base64')
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const cx = c.getContext('2d', { willReadFrequently: true })!; cx.drawImage(img, 0, 0)
    const d = cx.getImageData(0, 0, c.width, c.height).data
    const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
    const L: number[] = []
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * f(d[i]!) + 0.7152 * f(d[i + 1]!) + 0.0722 * f(d[i + 2]!))
    L.sort((a, b) => a - b)
    const bg = L[Math.floor(L.length / 2)]!, hi = L[Math.floor(L.length * 0.995)]!
    const r = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    return r(hi, bg) // the temperature is white on the sky
  }, png)
}

for (const scheme of ['light', 'dark'] as const) {
  test(`weight-200 temperature keeps 4.5:1 on the day sky, Today and Weather, ${scheme}`, async ({ page }) => {
    const day = '2026-10-31T10:00:00+08:00' // the lightest sky of the day
    await page.clock.setFixedTime(day)
    await skipOnboarding(page)
    await stubWindy(page)
    await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now: new Date(day), temp: 31, humidity: 60, feels: 33, code: 2, hourlyProb: () => 10 }) }))
    await page.goto('/#today')
    await expect(page.getByTestId('weather-hero').locator('.td-wxh-t')).toBeVisible()
    await setScheme(page, scheme)
    await page.evaluate(() => document.fonts.load('200 76px "Bantay Num"', '31°'))
    const today = await glyphContrast(page, '.td-wxh-t')
    await page.goto('/#weather')
    await expect(page.locator('.wx-temp')).toBeVisible()
    await setScheme(page, scheme)
    await page.evaluate(() => document.fonts.ready)
    const wx = await page.evaluate(() => ({ fw: getComputedStyle(document.querySelector('.wx-temp')!).fontWeight, fam: getComputedStyle(document.querySelector('.wx-temp')!).fontFamily }))
    const weather = await glyphContrast(page, '.wx-temp')
    console.log('CT-THIN', scheme, JSON.stringify({ today: +today.toFixed(2), weather: +weather.toFixed(2), wx }))
    expect(wx.fw).toBe('200'); expect(wx.fam).toMatch(/^"?Bantay Num/)
    expect(today, 'Today temperature').toBeGreaterThanOrEqual(4.5)
    expect(weather, 'Weather temperature').toBeGreaterThanOrEqual(4.5)
  })
}

test('Today hero, Water row and Calm follow board Main (measured)', async ({ page }) => {
  await page.clock.setFixedTime(FIXED_CLOCKS[1])
  await skipOnboarding(page)
  const now = new Date(FIXED_CLOCKS[1])
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: openMeteoFixture({ now, temp: 26, humidity: 70, feels: 27, code: 2, hourlyProb: () => 10 }) }))
  await page.goto('/#today')
  await expect(page.getByTestId('myday')).toBeVisible()
  await expect(page.locator('.td-wxh-full')).toBeVisible()
  const m = await page.evaluate(() => {
    const q = (s: string) => document.querySelector(s) as HTMLElement
    const r = (e: Element) => e.getBoundingClientRect()
    const full = q('.td-wxh-full'); const fs = getComputedStyle(full)
    const plus = q('[data-testid="myday-water"] .td-todo-plus')
    const more = q('[data-testid="myday-more"] .rw-title')
    const orb = q('.td-calm .bo-orb b'); const o = getComputedStyle(orb)
    const slot = q('[data-testid="hourly-strip"] li')
    return {
      fullBorder: fs.borderTopWidth, fullSize: fs.fontSize, fullH: r(full).height,
      slotIcons: slot.querySelectorAll('svg').length,
      plusW: r(plus).width, plusH: r(plus).height,
      moreLines: Math.round(r(more).height / parseFloat(getComputedStyle(more).lineHeight || '20')),
      orbBg: o.backgroundImage.startsWith('radial-gradient'), orbBox: r(q('.td-calm .bo')).width
    }
  })
  // why the My day buttons stop short of the card edge: flush right (as on the board) one of them would sit under Jack at rest
  const under = await page.evaluate(() => {
    const sc = document.querySelector('.bt .scroll') as HTMLElement; sc.scrollTop = 0
    const j = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
    const shift = parseFloat(getComputedStyle(document.querySelector('.td-day .td-todo-go')!).marginRight) || 0
    return Array.from(document.querySelectorAll('.td-day .td-todo-go, .td-day .td-todo-done')).map((b) => { const r = b.getBoundingClientRect(); const fl = r.right + shift; return { name: (b.textContent || b.getAttribute('aria-label') || '').trim(), now: r.left < j.right && r.right > j.left && r.top < j.bottom && r.bottom > j.top ? 'x' : '', flush: r.left + shift < j.right && fl > j.left && r.top < j.bottom && r.bottom > j.top, jack: [j.left, j.top, j.right, j.bottom], shift } })
  })
  console.log('CT-JACKFLUSH', JSON.stringify(under))
  // D-135: the Today hero grew (hourly strip, rain line) and My day starts lower, so at 390 x 844 no button would sit under Jack even flush right; the old proof that the margin was needed no longer holds here, the behaviour (none under him) is what stays
  expect(under.every((u) => !u.now), 'no My day button is under Jack at rest').toBe(true)
  console.log('CT-MEASURE', JSON.stringify(m))
  expect(m.fullBorder, 'no divider above Full forecast').toBe('0px')
  expect(m.fullSize, 'S29 15px meta floor').toBe('15px')
  expect(m.fullH, 'Full forecast keeps a 44 px target').toBeGreaterThanOrEqual(44)
  const hit = await page.evaluate(() => { const l = document.querySelector('.td-wxh-full')!; const r = l.getBoundingClientRect(); const x = r.left + 20; return [r.top + 2, r.bottom - 2].map((y) => document.elementFromPoint(x, y)?.closest('.td-wxh-full') === l) })
  expect(hit, 'both ends of the 44 px target hit the link (not clipped)').toEqual([true, true])
  expect(m.slotIcons, 'strip items are time, icon, temperature, chance (D-139)').toBe(1)
  expect(m.plusW).toBeGreaterThanOrEqual(44); expect(m.plusH).toBeGreaterThanOrEqual(44)
  expect(m.moreLines, 'Log something else: two lines at most').toBeLessThanOrEqual(2)
  expect(m.orbBg, 'idle Calm orb is a gradient disc').toBe(true)
  expect(m.orbBox).toBe(84)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`Jack sheet ${scheme}: board JackSheet order, sub-text inside the red block, no Upload row, chips as board`, async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/#today')
    await expect(page.locator('h1').first()).toBeVisible()
    await setScheme(page, scheme)
    await page.getByTestId('jack').click()
    const sheet = page.getByRole('dialog', { name: 'Jack' })
    await expect(sheet).toBeVisible()
    await settled(page)
    const g = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect()
      const btn = r('[data-testid="jack-sos"] .sos-simple-btn'); const sub = r('[data-testid="jack-sos"] .sos-simple-sub')
      const safety = document.querySelector('[data-testid="jack-safety"]') as HTMLElement
      return { subInside: sub.top >= btn.top && sub.bottom <= btn.bottom, safetyBg: getComputedStyle(safety).backgroundColor, safetyAlign: getComputedStyle(safety).textAlign, safetyLink: r('[data-testid="jack-safety"] a').height, chips: Array.from(document.querySelectorAll('.jk-chip')).map((c) => c.textContent), upload: document.querySelectorAll('[data-testid="jack-upload"]').length }
    })
    console.log('CT-JACK', scheme, JSON.stringify(g))
    expect(g.subInside, 'sub-text is inside the red block').toBe(true)
    expect(g.safetyBg, 'Cannot hold is a sentence, not a pill').toBe('rgba(0, 0, 0, 0)')
    expect(g.safetyAlign).toBe('center'); expect(g.safetyLink).toBeGreaterThanOrEqual(44)
    expect(g.chips).toEqual(['Log my BP', 'What does ALT mean?', 'Did I take my medicine?'])
    expect(g.upload).toBe(0)
  })
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [w, h] of [[390, 844], [360, 800]] as const) {
    test(`Jack sheet ${scheme} ${w}: shot, sits inside the screen`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await skipOnboarding(page)
      await page.goto('/#today')
      await expect(page.locator('h1').first()).toBeVisible()
      await setScheme(page, scheme)
      await page.getByTestId('jack').click()
      const sheet = page.getByRole('dialog', { name: 'Jack' })
      await expect(sheet).toBeVisible()
      await settled(page)
      await page.screenshot({ path: `${SHOTS}/jack-sheet-${scheme}-${w}.png` })
      const m = await sheet.evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, h: r.height, vh: innerHeight } })
      console.log('JACKSHEET', scheme, w, JSON.stringify(m))
      expect(m.top).toBeGreaterThanOrEqual(0); expect(m.h).toBeLessThanOrEqual(m.vh * 0.9)
    })
  }
}
