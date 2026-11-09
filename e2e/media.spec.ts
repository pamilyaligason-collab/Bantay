import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Learn media: Discover > Watch (was Health > Videos; #health/videos redirects here). Before a tap only the still picture (i.ytimg.com) may load; no YouTube page or player request. Synthetic data only.
// The Today "Video of the day" card is not mounted on Today (the owner's Today order, e2e/today.spec.ts), so it is covered by src/features/media/media.test.tsx.
test.use({ viewport: { width: 390, height: 844 } })
for (const scheme of ['light', 'dark'] as const) {
  test(`Health > Health videos: no YouTube request before the tap, then the no-cookie player (${scheme}, axe)`, async ({ page }) => {
    const hits: string[] = []
    page.on('request', (r) => { if (/youtube|ggpht/.test(new URL(r.url()).hostname)) hits.push(r.url()) })
    await page.route(/youtube-nocookie\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>player stub</p>' }))
    await page.emulateMedia({ colorScheme: scheme })
    await skipOnboarding(page)
    await page.setViewportSize({ width: 390, height: 1700 }) // tall: axe reads only the text inside the viewport, so a card cut by the fold would look like a name that has extra words
    await page.goto('/#health')
    const section = page.getByTestId('health-videos')
    await section.scrollIntoViewIfNeeded()
    const card = section.locator('button.md').first()
    await expect(card).toBeVisible()
    expect(hits).toEqual([])
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await card.click() // the first tap is the play tap (S25)
    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/"]')).toBeVisible()
    expect(hits.every((u) => u.includes('youtube-nocookie.com'))).toBe(true)
    expect((await new AxeBuilder({ page }).include('main').exclude('iframe').analyze()).violations.map((v) => v.id)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
