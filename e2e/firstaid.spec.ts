import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Safety: IDs and insurance row, Act early first-aid grid. Nothing may be requested from YouTube before the play tap. Synthetic data only.
test.use({ viewport: { width: 390, height: 844 } })

const axe = async (page: import('@playwright/test').Page) =>
  (await new AxeBuilder({ page }).include('main').exclude('iframe').analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)

for (const scheme of ['light', 'dark'] as const) {
  test(`Safety: IDs row under Medical ID, Act early grid (${scheme}, axe)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await skipOnboarding(page)
    await page.goto('/#safety')
    const y = async (l: ReturnType<typeof page.locator>) => (await l.first().boundingBox())!.y
    const ids = page.getByRole('link', { name: /^IDs and insurance/ })
    await expect(ids).toHaveAttribute('href', '#docs')
    await expect(ids).toContainText('Add your PhilHealth, Senior ID, HMO')
    expect(await y(ids)).toBeGreaterThan(await y(page.getByRole('link', { name: 'Medical ID' })))
    expect((await ids.boundingBox())!.width).toBeGreaterThan(330)
    await expect(page.getByRole('navigation', { name: 'Safety topics' }).getByRole('link', { name: /IDs and insurance/ })).toHaveCount(0)
    await expect(page.getByText('Call 911 first if someone cannot breathe, cannot speak, or will not wake up.')).toBeVisible()
    const grid = page.getByRole('navigation', { name: 'Act early' })
    await expect(grid.getByRole('link')).toHaveCount(17)
    const stroke = grid.getByRole('link', { name: /^Stroke/ })
    await stroke.scrollIntoViewIfNeeded()
    expect((await stroke.boundingBox())!.width).toBeGreaterThan(330)
    expect(await axe(page)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test(`Act early opens a topic, no YouTube before play (${scheme}, axe)`, async ({ page }) => {
    const hits: string[] = []
    page.on('request', (r) => { if (/youtube|ggpht/.test(new URL(r.url()).hostname)) hits.push(r.url()) })
    await page.route(/youtube-nocookie\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>player stub</p>' }))
    await page.emulateMedia({ colorScheme: scheme })
    await skipOnboarding(page)
    await page.goto('/#safety')
    const grid = page.getByRole('navigation', { name: 'Act early' })
    await grid.getByRole('link', { name: /^Choking/ }).scrollIntoViewIfNeeded()
    await grid.getByRole('link', { name: /^Choking/ }).click()
    await expect(page).toHaveURL(/#safety\/firstaid\/choking$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Choking (adult)' })).toBeVisible()
    const n = await page.getByRole('list', { name: 'Steps' }).getByRole('listitem').count()
    expect(n).toBeGreaterThanOrEqual(3)
    expect(n).toBeLessThanOrEqual(5)
    await expect(page.getByRole('heading', { name: 'Call 911 when' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Learn more' })).toBeVisible()
    await expect(page.getByText('General first-aid guidance, not a diagnosis.')).toBeVisible()
    const play = page.getByRole('button', { name: /^Play What to do when an adult is choking/ })
    await expect(play).toBeVisible()
    expect((await play.boundingBox())!.height).toBeGreaterThanOrEqual(56)
    expect(hits).toEqual([])
    expect(await axe(page)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await play.click()
    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/8R3RWC-xx1I"]')).toBeVisible()
    expect(hits.every((u) => u.includes('youtube-nocookie.com'))).toBe(true)
    await page.getByRole('link', { name: 'Back to Safety' }).click()
    await expect(page.locator('h1')).toHaveText('Safety')
  })
}

test('a topic with no video (dengue) shows no player', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#safety/firstaid/dengue-warning-signs')
  await expect(page.getByRole('heading', { level: 1, name: 'Dengue warning signs' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Play/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /WHO: Dengue/ })).toHaveAttribute('href', /who\.int/)
})
