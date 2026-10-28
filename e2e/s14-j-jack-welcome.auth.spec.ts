import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Session 14 lane J: Jack Jack waves on the welcome screen (D-91). Runs on the auth build; all Supabase traffic is mocked, nothing real.
const API = 'https://bantay-test.supabase.test'
const FAMILY = [
  { personId: 'p-lola', displayName: 'Lola Rosa', handle: 'lola', provider: 'pin', initials: 'LR' },
  { personId: 'p-ate', displayName: 'Ate Maria', handle: null, provider: 'google', initials: 'AM' }
]
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

async function open(page: Page) {
  await page.route(`${API}/**`, (route) => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 404, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' }))
  await page.addInitScript((fam) => localStorage.setItem('bantay.family', JSON.stringify(fam)), FAMILY)
  await page.goto('/')
}

for (const [label, css] of [['100%', ''], ['200%', 'html { font-size: 200% !important; }']] as const) {
  test(`welcome at 375 px and ${label} text: Jack waves hello, an alt, no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page)
    await expect(page.getByRole('heading', { name: "Hi! I'm Jack Jack." })).toBeVisible()
    if (css) await page.addStyleTag({ content: css })
    const img = page.locator('.wl-hello img.jack')
    await expect(img).toHaveCount(1)
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true)
    expect(await img.getAttribute('alt')).toBe('Jack Jack waving hello')
    expect(await img.getAttribute('width')).toBe('150')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
    if (process.env.S14_SHOTS && !css) {
      mkdirSync(process.env.S14_SHOTS, { recursive: true })
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `${process.env.S14_SHOTS}/welcome.png`, animations: 'disabled', caret: 'hide' })
    }
  })
}
