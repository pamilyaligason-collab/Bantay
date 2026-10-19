// node .scratch/anatomy-check.mjs <port> : hit sizes, sideways scroll, chips row, crossfade, reduced motion, art loaded
import { chromium } from '@playwright/test'
const port = process.argv[2]
const b = await chromium.launch()
const ids = ['Skeleton', 'Muscles', 'Heart and blood', 'Lungs', 'Brain and nerves', 'Digestion', 'Kidneys and bladder', 'Skin', 'Hormones']
let bad = 0
const fail = (m) => { bad++; console.log('FAIL', m) }
for (const [w, h] of [[390, 844], [360, 640]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', reducedMotion: w === 360 ? 'reduce' : 'no-preference' })
  const p = await ctx.newPage()
  const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('requestfailed', (r) => errs.push('reqfail ' + r.url()))
  await p.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
  await p.goto(`http://localhost:${port}/#health/body`)
  await p.waitForSelector('.an-chip')
  for (const name of ids) {
    await p.getByRole('button', { name, exact: true }).click(); await p.waitForTimeout(260)
    const hits = await p.$$eval('.an-hit', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.part, Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.top)] }))
    for (const [id, bw, bh] of hits) if (bw < 44 || bh < 44) fail(`${w} ${name} ${id} ${bw}x${bh}`)
    const fig = await p.$eval('.an-svg', (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(r.width)] })
    const tab = await p.$eval('.tabs, nav', (e) => Math.round(e.getBoundingClientRect().top)).catch(() => null)
    console.log(w + 'x' + h, name.padEnd(20), 'hits', hits.length, 'fig top/bottom/width', fig.join('/'), 'tabbar top', tab)
    if (fig[1] > h) fail(`${w} ${name} figure bottom ${fig[1]} below viewport ${h}`)
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth + (document.querySelector('.scroll')?.scrollWidth - document.querySelector('.scroll')?.clientWidth || 0))
    if (ov > 0) fail(`${w} ${name} sideways scroll ${ov}`)
  }
  const tr = await p.$eval('.an-layer', (e) => getComputedStyle(e).transitionDuration)
  console.log(w, 'layer transition', tr, w === 360 ? '(reduced motion, expect 0s)' : '(expect 0.18s)')
  if (w === 360 && !/^0s/.test(tr)) fail('reduced motion still animates')
  if (w === 390 && !/0\.18s/.test(tr)) fail('crossfade missing')
  const snap = await p.$eval('.an-chips', (e) => [getComputedStyle(e).scrollSnapType, getComputedStyle(e).overflowX, e.scrollWidth > e.clientWidth])
  console.log(w, 'chips', snap.join(' '))
  const art = await p.evaluate(async () => { const r = await fetch('/anatomy/body.svg'); return [r.status, (await r.text()).length] })
  console.log(w, 'sprite', art.join(' '), 'errors', errs.length ? errs.join('|') : 'none')
  if (errs.length) fail('console errors ' + errs.join('|'))
  await ctx.close()
}
await b.close()
console.log(bad ? `FAILED ${bad}` : 'ALL OK')
process.exit(bad ? 1 : 0)
