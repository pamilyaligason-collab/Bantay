import { expect, test } from '@playwright/test'
import { mock } from './health-auth-mock'
import { seed } from './fixtures/s16/health'
import { skipOnboarding } from './helpers'
import { assertNoSideways, settled } from './v13'

// Session 21 lane P item 5 (D-128): the Family health section link wraps under its title on the left, never under Jack's column, from 320 to 360 wide, 667 to 900 tall and with 0 to 2 pins.
// Same fixture as e2e/s21-h-health.auth.spec.ts: signed in as a made-up member `me` with one carer link `ma`, frozen clock, invented readings.
const NOW = new Date(2026, 9, 26, 10, 20, 0)
test.use({ reducedMotion: 'reduce' })

const PINS: Record<string, string[]> = { '0': [], '1': ['weight'], '2': ['weight', 'heart_rate'] } // kv health.pins; Weight and Pulse are the shortest tiles

for (const width of [320, 344, 360]) {
  for (const height of [667, 760, 900]) {
  for (const n of ['0', '1', '2']) {
    test(`Family health: All updates is under the title, 44 px tall and clear of Jack at ${width} x ${height} with ${n} pins`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.clock.setFixedTime(NOW)
      await skipOnboarding(page)
      await mock(page)
      await page.goto('/#health')
      await expect(page.locator('h1')).toHaveText('Health')
      await seed(page, 'bantay-health', { people: [{ id: 'me', name: 'Rey' }], readings: [{ personId: 'me', takenAt: new Date(NOW.getTime() - 86_400_000).toISOString(), test: 'weight', value: 70, unit: 'kg' }, { personId: 'me', takenAt: new Date(NOW.getTime() - 86_400_000).toISOString(), test: 'heart_rate', value: 72, unit: 'bpm' }] })
      await seed(page, 'bantay', { kv: [{ key: 'health.pins', value: PINS[n] }] })
      await page.reload()
      await expect(page.getByTestId('bodyhero')).toBeVisible()
      await expect(page.getByTestId('pinned').locator('.pt')).toHaveCount(PINS[n]!.length)
      const link = page.getByTestId('family-health').getByRole('link', { name: 'All updates' })
      await expect(link).toBeVisible()
      await settled(page)
      for (const at of ['rest', 'centre'] as const) {
        if (at === 'rest') await page.evaluate(() => { (document.querySelector('.bt .scroll') as HTMLElement).scrollTop = 0 })
        else await link.evaluate((e) => e.scrollIntoView({ block: 'center' }))
        const m = await page.evaluate(async () => {
          for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => r(null)))
          const a = document.querySelector('[data-testid="family-health"] .sec-h a')!.getBoundingClientRect()
          const t = document.querySelector('[data-testid="family-health"] .sec-h h2')!.getBoundingClientRect()
          const fab = document.querySelector('.sh-jackfab')
          const fr = fab?.getBoundingClientRect()
          const cy = fr ? (fr.top + fr.bottom) / 2 : 0
          const f = !fab ? null : fab.hasAttribute('data-peek') ? { left: innerWidth - 48, right: innerWidth, top: cy - 44, bottom: cy + 44 } : fr! // a peeking button shows only its edge strip
          const hit = f ? Math.min(a.right, f.right) > Math.max(a.left, f.left) && Math.min(a.bottom, f.bottom) > Math.max(a.top, f.top) : false
          return { a: { left: a.left, right: a.right, top: a.top, height: a.height }, titleLeft: t.left, titleBottom: t.bottom, hit, fab: !!fab, vw: innerWidth }
        })
        expect(m.a.height, `${at}: a 44 px target`).toBeGreaterThanOrEqual(44)
        expect(m.a.left, `${at}: the link starts at the title's left edge`).toBeLessThanOrEqual(m.titleLeft + 8)
        expect(m.a.top + m.a.height / 2, `${at}: the link sits under the title, not beside it`).toBeGreaterThanOrEqual(m.titleBottom)
        expect(m.a.right, `${at}: inside the screen`).toBeLessThanOrEqual(m.vw)
        expect(m.fab, `${at}: the Jack button is on the screen, so the check below means something`).toBe(true)
        expect(m.hit, `${at}: not under the Jack button`).toBe(false)
      }
      await assertNoSideways(page)
    })
  }
 }
}
