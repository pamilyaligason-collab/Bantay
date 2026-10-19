// Today screenshots (synthetic data). Run: node .scratch/shoot.mjs against a running vite preview on :4398
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:4398'
const OUT = '.scratch/shots/L2-today'
const base = { level: null, what: '', when: 'Now', doNow: '', source: 'PAGASA', sourceUrl: null, issuedAt: new Date().toISOString(), lat: null, lon: null, bulletin: '' }
const TCWS = { ...base, id: 't1', kind: 'tcws', level: 'Signal No. 2', title: 'Tropical cyclone wind signal 2', what: 'Strong winds and heavy rain expected.', where: 'Mindanao', doNow: 'Stay indoors and charge your phone.' }
const GDACS = { ...base, id: 'gdacs-TC-1001', kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone Sample', what: 'Tropical cyclone, 120 km/h.', where: 'Sample, Philippine Sea', source: 'GDACS', lat: 14, lon: 128 }
const SCEN = { calm: [], alert: [TCWS], storm: [GDACS], plan: [] }
const putPlan = (page) => page.evaluate(async () => { await new Promise((res, rej) => { const o = indexedDB.open('bantay-family'); o.onerror = () => rej(o.error); o.onsuccess = () => { const tx = o.result.transaction('tasks', 'readwrite'); const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; tx.objectStore('tasks').put({ clientId: 'c1', title: 'Buy maintenance medicines', due: day, assigneePersonId: null, done: false }); tx.oncomplete = () => { o.result.close(); res() } } }) })
const putKv = (page, rows) => page.evaluate(async (rows) => { await new Promise((res, rej) => { const o = indexedDB.open('bantay'); o.onerror = () => rej(o.error); o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'); for (const r of rows) tx.objectStore('kv').put(r); tx.oncomplete = () => { o.result.close(); res() } } }) }, rows)
const browser = await chromium.launch()
for (const scheme of ['light', 'dark']) for (const scen of Object.keys(SCEN)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, serviceWorkers: 'block' })
  await ctx.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
  const page = await ctx.newPage()
  await page.goto(BASE + '/#today'); await page.waitForTimeout(1500)
  await putKv(page, [{ key: 'profile.medicines', value: ['Losartan 8:00'] }, { key: 'safety.alerts', value: SCEN[scen] }])
  if (scen === 'plan') await putPlan(page)
  await page.reload(); await page.waitForTimeout(2000)
  const h = await page.evaluate(() => { const s = document.querySelector('.scroll, main'); return s ? s.scrollHeight + 200 : 844 })
  await page.setViewportSize({ width: 390, height: Math.min(Math.max(h, 844), 4000) }); await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/today-${scheme}-${scen}.png` })
  await ctx.close()
}
await browser.close()
