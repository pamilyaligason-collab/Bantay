// node .scratch/anatomy-shoot.mjs <port> <outDir> [systems,comma] [grid]
// 390x844 light and dark screenshots of #health/body for each system, plus one part sheet.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const [port, out, sysArg, partArg] = process.argv.slice(2)
const systems = (sysArg || 'skeleton,muscles,heart,lungs,brain,digestion,kidneys,skin,hormones').split(',')
const labels = { skeleton: 'Skeleton', muscles: 'Muscles', heart: 'Heart and blood', lungs: 'Lungs', brain: 'Brain and nerves', digestion: 'Digestion', kidneys: 'Kidneys and bladder', skin: 'Skin', hormones: 'Hormones' }
mkdirSync(out, { recursive: true })
const b = await chromium.launch()
for (const scheme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, serviceWorkers: 'block' })
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
  await p.goto(`http://localhost:${port}/#health/body`)
  await p.waitForSelector('.an-chip')
  for (const s of systems) {
    await p.getByRole('button', { name: labels[s], exact: true }).click()
    await p.waitForTimeout(450)
    await p.screenshot({ path: `${out}/${s}-${scheme}.png` })
  }
  if (partArg) {
    const [sys, part] = partArg.split(':')
    await p.getByRole('button', { name: labels[sys], exact: true }).click()
    await p.waitForTimeout(300)
    await p.locator(`[data-part="${part}"]`).first().click()
    await p.waitForTimeout(400)
    await p.screenshot({ path: `${out}/sheet-${part}-${scheme}.png` })
  }
  await ctx.close()
}
await b.close()
