import { expect, type Page } from '@playwright/test'
import { assertNoWrappedButtons, FIXED_CLOCKS, ROUTES, setScheme } from './s16'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// v13 test policy (contracts-phase0.md 8.2, docs/redesign-2026-10-31/TESTING.md): measured boxes and computed colours, never page-height budgets.
export { assertNoWrappedButtons, FIXED_CLOCKS, ROUTES, setScheme }

/** Settled state before any assertion (ML-25): the scroller is shown, nothing is busy, fonts are loaded. No sleeps. */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('.bt .scroll')).toBeVisible()
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
  await page.evaluate(() => document.fonts.ready)
}

/** Warning and SOS content (Today's warning cards and `.td-alertband`, the family notice, the storm roll call `.fm-storm`, the Safety `storm-block`, any sos screen or row): a Jack allowance never covers it. `outsideWarning('.rw-main')` is that selector with warning and SOS content left out. */
export const WARN_SOS = '[data-testid^="warning"], [data-testid^="warn-"], [data-testid*="sos"], [data-testid="family-notice"], .td-alertband, .fm-storm, [data-testid="storm-block"], [data-nofab]'
export const outsideWarning = (sel: string) => `${sel}:not(:is(${WARN_SOS}) *)`

/** S29 (D-184) centre-point gate: no control (button, a, input, [role=button]) has its CENTRE POINT (of the part on screen) under the Jack button at scroll 0 ('rest'), at the end of the scroll ('end'), or both (default). Jack hides while the page scrolls down, so each check first waits for him to be back. Failures are prefixed "at rest:" / "at end:".
 *  `allow`: a selector whose controls may sit under Jack (D-122 People rows). No gutter on a whole grid is a way to pass: the cards run the full width. */
export async function assertJackClear(page: Page, opts: { at?: 'rest' | 'end' | 'both'; allow?: string } = {}): Promise<void> {
  await settled(page)
  const at = opts.at ?? 'both'
  for (const when of at === 'both' ? (['rest', 'end'] as const) : [at]) {
    const hits = await page.evaluate(async ([when, allow]) => {
      const fab = document.querySelector('.sh-jackfab')
      const el = document.querySelector('.bt .scroll') as HTMLElement
      if (!fab) return [] as string[] // frames without the button (warning, storm, SOS ...) have nothing to clear
      const put = () => { el.scrollTop = when === 'rest' ? 0 : el.scrollHeight }
      put()
      for (let i = 0; i < 3; i++) { await new Promise((r) => requestAnimationFrame(() => r(null))); put() } // late content (cards that load after first paint) moves the end
      for (let i = 0; i < 40 && fab.hasAttribute('data-away'); i++) await new Promise((r) => setTimeout(r, 50)) // 600 ms after the scroll stops he is back
      await new Promise((r) => setTimeout(r, 200)) // his 150 ms slide in
      const f = fab.getBoundingClientRect()
      const v = el.getBoundingClientRect()
      return Array.from(document.querySelectorAll<HTMLElement>('button, a, input, [role=button]'))
        .filter((n) => n !== fab && !fab.contains(n) && !(allow && n.closest(allow)))
        .filter((n) => {
          const r = n.getBoundingClientRect()
          if (r.width <= 0 || r.height <= 0 || getComputedStyle(n).visibility === 'hidden') return false
          const x = (Math.max(r.left, v.left) + Math.min(r.right, v.right)) / 2, y = (Math.max(r.top, v.top) + Math.min(r.bottom, v.bottom)) / 2
          return x >= f.left && x <= f.right && y >= f.top && y <= f.bottom
        })
        .map((n) => (n.getAttribute('aria-label') || n.textContent || n.tagName).trim().slice(0, 40))
    }, [when, opts.allow ?? ''] as const)
    expect(hits, `at ${when}: controls under the Jack button`).toEqual([])
  }
}

/** D-128 hit test: a control that touches the Jack button fails unless it is a named whole-card link with more than half of it still tappable (hit-tested on a 12 x 12 grid over its on-screen part, so clipping and the real top element count). Section links and small controls (Open Papa, See all) have no allowance. `scroll: 'top'` (default) measures at scroll 0, 'keep' measures where the page is now. Either way Jack is measured at rest, after data-away clears (S29). The log line carries each measured share. */
export type JackAllow = { name: string; sel: string }
// The named allowances (D-128) are whole-card links only. 'Learn card' (min 90% tappable) and 'Together row' (min 84%) were added by ruling in D-128.
// Measured tappable share in gaps-s21 (S21-JACK lines, 4 widths x 5 heights, 3 dates, 143 tests green): Be prepared card 0.75 to 0.99 (43 hits), Learn card 0.90 to 0.97 (9 hits), People row 0.85 to 0.99 (22 hits), Together row 0.84 to 0.99 (11 hits), Needs row never touched Jack (0 hits).
// Discover (S22 D-135, kept in S25): DISCOVER_ALLOW names four whole-card links: Watch hero card (a.dc-herocard), Video row card (a.dc-vrow), Video card (a.dc-vc), Learn card (a.dc-lc). Each may touch Jack only while more than half of it stays tappable (assertJackHit fails at 50 % or less). Measured on Discover in gaps-s21 and gaps-d117 (4 widths x 5 heights x 3 dates, 16 dates x 6 sizes, 195 to 450 wide): the Watch hero card and a More-videos card touched Jack with 0.69 to 0.99 of them tappable (190 hits); Learn, recipe and Top story cards on Discover never touched him. So the Learn card allowance on Discover (a.dc-lc) is UNMEASURED: the 0.90 to 0.97 range above came from the gaps-s21 Learn card of the D-128 ruling, not from Discover. The log does not split the video hits between a.dc-vrow and a.dc-vc. Nothing was re-measured for the S24 revamp or S25 (a full e2e run needs two production builds); the S21-JACK log lines of the next gaps-s21 and gaps-d117 run print the current share of every control that touches Jack. Section links (All, All topics, See all) and the Today | News | Saved tabs have no allowance.
// S28 (D-180): every video preview is the shared MediaCard (.md): a link card (a.md, hero or row) or a button card (button.md, Regional news and Watch); the old dc-herocard, dc-vrow, dc-vc and dc-vgcard classes are gone.
export const DISCOVER_ALLOW: JackAllow[] = [{ name: 'Video link card', sel: 'a.md' }, { name: 'Video button card', sel: 'button.md' }, { name: 'Learn card', sel: 'a.dc-lc' }]
export const FAMILY_ALLOW: JackAllow[] = [{ name: 'People row', sel: '[data-testid="people-row"] .rw-main' }, { name: 'Needs row', sel: '[data-testid="need-row"] .rw-main' }, { name: 'Together row', sel: '[data-testid="together-list"] a.rw-main, [data-testid="together-list"] a.fm-tile' }] // a Needs row's Answer / Open / Fix phone control is a small control: no allowance
export async function assertJackHit(page: Page, allow: JackAllow[], tag: string, scroll: 'top' | 'keep' = 'top'): Promise<void> {
  const hits = await page.evaluate(async ([allow, scroll]) => {
    const sc = document.querySelector('.bt .scroll') as HTMLElement
    if (scroll === 'top') sc.scrollTop = 0
    const fab = document.querySelector('.sh-jackfab')
    if (!fab) return []
    for (let i = 0; i < 40 && fab.hasAttribute('data-away'); i++) await new Promise((r) => setTimeout(r, 50)) // S29: measure with Jack at rest, never while he is slid away (a vacuous check)
    await new Promise((r) => setTimeout(r, 200)) // his 150 ms slide in
    const f = fab.getBoundingClientRect()
    const box = sc.getBoundingClientRect()
    const barTop = document.querySelector('.tabbar')?.getBoundingClientRect().top ?? innerHeight // content under the tab bar is the bar's business, not Jack's
    const out: { label: string; allowed: string | null; tappable: number }[] = []
    for (const n of Array.from(document.querySelectorAll<HTMLElement>('button, a, input, [role=button]'))) {
      if (n === fab || fab.contains(n)) continue
      const r = n.getBoundingClientRect()
      const l = Math.max(r.left, box.left, 0), t = Math.max(r.top, box.top, 0), rt = Math.min(r.right, box.right, innerWidth), b = Math.min(r.bottom, box.bottom, barTop)
      if (rt - l < 1 || b - t < 1 || getComputedStyle(n).visibility === 'hidden') continue
      if (!(l < f.right && rt > f.left && t < f.bottom && b > f.top)) continue
      let ok = 0, all = 0
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) { all++; const e = document.elementFromPoint(l + ((i + 0.5) * (rt - l)) / 12, t + ((j + 0.5) * (b - t)) / 12); if (e && n.contains(e)) ok++ }
      if (ok === all) continue // the box touches Jack's but nothing of it is covered (Jack's round, or the control sits above him)
      out.push({ label: (n.getAttribute('aria-label') || n.textContent || n.tagName).trim().slice(0, 40), allowed: allow.find((a) => n.matches(a.sel))?.name ?? null, tappable: ok / all })
    }
    return out
  }, [allow, scroll] as const)
  for (const h of hits) console.log('S21-JACK', tag, h.allowed ?? 'NONE', h.label, h.tappable.toFixed(2))
  expect(hits.filter((h) => !h.allowed || h.tappable <= 0.5).map((h) => `${h.label} (${h.allowed ?? 'no allowance'}, ${Math.round(h.tappable * 100)}% tappable)`), `controls under Jack ${tag}`).toEqual([])
}

/** assertJackHit at rest (scroll 0) and again at the end of the scroll, once Jack is back at rest (S29). Late content moves the end, so the end is re-applied for three frames. */
export async function assertJackHitRestAndEnd(page: Page, allow: JackAllow[], tag: string): Promise<void> {
  await settled(page)
  await assertJackHit(page, allow, `${tag} at rest`)
  await page.evaluate(async () => {
    const el = document.querySelector('.bt .scroll') as HTMLElement
    for (let i = 0; i < 3; i++) { el.scrollTop = el.scrollHeight; await new Promise((r) => requestAnimationFrame(() => r(null))) }
  })
  await assertJackHit(page, allow, `${tag} at end`, 'keep')
}

/** Exactly one `[data-hero]` in `.bt .scroll`, and its top is within 320 px of the scroll top. */
export async function assertHero(page: Page, maxTop = 320): Promise<void> {
  const r = await page.evaluate(() => {
    const sc = document.querySelector('.bt .scroll') as HTMLElement | null
    const heroes = sc ? Array.from(sc.querySelectorAll<HTMLElement>('[data-hero]')) : []
    const top = heroes[0] ? heroes[0].getBoundingClientRect().top - sc!.getBoundingClientRect().top + sc!.scrollTop : null
    return { n: heroes.length, top }
  })
  expect(r.n, 'tab roots carry exactly one [data-hero]').toBe(1)
  expect(r.top!, `the hero starts within ${maxTop} px of the scroll top`).toBeLessThanOrEqual(maxTop)
}

/** Each listed data-testid is present and sits lower than the one before it. */
export async function assertOrder(page: Page, testIds: string[]): Promise<void> {
  const tops = await page.evaluate((ids) => ids.map((id) => { const el = document.querySelector(`[data-testid="${id}"]`); return el ? el.getBoundingClientRect().top + (document.querySelector('.bt .scroll')?.scrollTop ?? 0) : null }), testIds)
  expect(tops.every((t) => t != null), `missing: ${testIds.filter((_, i) => tops[i] == null)}`).toBe(true)
  for (let i = 1; i < tops.length; i++) expect(tops[i]!, `${testIds[i]} must sit below ${testIds[i - 1]}`).toBeGreaterThan(tops[i - 1]!)
}

/** Every visible a / button / input / [role=button] inside `.bt` has a box of at least 44 x 44 (so text links are 44 tall too). Failures are listed by name and size. */
export async function assertTargets(page: Page, opts: { tabFloor?: number; skip?: string } = {}): Promise<void> {
  const tabFloor = opts.tabFloor ?? 43.5
  const bad = await page.evaluate(({ tabFloor, skip }) => {
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.bt a[href], .bt button, .bt input:not([type=hidden]), .bt [role=button]'))) {
      if (el.closest('[aria-hidden="true"], [inert]') || (skip && el.matches(skip))) continue
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none') continue
      if (r.width <= 1 || r.height <= 1) continue // visually-hidden file inputs and skip links
      const floor = el.closest('[data-testid="tabbar"]') ? tabFloor : 43.5
      if (r.width < floor || r.height < floor) out.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return out
  }, { tabFloor, skip: opts.skip })
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
  // shortcut: five tabs cannot be 44 px wide in 195 px; the tab bar gets the WCAG 2.2 AA floor (24 px) at narrow widths only. Upgrade if the bar ever scrolls or collapses.
  await assertTargets(page, { tabFloor: 23.5 })
  await assertNoWrappedButtons(page)
}

/** The whole page at 390 wide: the app scrolls inside `.bt .scroll`, so `fullPage` only sees one screen; the viewport is grown to the scroller's height for the shot (the tab bar then sits at the bottom). */
export async function fullPageShot(page: Page, path: string): Promise<void> {
  const h = await page.evaluate(() => (document.querySelector('.bt .scroll') as HTMLElement | null)?.scrollHeight ?? document.documentElement.scrollHeight)
  await page.setViewportSize({ width: 390, height: Math.min(h + 140, 6000) })
  await page.waitForTimeout(400)
  await page.screenshot({ path, animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
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
