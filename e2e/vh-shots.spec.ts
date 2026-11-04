import { test } from '@playwright/test'
import { mock } from './health-auth-mock'
import { skipOnboarding } from './helpers'
import { full } from './fixtures/s16/health'
import { FIXED_CLOCKS, setScheme } from './v13'

// Lane VH evidence: full-page 390 and 360 shots, light and dark, of the Health screens. Only with VH_SHOTS=<dir>.
test.use({ baseURL: `http://localhost:${Number(process.env.PW_PORT ?? 4317) + 500}`, serviceWorkers: 'block' })

for (const w of [390, 360]) {
  test(`vh shots ${w}`, async ({ page }) => {
    test.skip(!process.env.VH_SHOTS, 'evidence only')
    test.setTimeout(240_000)
    await page.setViewportSize({ width: w, height: 844 })
    await skipOnboarding(page)
    await mock(page, FIXED_CLOCKS[1])
    await full(page, FIXED_CLOCKS[1])
    const dir = process.env.VH_SHOTS!
    const only = process.env.VH_ONLY?.split(',')
    for (const [name, hash] of [['health', '#health'], ['readings', '#health/readings'], ['labs', '#health/labs'], ['meds', '#health/meds'], ['visits', '#health/visits'], ['move', '#health/move'], ['body', '#health/body'], ['member', '#health/member/ma']] as const) {
      if (only && !only.includes(name)) continue
      await page.setViewportSize({ width: w, height: 844 })
      await page.goto(`/${hash}`)
      await page.locator('h1').first().waitFor()
      await page.waitForTimeout(500)
      const h = await page.locator('.bt .scroll').evaluate((e) => e.scrollHeight)
      await page.setViewportSize({ width: w, height: Math.min(4000, h + 160) })
      await page.mouse.move(0, 0)
      for (const s of ['light', 'dark'] as const) {
        await setScheme(page, s)
        await page.screenshot({ path: `${dir}/${name}-${w}-${s}.png`, animations: 'disabled' })
      }
    }
  })
}
declare const process: { env: Record<string, string | undefined> }
