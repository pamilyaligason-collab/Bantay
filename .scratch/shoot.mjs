// Today screenshots (synthetic data). Run: node .scratch/shoot.mjs against a running vite preview on :4398
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:4398'
const OUT = '.scratch/shots/L2-today'
const ALERT = { id: 's1', kind: 'storm', level: 'Signal 2', title: 'Tropical storm warning', what: 'Strong winds and heavy rain expected.', where: 'Cebu', when: 'Now', doNow: 'Stay indoors and charge your phone.', source: 'PAGASA', sourceUrl: 'https://www.pagasa.dost.gov.ph/', issuedAt: new Date().toISOString(), lat: 10.3, lon: 123.9 }
const putKv = (page, rows) => page.evaluate(async (rows) => { await new Promise((res, rej) => { const o = indexedDB.open('bantay'); o.onerror = () => rej(o.error); o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'); for (const r of rows) tx.objectStore('kv').put(r); tx.oncomplete = () => { o.result.close(); res() } } }) }, rows)
const browser = await chromium.launch()
for (const scheme of ['light', 'dark']) for (const storm of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, serviceWorkers: 'block' })
  await ctx.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
  const page = await ctx.newPage()
  await page.goto(BASE + '/#today'); await page.waitForTimeout(1500)
  await putKv(page, [{ key: 'profile.medicines', value: ['Losartan 8:00'] }, { key: 'safety.alerts', value: storm ? [ALERT] : [] }])
  await page.reload(); await page.waitForTimeout(2000)
  const h = await page.evaluate(() => { const s = document.querySelector('.scroll, main'); return s ? s.scrollHeight + 200 : 844 })
  await page.setViewportSize({ width: 390, height: Math.min(Math.max(h, 844), 4000) }); await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/today-${scheme}${storm ? '-storm' : ''}.png` })
  await ctx.close()
}
await browser.close()
