import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
const port = process.argv[2]
const b = await chromium.launch(); let bad = 0
for (const scheme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, serviceWorkers: 'block' })
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
  await p.goto(`http://localhost:${port}/#health/body`); await p.waitForSelector('.an-chip')
  for (const name of ['Skeleton', 'Muscles', 'Heart and blood', 'Lungs', 'Brain and nerves', 'Digestion', 'Kidneys and bladder', 'Skin', 'Hormones']) {
    await p.getByRole('button', { name, exact: true }).click(); await p.waitForTimeout(300)
    const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    for (const v of r.violations) { bad++; console.log(scheme, name, v.id, v.nodes.slice(0, 2).map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message || '')).join(' || ')) }
  }
  await p.locator('.an-row').first().click(); await p.waitForTimeout(300)
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa']).analyze()
  for (const v of r.violations) { bad++; console.log(scheme, 'sheet', v.id) }
  await ctx.close()
}
await b.close(); console.log(bad ? 'AXE FAIL ' + bad : 'AXE OK'); process.exit(bad ? 1 : 0)
