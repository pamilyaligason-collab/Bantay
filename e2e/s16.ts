import { expect, type Page } from '@playwright/test'

// S16 shared helpers (contracts.md C-11). Lanes import from here; they add their own fixtures under e2e/fixtures/s16/.

/** Every screen the redesign touches or redirects to (C-3). The button gate and the redirect spec run on this list. */
export const ROUTES: string[] = [
  '#today', '#weather',
  '#health', '#health/meds', '#health/labs', '#health/body', '#health/visits', '#health/move', '#health/nutrition', '#health/refill',
  '#discover', '#discover/learn', '#discover/learn/library', '#discover/learn/together', '#discover/watch', '#discover/listen', '#discover/play', '#discover/news',
  '#family', '#family/papers', '#family/messages', '#family/plan',
  '#safety', '#safety/warnings', '#safety/storms', '#safety/hazards', '#safety/cards',
  '#me', '#me/alerts', '#me/display', '#me/family', '#me/phone', '#me/signin', '#me/about',
  '#privacy', '#sharing', '#medid', '#notif'
]

/** Every `.btn` has a one-line text box (L-6: no button wraps at 360 px). Hidden buttons are skipped. */
export async function assertNoWrappedButtons(page: Page): Promise<void> {
  const wrapped = await page.evaluate(() => {
    const out: string[] = []
    for (const b of Array.from(document.querySelectorAll<HTMLElement>('.btn'))) {
      const box = b.getBoundingClientRect()
      if (box.width === 0 || box.height === 0 || getComputedStyle(b).visibility === 'hidden') continue
      const size = parseFloat(getComputedStyle(b).fontSize) || 16
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      let top = Infinity, bottom = -Infinity
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.nodeValue?.trim()) continue
        range.selectNodeContents(n)
        for (const r of Array.from(range.getClientRects())) { if (r.height === 0) continue; top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom) }
      }
      if (bottom - top > size * 1.6) out.push((b.textContent ?? '').trim().slice(0, 40))
    }
    return out
  })
  expect(wrapped, 'buttons that wrap to a second line').toEqual([])
}

/** The page is no taller than its D-102 budget (390 px wide, set the viewport first). */
export async function assertBudget(page: Page, max: number): Promise<void> {
  const h = await page.evaluate(() => (document.scrollingElement as Element).scrollHeight)
  expect(h, `page height ${h} px over the ${max} px budget`).toBeLessThanOrEqual(max)
}

/** Light or dark for the whole page: the media query and the saved-theme attribute agree. */
export async function setScheme(page: Page, s: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: s })
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), s)
}

/** Live 2.6.1 reference shot for a tab (C-8). */
export const liveShot = (tab: string, s: 'light' | 'dark') => `docs/session-16/shots/live/${tab}-${s}.png`

/** Fixed clocks for anything that depends on the day (ML-38): just before and just after local midnight (Manila). */
export const FIXED_CLOCKS = ['2026-10-30T23:30:00+08:00', '2026-10-31T00:30:00+08:00'] as const
