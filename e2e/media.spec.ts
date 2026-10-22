import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Learn media: Health > Videos. Before a tap only the still picture (i.ytimg.com) may load; no YouTube page or player request. Synthetic data only.
// The Today "Video of the day" card is not mounted on Today (Lloyd's Today order, e2e/today.spec.ts), so it is covered by src/features/media/media.test.tsx.
test.use({ viewport: { width: 390, height: 844 } })

for (const scheme of ['light', 'dark'] as const) {
  test(`Health > Videos: no YouTube request before the tap, then the no-cookie player (${scheme}, axe)`, async ({ page }) => {
    const hits: string[] = []
    page.on('request', (r) => { if (/youtube|ggpht/.test(new URL(r.url()).hostname)) hits.push(r.url()) })
    await page.route(/youtube-nocookie\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>player stub</p>' }))
    await page.emulateMedia({ colorScheme: scheme })
    await skipOnboarding(page)
    await page.goto('/#health/videos')
    await expect(page.getByRole('heading', { level: 1, name: 'Videos' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play Hands-only CPR' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Open in YouTube/ }).first()).toHaveAttribute('href', /youtube\.com\/watch\?v=/)
    expect(hits).toEqual([])
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    const box = (await page.getByRole('button', { name: 'Play Hands-only CPR' }).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(56)

    await page.getByRole('button', { name: 'Play Hands-only CPR' }).click()
    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/M4ACYp75mjU"]')).toBeVisible()
    expect(hits.every((u) => u.includes('youtube-nocookie.com'))).toBe(true)
    expect((await new AxeBuilder({ page }).include('main').exclude('iframe').analyze()).violations.map((v) => v.id)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
