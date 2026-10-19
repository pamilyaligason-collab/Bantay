// node trace.cjs body.svg <groupId> <ppu> <stepsJSON asc> <out.frag> [includeBody]
// Rasterises one sprite group in grey levels and re-traces it with potrace into a few opaque level paths (small, smooth).
const fs = require('fs'); const { chromium } = require('D:/Claude/Bantay/.claude/worktrees/wf_1c91fcd8-d42-4/node_modules/@playwright/test')
const potrace = require('potrace'); const svgpath = require('svgpath')
const [sprite, id, ppuS, stepsS, out] = process.argv.slice(2)
const ppu = +ppuS; const steps = JSON.parse(stepsS)
const sp = fs.readFileSync(sprite, 'utf8').replace(/<svg[^>]*>/, '').replace('</svg>', '')
const greys = ['#111', '#444', '#777', '#999', '#bbb']
const css = `:root{${greys.map((g, i) => `--a${i}:${g};--b${i}:${g}`).join(';')}}body{margin:0;background:#fff}svg{display:block}`
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 140 * ppu, height: 310 * ppu } })
  await p.setContent(`<style>${css}</style><div style="display:none"><svg xmlns="http://www.w3.org/2000/svg">${sp}</svg></div><svg width="${140 * ppu}" height="${310 * ppu}" viewBox="-20 0 140 310" xmlns="http://www.w3.org/2000/svg"><use href="#${id}"/></svg>`)
  await p.waitForTimeout(300)
  await p.screenshot({ path: out + '.png' }); await b.close()
  potrace.posterize(out + '.png', { steps, color: 'black', background: 'transparent', turdSize: 6, optTolerance: 0.5, alphaMax: 1.1 }, (e, svg) => {
    if (e) throw e
    let paths = [...svg.matchAll(/<path[^>]*? d="([^"]+)"/g)].map((m) => m[1])
    console.error('paths', paths.length, 'steps', steps.length)
    if (paths.length === steps.length + 1) paths = paths.slice(1)
    // posterize emits lightest region first; paint with level 4..0
    const lv = { 5: ['a4', 'a3', 'a2', 'a1', 'a0'], 4: ['a4', 'a3', 'a1', 'a0'], 3: ['a4', 'a2', 'a0'], 2: ['a3', 'a0'] }[paths.length]
    const frag = paths.map((d, j) => `<path d="${svgpath(d).scale(1 / ppu).translate(-20, 0).abs().round(1).toString()}" style="fill:var(--${lv[j]})" fill-rule="evenodd"/>`).join('')
    fs.writeFileSync(out, frag); console.log(id, 'frag bytes', frag.length, 'gz', require('zlib').gzipSync(frag).length)
  })
})()
