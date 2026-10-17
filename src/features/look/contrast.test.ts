import { describe, expect, it } from 'vitest'
import glass from '../../styles/glass.css?raw'
import tokens from '../../styles/tokens.css?raw'

type RGB = [number, number, number]
const vars = (css: string, selector: string) => {
  const body = css.slice(css.indexOf(selector + ' {') + selector.length + 2).split('}')[0]
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}
const parse = (c: string): [RGB, number] => {
  if (c.startsWith('#')) return [[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as RGB, 1]
  const n = c.match(/[\d.]+/g)!.map(Number)
  return [[n[0], n[1], n[2]], n[3] ?? 1]
}
const over = (fg: [RGB, number], bg: RGB): RGB => fg[0].map((v, i) => v * fg[1] + bg[i] * (1 - fg[1])) as RGB
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

for (const [name, sel] of [['light', ':root'], ['dark', ':root[data-theme="dark"]']] as const) {
  describe(`contrast ${name}`, () => {
    const v = { ...vars(tokens, sel), ...vars(glass, sel) }
    const skies = Object.keys(v).filter((k) => k.startsWith('--sky-')).map((k) => parse(v[k])[0])
    it('has 8 sky stops', () => expect(skies).toHaveLength(8))
    it('text on the bare sky is >= 4.5', () => {
      for (const s of skies) for (const t of ['--ink', '--ink2-sky']) expect(ratio(parse(v[t])[0], s), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5)
    })
    it('text on glass over the worst sky is >= 4.5', () => {
      for (const s of skies) {
        const g = over(parse(v['--glass']), s)
        for (const t of ['--ink', '--glass-ink2', '--act', '--ok', '--warn']) expect(ratio(parse(v[t])[0], g), `${t} on glass over ${s}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  })
}
