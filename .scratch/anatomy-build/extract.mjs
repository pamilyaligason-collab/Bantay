// Usage: node extract.mjs in.svg out.json   -> flat list of shapes in root user space (matrix applied), with resolved colours.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
const require = createRequire('D:/Claude/Bantay/.claude/worktrees/wf_1c91fcd8-d42-4/package.json')
const { chromium } = require('@playwright/test')
const [inp, out] = process.argv.slice(2)
let svg = readFileSync(inp, 'utf8')
const b = await chromium.launch(); const p = await b.newPage()
await p.setContent('<body style="margin:0"><div id="h">' + svg.replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/, '') + '</div></body>')
const items = await p.evaluate(() => {
  const root = document.querySelector('#h svg')
  if (!root.viewBox.baseVal.width) {
    const w = parseFloat(root.getAttribute('width')), h = parseFloat(root.getAttribute('height'))
    if (w && h) root.setAttribute('viewBox', '0 0 ' + w + ' ' + h)
    else { root.setAttribute('width', 2000); root.setAttribute('height', 2000); const bb = root.getBBox(); root.setAttribute('viewBox', [bb.x, bb.y, bb.width, bb.height].join(' ')) }
  }
  const vb = root.viewBox.baseVal
  root.setAttribute('width', vb.width); root.setAttribute('height', vb.height)
  const rs = root.getScreenCTM(); const rinv = rs.inverse()
  const gradColor = (id, depth = 0) => {
    const g = root.querySelector('#' + CSS.escape(id)); if (!g) return null
    let stops = [...g.querySelectorAll('stop')]
    if (!stops.length) { const h = (g.getAttribute('xlink:href') || g.getAttribute('href') || '').slice(1); if (h && depth < 5) return gradColor(h, depth + 1); return null }
    const cs = stops.map((s) => { const c = getComputedStyle(s); return [c.stopColor, +c.stopOpacity] })
    const rgb = cs.map(([c]) => c.match(/[\d.]+/g).map(Number))
    return 'rgb(' + [0, 1, 2].map((i) => Math.round(rgb.reduce((a, c) => a + c[i], 0) / rgb.length)).join(',') + ')'
  }
  const res = (v) => { if (!v || v === 'none') return null; const m = v.match(/url\(["']?#([^"')]+)/); if (m) return gradColor(m[1]); return v }
  const num = (e, a) => +(e.getAttribute(a) || 0)
  const toD = (e) => {
    const t = e.tagName.toLowerCase()
    if (t === 'path') return e.getAttribute('d')
    if (t === 'rect') { const x = num(e, 'x'), y = num(e, 'y'), w = num(e, 'width'), h = num(e, 'height'); return `M${x} ${y}h${w}v${h}h${-w}z` }
    if (t === 'circle' || t === 'ellipse') { const cx = num(e, 'cx'), cy = num(e, 'cy'); const rx = t === 'circle' ? num(e, 'r') : num(e, 'rx'), ry = t === 'circle' ? num(e, 'r') : num(e, 'ry'); return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z` }
    if (t === 'polygon' || t === 'polyline') { const pts = e.getAttribute('points').trim().split(/[\s,]+/).map(Number); let d = 'M' + pts[0] + ' ' + pts[1]; for (let i = 2; i < pts.length; i += 2) d += 'L' + pts[i] + ' ' + pts[i + 1]; return d + (t === 'polygon' ? 'z' : '') }
    if (t === 'line') return `M${num(e, 'x1')} ${num(e, 'y1')}L${num(e, 'x2')} ${num(e, 'y2')}`
    return null
  }
  const out = []
  let order = 0
  for (const e of root.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line')) {
    if (e.closest('defs,clipPath,mask,pattern,symbol,marker')) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    let hidden = false; let op = 1; const labels = []
    for (let a = e; a && a !== root; a = a.parentElement) {
      const c = getComputedStyle(a); if (c.display === 'none') hidden = true
      op *= +c.opacity
      const l = a.getAttribute('inkscape:label'); if (l) labels.push(l)
    }
    if (hidden) continue
    const d = toD(e); if (!d) continue
    const m = rinv.multiply(e.getScreenCTM())
    const bb = e.getBBox()
    const r = e.getBoundingClientRect()
    const fill = res(cs.fill); const stroke = res(cs.stroke)
    out.push({ i: order++, d, m: [m.a, m.b, m.c, m.d, m.e, m.f], fill, fo: +cs.fillOpacity * op, stroke, so: +cs.strokeOpacity * op, sw: stroke ? parseFloat(cs.strokeWidth) : 0, labels, tag: e.tagName, bbox: [r.left - rs.e, r.top - rs.f, r.right - rs.e, r.bottom - rs.f], id: e.id })
  }
  return { vb: [vb.x, vb.y, vb.width, vb.height], items: out }
})
await b.close()
writeFileSync(out, JSON.stringify(items))
console.log(inp.split('/').pop(), 'vb', items.vb.join(' '), 'shapes', items.items.length)
