import { expect, type Page } from '@playwright/test'
import { assertJackClear, assertNoWrappedButtons, FIXED_CLOCKS, ROUTES, setScheme } from './s16'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// v13 test policy (contracts-phase0.md 8.2, docs/redesign-2026-10-31/TESTING.md): measured boxes and computed colours, never page-height budgets.
export { assertJackClear, assertNoWrappedButtons, FIXED_CLOCKS, ROUTES, setScheme }

/** Exactly one `[data-hero]` in `.bt .scroll`, and its top is within 320 px of the scroll top. */
export async function assertHero(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const sc = document.querySelector('.bt .scroll') as HTMLElement | null
    const heroes = sc ? Array.from(sc.querySelectorAll<HTMLElement>('[data-hero]')) : []
    const top = heroes[0] ? heroes[0].getBoundingClientRect().top - sc!.getBoundingClientRect().top + sc!.scrollTop : null
    return { n: heroes.length, top }
  })
  expect(r.n, 'tab roots carry exactly one [data-hero]').toBe(1)
  expect(r.top!, 'the hero starts within 320 px of the scroll top').toBeLessThanOrEqual(320)
}

/** Each listed data-testid is present and sits lower than the one before it. */
export async function assertOrder(page: Page, testIds: string[]): Promise<void> {
  const tops = await page.evaluate((ids) => ids.map((id) => { const el = document.querySelector(`[data-testid="${id}"]`); return el ? el.getBoundingClientRect().top + (document.querySelector('.bt .scroll')?.scrollTop ?? 0) : null }), testIds)
  expect(tops.every((t) => t != null), `missing: ${testIds.filter((_, i) => tops[i] == null)}`).toBe(true)
  for (let i = 1; i < tops.length; i++) expect(tops[i]!, `${testIds[i]} must sit below ${testIds[i - 1]}`).toBeGreaterThan(tops[i - 1]!)
}

/** Every visible a / button / input / [role=button] inside `.bt` has a box of at least 44 x 44 (so text links are 44 tall too). Failures are listed by name and size. */
export async function assertTargets(page: Page): Promise<void> {
  const bad = await page.evaluate(() => {
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.bt a[href], .bt button, .bt input:not([type=hidden]), .bt [role=button]'))) {
      if (el.closest('[aria-hidden="true"], [inert]')) continue
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none') continue
      if (r.width <= 1 || r.height <= 1) continue // visually-hidden file inputs and skip links
      if (r.width < 43.5 || r.height < 43.5) out.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return out
  })
  expect(bad, 'tap targets under 44 px').toEqual([])
}

/** The scroller is not wider than its box and no element pokes past the right edge (boxes inside a horizontal scroller are clipped by it and skipped). */
export async function assertNoSideways(page: Page): Promise<void> {
  const bad = await page.evaluate(() => {
    const out: string[] = []
    const sc = document.querySelector('.bt .scroll') as HTMLElement | null
    if (!sc) return ['no .bt .scroll']
    if (sc.scrollWidth > sc.clientWidth) out.push(`scroller ${sc.scrollWidth} > ${sc.clientWidth}`)
    const edge = document.documentElement.clientWidth
    for (const el of Array.from(sc.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue
      let clipped = false
      for (let p = el.parentElement; p && p !== sc; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') { clipped = true; break } }
      if (!clipped && r.right > edge + 0.5) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} right ${Math.round(r.right)} > ${edge}`)
    }
    return out
  })
  expect(bad, 'content past the right edge').toEqual([])
}

/** Every visible text node in `.bt` meets the contrast floor: computed colour vs the composited ancestors (glass over the ground).
 *  `[data-contrast-bg="#hex"]` on a gradient element stands in for its darkest stop (getComputedStyle cannot read a gradient). */
export async function assertTextContrast(page: Page, min = 4.5): Promise<void> {
  const bad = await page.evaluate((min) => {
    const parse = (c: string) => { const n = (c.match(/[\d.]+/g) ?? []).map(Number); if (c.startsWith('color(srgb')) { n[0]! *= 255; n[1]! *= 255; n[2]! *= 255 } return n } // Chrome serialises color-mix() as color(srgb 0.96 0.9 0.8)
    const lin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!)
    const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const bodyBg = parse(getComputedStyle(document.body).backgroundColor)
    const bgOf = (el: Element): number[] => {
      const layers: number[][] = [] // translucent fills, inner to outer
      let base: number[] | null = null
      for (let e: Element | null = el; e; e = e.parentElement) {
        const pin = e.getAttribute('data-contrast-bg')
        if (pin) { base = hex(pin); break }
        const c = parse(getComputedStyle(e).backgroundColor); const a = c[3] ?? 1
        if (c.length < 3 || a === 0) continue
        if (a >= 1) { base = c.slice(0, 3); break }
        layers.push(c)
      }
      let out = base ?? (bodyBg.length >= 3 && (bodyBg[3] ?? 1) > 0 ? bodyBg.slice(0, 3) : [255, 255, 255])
      for (const l of layers.reverse()) out = [0, 1, 2].map((i) => l[i]! * l[3]! + out[i]! * (1 - l[3]!))
      return out
    }
    const out: string[] = []
    const walker = document.createTreeWalker(document.querySelector('.bt')!, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue?.trim(); const el = n.parentElement
      if (!t || !el || el.closest('[aria-hidden="true"], script, style')) continue
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.opacity === '0' || parseFloat(s.fontSize) === 0) continue
      const size = parseFloat(s.fontSize); const big = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700)
      const need = big ? 3 : min
      const bg = bgOf(el); const fgc = parse(s.color); const fa = fgc[3] ?? 1
      const fg = [0, 1, 2].map((i) => fgc[i]! * fa + bg[i]! * (1 - fa))
      const got = ratio(fg, bg)
      if (got < need) out.push(`${t.slice(0, 30)} | ${s.color} on rgb(${bg.map(Math.round).join(',')}) = ${got.toFixed(2)} < ${need}`)
    }
    return out
  }, min)
  expect(bad, 'text under the contrast floor').toEqual([])
}

/** 195 px wide: reload, then no sideways scroll, targets >= 44, no wrapped buttons. */
export async function assertNarrow(page: Page): Promise<void> {
  await page.setViewportSize({ width: 195, height: 800 })
  await page.reload()
  await expect(page.locator('.bt .scroll')).toBeVisible()
  await assertNoSideways(page)
  await assertTargets(page)
  await assertNoWrappedButtons(page)
}

/** With V13_SHOTS=<dir>: <dir>/<name>-light.png and -dark.png. Without it nothing is written (shots are evidence, not assertions). */
export async function shotsLightDark(page: Page, name: string): Promise<void> {
  const dir = process.env.V13_SHOTS
  if (!dir) return
  for (const s of ['light', 'dark'] as const) {
    await setScheme(page, s)
    await page.screenshot({ path: `${dir}/${name}-${s}.png`, animations: 'disabled' })
  }
}
