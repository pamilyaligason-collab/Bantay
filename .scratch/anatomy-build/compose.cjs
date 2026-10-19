// Builds public/anatomy/body.svg (sprite, one <g id> per layer) from extracted JSON shapes.
const fs = require('fs'); const path = require('path'); const svgpath = require('svgpath')
const J = (n) => JSON.parse(fs.readFileSync(path.join('..', 'j', n + '.json'), 'utf8'))
const src = {
  circ: J('Circulatory_System_no_tags'), skel: J('Human_skeleton_front_no-text_no-color'), dig: J('Digestive_system_diagram_edit'),
  resp: J('Respiratory_system_complete_gl'), uri: J('Illu_urinary_system'), brain: J('Brain_diagram_without_text'), skin: J('Skin'),
  endo: J('Endocrine_central_nervous_en'), musc: J('musc')
}
const cfg = require('./layers.cjs')
const rgb = (s) => (s || '').match(/[\d.]+/g)?.slice(0, 3).map(Number)
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
const f1 = (n) => +n.toFixed(1)
const groups = {}; const order = []; const report = {}
const bboxOf = (items) => items.reduce((b, it) => [Math.min(b[0], it.bbox[0]), Math.min(b[1], it.bbox[1]), Math.max(b[2], it.bbox[2]), Math.max(b[3], it.bbox[3])], [1e9, 1e9, -1e9, -1e9])
for (const L of cfg.layers) {
  const s = L.src ? src[L.src] : { items: [] }; const items = s.items.filter((it) => L.keep(it))
  // fit: scale k and translation so that source anchor point maps to dst anchor point
  const k = L.k ?? (L.fitH ? L.fitH[1] / (L.fitH[0][3] - L.fitH[0][1]) : 1)
  const [ax, ay] = L.from || [0, 0]; const [bx, by] = L.to || [0, 0]
  const ky = L.ky ?? k; const tx = bx - ax * k, ty = by - ay * ky
  L.map = (x, y) => [x * k + tx, y * ky + ty]
  const runs = []; let n = 0; let bytes = 0
  const bb = [1e9, 1e9, 1e9 * -1, -1e9]
  for (const it of items) {
    const st = L.style ? L.style(it) : null
    if (st === false) continue
    const fc = rgb(it.fill); const sc = rgb(it.stroke)
    let cls, fo = it.fo, stroke = null, sw = 0
    if (st) { cls = st.fill; fo = st.fo ?? fo }
    else if (fc) { const l = lum(fc); const th = L.th || [0.2, 0.45, 0.7, 0.88]; let lv = th.findIndex((t) => l < t); if (lv < 0) lv = 4; cls = (L.blue && fc[2] > fc[0] + 25 ? 'b' : 'a') + lv }
    if (!cls && !sc) continue
    const hasSt = st && st.stroke
    if (hasSt) { stroke = st.stroke; sw = f1(Math.max(0.1, (st.sw ?? it.sw) * k * Math.hypot(it.m[0], it.m[1]))) } else if (sc && (it.sw || 0) > 0 && !(it.sw * k * (L.swMul || 1) < 0.05)) { const l = lum(sc); const th = L.th || [0.2, 0.45, 0.7, 0.88]; let lv = th.findIndex((t) => l < t); if (lv < 0) lv = 4; stroke = (L.blue && sc[2] > sc[0] + 25 ? 'b' : 'a') + lv; sw = f1(Math.max(0.12, it.sw * k * (L.swMul || 1) * Math.hypot(it.m[0], it.m[1]))) }
    if (!cls && !stroke) continue
    const m = it.m; const M = [m[0] * k, m[1] * ky, m[2] * k, m[3] * ky, m[4] * k + tx, m[5] * ky + ty]
    let d
    try { d = svgpath(it.d).matrix(M).abs().round(L.prec ?? 1).toString() } catch (e) { console.error('path fail', L.id, it.i, e.message); continue }
    // size filter on frame bbox
    const w = (it.bbox[2] - it.bbox[0]) * k, h = (it.bbox[3] - it.bbox[1]) * ky
    if (!stroke && w * h < (L.minArea ?? 0.05)) continue
    if (stroke && Math.max(w, h) < 0.4 && !cls) continue
    const key = [cls || '', Math.round((fo ?? 1) * 100), stroke || '', sw].join('|')
    const last = runs[runs.length - 1]
    if (last && last.key === key) last.d += d
    else runs.push({ key, cls, fo, stroke, sw, d, rule: it.d.length > 0 && L.evenodd ? 'evenodd' : null })
    n++
    const b2 = [it.bbox[0] * k + tx, it.bbox[1] * ky + ty, it.bbox[2] * k + tx, it.bbox[3] * ky + ty]
    bb[0] = Math.min(bb[0], b2[0]); bb[1] = Math.min(bb[1], b2[1]); bb[2] = Math.max(bb[2], b2[2]); bb[3] = Math.max(bb[3], b2[3])
  }
  let g = ''
  for (const r of runs) {
    let a = `<path d="${r.d}"`
    const styles = []
    if (r.cls) styles.push(`fill:var(--${r.cls})`); else styles.push('fill:none')
    if (r.stroke) styles.push(`stroke:var(--${r.stroke});stroke-width:${r.sw};stroke-linecap:round;stroke-linejoin:round`)
    a += ` style="${styles.join(';')}"`
    if (r.cls && r.fo != null && r.fo < 0.995) a += ` fill-opacity="${+r.fo.toFixed(2)}"`
    a += '/>'
    g += a
  }
  if (L.raw) g += L.raw
  if (!groups[L.id]) { groups[L.id] = ''; order.push(L.id) }
  groups[L.id] += g; bytes = g.length
  report[L.id + '/' + L.src] = { shapes: n, runs: runs.length, bytes, bbox: bb.map(f1) }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 0 140 310">\n${order.map((id) => '<g id="' + id + '">' + groups[id] + '</g>').join('\n')}\n</svg>\n`
fs.writeFileSync(process.argv[2] || 'body.svg', svg)
console.log(JSON.stringify(report, null, 0).replace(/\},/g, '},\n'))
console.log('total', svg.length, 'gz', require('zlib').gzipSync(svg).length)
// anchors
const A = {}
for (const L of cfg.layers) if (L.anchors) for (const [id, pts] of Object.entries(L.anchors)) A[id] = pts.map(([x, y]) => L.map(x, y).map(f1))
fs.writeFileSync('anchors.json', JSON.stringify(A))
