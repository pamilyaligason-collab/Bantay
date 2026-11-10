import { expect, test, type Page } from '@playwright/test'
import { expectJackAtRest, layoutStable, WARN_SOS } from './v13'

// Lane CS (D-115): Safety matches the board where it can. Measured values; nothing here uses real data.
test('first aid tiles share two equal columns and carry distinct per-topic tints; one Sources link; Offline maps row is listed', async ({ page }) => {
  await page.goto('/#safety')
  const tiles = page.locator('.sf-fa')
  await expect(tiles).toHaveCount(6) // 3 rows of 2, the rest behind Show more
  const w = await tiles.evaluateAll((els) => els.map((e) => ({ w: Math.round(e.getBoundingClientRect().width), bg: getComputedStyle(e).backgroundColor })))
  expect(new Set(w.map((t) => t.w)).size).toBe(1) // both columns the same width
  expect(w[0]!.w).toBeGreaterThanOrEqual(120) // a minimum tile width at 1280 x 720 as well
  expect(new Set(w.map((t) => t.bg)).size).toBeGreaterThanOrEqual(3) // red, amber, purple
  await expect(page.getByRole('link', { name: 'Sources', exact: true })).toHaveCount(1)
  await expect(page.getByRole('list', { name: 'Be ready' }).getByRole('link', { name: /^Offline maps/ })).toContainText('Not downloaded')
})

test('Safety home first aid tiles carry the same tints as All topics', async ({ page }) => {
  await page.goto('/#safety')
  await page.getByRole('button', { name: 'Show more' }).click()
  const read = (sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => [e.getAttribute('href'), e.getAttribute('data-tint')]))
  const home = Object.fromEntries(await read('.sf-fa'))
  await page.goto('/#safety/firstaid')
  const list = Object.fromEntries(await read('.fa-tc'))
  expect(Object.keys(home)).toHaveLength(17)
  for (const [href, tint] of Object.entries(home)) expect(tint, href!).toBe(list[href!])
})

test('Call 911 stays solid red with white text', async ({ page }) => {
  await page.goto('/#safety')
  const s = await page.getByRole('link', { name: 'Call 911' }).evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color }))
  expect(s.fg).toBe('rgb(255, 255, 255)')
  expect(s.bg).toBe('rgb(200, 55, 45)')
})

// Every word of every tile title, measured on one line, must fit the title box: if one does not, `overflow-wrap: anywhere` breaks it mid-word.
const wordFit = (page: Page) => page.locator('.sf-fa').evaluateAll((els) => els.map((e) => {
  const b = e.querySelector('b') as HTMLElement
  const cs = getComputedStyle(b)
  const room = b.getBoundingClientRect().width
  const probe = document.createElement('span')
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing}`
  e.appendChild(probe)
  const words = (b.textContent ?? '').split(/\s+/).filter(Boolean).map((w) => { probe.textContent = w; return { w, width: probe.getBoundingClientRect().width } })
  probe.remove()
  const widest = words.reduce((a, c) => (c.width > a.width ? c : a), { w: '', width: 0 })
  return { title: b.textContent ?? '', room: Math.round(room), widest: widest.w, widestW: Math.round(widest.width), breaks: widest.width > room + 0.5 }
}))

// The Jack button must sit clear of every control but the tiles, with the expanded tiles on screen (not only at the page end, where Be ready may be what is underneath).
// Whole-card tiles (`.sf-fa`) and the Go-bag card (`.sf-bag`) may pass under Jack's edge strip at rest; any other control under the button fails the check.
// S29 (D-184) replaced the old box rule (D-128: at least 86% of the card tappable, cover at most 0.14) with the centre-point rule: a tile's or card's CENTRE POINT (of the part on screen) is never under Jack. The old share is no longer a gate because it depends on where the page rests: with Jack 62 x 62 over a tile about 173 x 132, a tile that sits fully beside his strip is covered up to 0.17, and the share that was measured (0.09 to 0.12) was only the offset the test happened to rest at. The share is still logged.
const jackHits = async (page: Page, where: 'rest' | 'first' | 'last') => {
  await layoutStable(page) // the weather note lands about a second after load and moves every tile by about 100 px (measured): wait for it, then scroll
  await page.evaluate(async (where) => {
    const sc = document.querySelector('.bt .scroll') as HTMLElement
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('.sf-fa'))
    if (where === 'rest') sc.scrollTop = 0
    else tiles[where === 'first' ? 0 : tiles.length - 1]!.scrollIntoView({ block: 'center' })
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => r(null)))
  }, where)
  await expectJackAtRest(page, `Jack ${where}`) // S29: Jack is measured at rest, and the test fails if he is not
  return page.evaluate(([, warn]) => {
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('.sf-fa'))
    const fab = document.querySelector('.sh-jackfab')
    if (!fab) return { fab: false, tilesOnScreen: 0, hits: [] as string[], cover: 0 }
    if (fab.hasAttribute('data-away')) throw new Error('Jack slid away during the measure')
    const f = fab.getBoundingClientRect()
    const vis = (n: Element) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 }
    const share = (n: Element) => { const r = n.getBoundingClientRect(); const w = Math.max(0, Math.min(r.right, f.right) - Math.max(r.left, f.left)); const h = Math.max(0, Math.min(r.bottom, f.bottom) - Math.max(r.top, f.top)); return (w * h) / (r.width * r.height) }
    const under = Array.from(document.querySelectorAll<HTMLElement>('button, a, input, [role=button]')).filter((n) => n !== fab && !fab.contains(n) && vis(n) && share(n) > 0)
    // a large whole-card link (a tile, the Go-bag card) may pass under the button's edge strip as long as its centre point stays clear (S29 rule); any other control may not
    const centreUnder = (n: Element) => { const r = n.getBoundingClientRect(); const x = (r.left + r.right) / 2, y = (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2; return x >= f.left && x <= f.right && y >= f.top && y <= f.bottom }
    const big = (n: Element) => n.getBoundingClientRect().width >= 120 && n.getBoundingClientRect().height >= 44 && n.matches('a.card, .sf-fa, a.sf-bag, .sf-bag, a.rw-main') && !n.closest(warn) // never a card inside a warning or SOS block
    const hits = under.filter((n) => !big(n) || centreUnder(n)).map((n) => (n.getAttribute('aria-label') || n.textContent || n.tagName).trim().slice(0, 40))
    const cover = Math.max(0, ...under.filter(big).map(share))
    return { fab: true, tilesOnScreen: tiles.filter(vis).length, hits, cover: Math.round(cover * 100) / 100 }
  }, [where, WARN_SOS] as const)
}

test.describe('first aid grid: Show more and Show less', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Show more is 44 px tall; Jack clears the expanded tiles on screen; tiles keep a readable width', async ({ page }) => {
    await page.goto('/#safety')
    const more = page.getByRole('button', { name: 'Show more' })
    await more.scrollIntoViewIfNeeded()
    expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await more.click()
    await expect(page.locator('.sf-fa')).toHaveCount(17)
    const widths = await page.locator('.sf-fa').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(150) // two columns at 390 px: about 165 px each
    for (const where of ['rest', 'first', 'last'] as const) {
      const r = await jackHits(page, where)
      expect(r.fab, 'the Jack button is on the Safety home').toBe(true)
      if (where !== 'rest') expect(r.tilesOnScreen, `${where}: expanded tiles are on screen`).toBeGreaterThan(0)
      expect(r.hits, `${where}: controls under the Jack button (a tile or the Go-bag card aside)`).toEqual([])
      console.log(`jack ${where}`, JSON.stringify(r))
    }
  })

  test('Show less brings the section top back from above the screen', async ({ page }) => {
    await page.goto('/#safety')
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect(page.locator('.sf-fa')).toHaveCount(17)
    const less = page.getByRole('button', { name: 'Show less' })
    await less.scrollIntoViewIfNeeded()
    const top = () => page.locator('.sf-fagrid').evaluate((g) => g.closest('section')!.getBoundingClientRect().top)
    expect(await top(), 'before: the section top is above the screen').toBeLessThan(0)
    expect((await less.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await less.click()
    await expect(page.locator('.sf-fa')).toHaveCount(6)
    await expect.poll(top).toBeGreaterThanOrEqual(-1)
  })

  test('at 195 px (200% text) the grid is one column, no title word is cut mid-word, nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 195, height: 844 })
    await page.goto('/#safety')
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect(page.locator('.sf-fa')).toHaveCount(17)
    const r = await page.locator('.sf-fa').evaluateAll((els) => els.map((e) => ({ left: Math.round(e.getBoundingClientRect().left), w: Math.round(e.getBoundingClientRect().width) })))
    expect(new Set(r.map((t) => t.left)).size).toBe(1) // one column
    expect(Math.min(...r.map((t) => t.w))).toBeGreaterThanOrEqual(150)
    expect((await wordFit(page)).filter((t) => t.breaks)).toEqual([])
    expect(await page.evaluate(() => { const sc = document.querySelector('.bt .scroll') as HTMLElement; return document.documentElement.scrollWidth <= innerWidth && sc.scrollWidth <= sc.clientWidth })).toBe(true)
  })

  // 320 px, and 312 px = 390 px at 125% text (Android scales text, so the width in 100% pixels is 390 / 1.25). Both are above the 300 px narrow switch, so two columns.
  for (const width of [320, 312]) {
    test(`at ${width} px the two columns keep every title word whole`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/#safety')
      await page.getByRole('button', { name: 'Show more' }).click()
      await expect(page.locator('.sf-fa')).toHaveCount(17)
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-narrow'))).toBe(false)
      const fit = await wordFit(page)
      console.log(`wordFit ${width}`, JSON.stringify(fit.filter((t) => t.widestW > t.room - 12).map((t) => [t.title, t.widest, t.widestW, t.room])))
      expect(fit.filter((t) => t.breaks)).toEqual([])
    })
  }
})
