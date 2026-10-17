import { describe, expect, it } from 'vitest'
import glass from '../../styles/glass.css?raw'
import tokens from '../../styles/tokens.css?raw'

type RGB = [number, number, number]
type Vars = Record<string, string>

const varsAt = (css: string, from: number, selector: string): Vars => {
  const at = css.indexOf(selector + ' {', from)
  const body = css.slice(at + selector.length + 2).split('}')[0]
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}
const DARK_SEL = ':root[data-theme="dark"]'
const MEDIA_SEL = ':root:not([data-theme="light"])'
const mediaAt = (css: string) => css.indexOf('prefers-color-scheme: dark')

const parse = (c: string): [RGB, number] => {
  if (c.startsWith('#')) return [[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as RGB, 1]
  const n = c.match(/[\d.]+/g)!.map(Number)
  return [[n[0], n[1], n[2]], n[3] ?? 1]
}
const over = (fg: [RGB, number], bg: RGB): RGB => fg[0].map((v, i) => v * fg[1] + bg[i] * (1 - fg[1])) as RGB
const clamp = (v: number) => Math.max(0, Math.min(255, v))
/** The CSS saturate() filter matrix (Filter Effects spec). backdrop-filter applies it to the sky BEFORE the glass overlay. */
const saturate = ([r, g, b]: RGB, s: number): RGB => [
  clamp((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
  clamp((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
  clamp((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b)
]
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

const themes = [
  ['light', () => ({ ...varsAt(tokens, 0, ':root'), ...varsAt(glass, 0, ':root') })],
  ['dark', () => ({ ...varsAt(tokens, 0, DARK_SEL), ...varsAt(glass, 0, DARK_SEL) })]
] as const

/** Every backdrop the sky can show for one stop: bare, plus the drifting glow, plus a rain streak on top (worst alpha). */
function backdrops(v: Vars) {
  const glow = Number(v['--glow'])
  const out: { name: string; bg: RGB }[] = []
  for (const state of ['storm', 'rain', 'clear', 'heat']) {
    for (const stop of ['a', 'b']) {
      const base = parse(v[`--sky-${state}-${stop}`])[0]
      const lit = over([[255, 255, 255], 0.35 * glow], base) // ::before white glow, max alpha
      const warm = state === 'heat' ? over([[255, 200, 120], 0.5 * glow], base) : lit
      for (const [tag, c] of [['bare', base], ['glow', warm]] as const) {
        out.push({ name: `${state}-${stop} ${tag}`, bg: c })
        if (state === 'storm' || state === 'rain') out.push({ name: `${state}-${stop} ${tag}+streak`, bg: over([[255, 255, 255], 0.14], c) })
      }
    }
  }
  return out
}

for (const [name, get] of themes) {
  describe(`contrast ${name}`, () => {
    const v = get()
    const check = (pairs: [string, 'plain' | 'fill'][], surface: (bg: RGB) => RGB, min = 4.5) => {
      const fails: string[] = []
      for (const { name: bn, bg } of backdrops(v)) {
        const s = surface(bg)
        for (const [fg, on] of pairs) {
          const r = ratio(parse(v[fg])[0], on === 'fill' ? over(parse(v['--fill']), s) : s)
          if (r < min) fails.push(`${fg}${on === 'fill' ? ' on --fill' : ''} on ${bn} = ${r.toFixed(2)} (${hex(s)})`)
        }
      }
      return fails
    }
    const onGlass = (bg: RGB) => over(parse(v['--glass']), saturate(bg, 1.8))

    it('has 8 sky stops', () => expect(Object.keys(v).filter((k) => k.startsWith('--sky-'))).toHaveLength(8))
    it('text drawn straight on the sky is >= 4.5', () => {
      expect(check([['--ink', 'plain'], ['--ink2-sky', 'plain']], (bg) => bg)).toEqual([])
    })
    it('text on glass (blurred, saturated 1.8, then overlaid) is >= 4.5', () => {
      expect(check([['--ink', 'plain'], ['--glass-ink2', 'plain'], ['--act', 'plain'], ['--ok', 'plain'], ['--warn', 'plain'], ['--danger', 'plain']], onGlass)).toEqual([])
    })
    it('active tab (--act on --fill on glass) is >= 4.5', () => {
      expect(check([['--act', 'fill'], ['--ink', 'fill']], onGlass)).toEqual([])
    })
    it('white on --danger-bg (Call 911 button) is >= 4.5', () => {
      expect(ratio([255, 255, 255], parse(v['--danger-bg'])[0])).toBeGreaterThanOrEqual(4.5)
    })
    it('secondary text outside glass is mapped to --ink2-sky', () => {
      expect(glass).toMatch(/\.sub\s*\{[^}]*var\(--ink2-sky\)/)
    })
  })
}

describe('dark blocks', () => {
  it('prefers-color-scheme dark block equals the data-theme dark block (glass.css)', () => {
    expect(varsAt(glass, mediaAt(glass), MEDIA_SEL)).toEqual(varsAt(glass, 0, DARK_SEL))
  })
  it('same for tokens.css', () => {
    expect(varsAt(tokens, mediaAt(tokens), MEDIA_SEL)).toEqual(varsAt(tokens, 0, DARK_SEL))
  })
})
