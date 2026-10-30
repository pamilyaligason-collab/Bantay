import { expect, test, type Page } from '@playwright/test'
import { openMeteoFixture } from '../src/features/weather/fixture'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'

// Session 16 G-1 / N-4: at 200% text (195 px) no text on any screen may break one or two letters per line, light and dark.
// Session 15 checked only the first screen; the rain pill inside the weather card was missed. Clock frozen (ML-38).
const NOW = new Date('2026-10-30T09:00:00+08:00')
const ROUTES = ['#today', '#weather', '#health', '#health/meds', '#health/labs', '#health/body', '#health/library', '#health/visits', '#health/move',
  '#discover', '#discover/learn', '#discover/watch', '#family', '#family/plan', '#family/people', '#family/records', '#family/messages',
  '#safety', '#safety/warnings', '#safety/storms', '#safety/hazards', '#safety/cards', '#me']

test.use({ timezoneId: 'Asia/Manila', viewport: { width: 195, height: 844 } })

/** Text nodes drawn over more lines than they have words: a word was split mid-word ("one letter per line"). */
const broken = (page: Page) => page.evaluate(() => {
  const out: string[] = []
  const range = document.createRange()
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = (n.nodeValue ?? '').trim()
    if (t.replace(/\s+/g, '').length < 6) continue
    const words = t.split(/\s+/).length
    const el = n.parentElement
    if (!el || el.closest('[aria-hidden="true"], svg, .td-vh, .sr-only') || getComputedStyle(el).visibility === 'hidden') continue
    range.selectNodeContents(n)
    const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)))
    if (tops.size >= 2 && tops.size > words) out.push(`${t.slice(0, 30)} (${words} words, ${tops.size} lines)`)
  }
  return out
})

for (const scheme of ['light', 'dark'] as const) {
  test(`no letter-per-line text at 195 px, ${scheme}`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.clock.setFixedTime(NOW)
    await skipOnboarding(page)
    await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Lloyd' }])))
    await mock(page)
    // rain from 10 AM to 5 PM: the "Rain likely" action pill of refs/1.png
    await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: openMeteoFixture({ now: NOW, temp: 25, humidity: 80, feels: 31, code: 2, hourlyProb: (h) => (h >= 10 && h <= 17 ? 80 : 10) }) }))
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/#today')
    await expect(page.getByRole('region', { name: 'Weather' })).toBeVisible()
    await expect(page.locator('.td-act-box')).toBeVisible()
    const found: string[] = []
    for (const r of ROUTES) {
      await page.evaluate((h) => { location.hash = h }, r)
      await page.waitForTimeout(600) // lazy screens and the forecast settle
      for (const b of await broken(page)) found.push(`${r}: ${b}`)
    }
    expect(found).toEqual([])
  })
}
