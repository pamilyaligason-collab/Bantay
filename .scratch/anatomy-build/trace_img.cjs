// node trace_img.cjs <heightPx> <stepsJSON asc|auto:n> <out.frag> : muscles jpg -> posterized opaque level paths in frame coords (height 306, top 2, axis x=60)
const J = require('jimp'); const potrace = require('potrace'); const fs = require('fs'); const svgpath = require('svgpath')
const [hS, stepsS, out, contrastS] = process.argv.slice(2)
const H2 = +hS
J.read('../dl3/Human_muscle_system_simple_diagram_unlabeled.jpg').then(async (img) => {
  const { width: W, height: H, data } = img.bitmap
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) { const i = (y * W + x) * 4; if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) } }
  img.crop(x0, y0, x1 - x0, y1 - y0).resize(J.AUTO, H2).greyscale()
  if (contrastS) img.contrast(+contrastS)
  const w2 = img.bitmap.width
  const vals = []; const d2 = img.bitmap.data
  for (let i = 0; i < d2.length; i += 16) if (d2[i] < 245) vals.push(d2[i])
  vals.sort((a, b) => a - b)
  const q = (p) => vals[Math.floor(p * (vals.length - 1))]
  console.error('quantiles 2,10,30,50,70,90', [0.02, 0.1, 0.3, 0.5, 0.7, 0.9].map(q).join(' '))
  let steps
  if (stepsS.startsWith('auto:')) { const ps = stepsS.slice(5).split(',').map(Number); steps = ps.map(q) } else steps = JSON.parse(stepsS)
  console.error('steps', steps.join(','))
  await img.writeAsync(out + '.png')
  potrace.posterize(out + '.png', { steps, color: 'black', background: 'transparent', turdSize: 8, optTolerance: 0.5, alphaMax: 1.1 }, (e, svg) => {
    if (e) throw e
    let paths = [...svg.matchAll(/<path[^>]*? d="([^"]+)"/g)].map((m) => m[1])
    if (paths.length === steps.length + 1) paths = paths.slice(1)
    const s = 306 / H2
    const lv = { 5: ['a4', 'a3', 'a2', 'a1', 'a0'], 4: ['a4', 'a3', 'a1', 'a0'], 3: ['a4', 'a2', 'a0'] }[paths.length]
    const frag = paths.map((d, j) => `<path d="${svgpath(d).scale(s).translate(50 - (w2 * s) / 2, 2).abs().round(1).toString()}" style="fill:var(--${lv[j]})" fill-rule="evenodd"/>`).join('')
    fs.writeFileSync(out, frag); console.log('muscles frag bytes', frag.length, 'gz', require('zlib').gzipSync(frag).length, 'paths', paths.length)
  })
})
