import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import app from '../../styles/app.css?raw'
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
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const themes = [
  ['light', () => ({ ...varsAt(tokens, 0, ':root'), ...varsAt(glass, 0, ':root') })],
  ['dark', () => ({ ...varsAt(tokens, 0, DARK_SEL), ...varsAt(glass, 0, DARK_SEL) })]
] as const

/** Resolve one level of var(--x) so the alias tokens (--act, --link, --bg ...) can be checked too. */
const resolve = (v: Vars, k: string): string => {
  let val = v[k]
  for (let n = 0; n < 4 && val?.startsWith('var('); n++) val = v[val.slice(4, -1)]
  return val
}

for (const [name, get] of themes) {
  describe(`v2 palette (D-29) ${name}`, () => {
    const v = get()
    const c = (k: string) => parse(resolve(v, k))[0]
    const pair = (fg: string, bg: string) => ratio(c(fg), c(bg))
    for (const bg of ['--ground', '--card', '--card2', '--soft']) {
      it(`--ink on ${bg} >= 4.5`, () => expect(pair('--ink', bg)).toBeGreaterThanOrEqual(4.5))
      it(`--muted on ${bg} >= 4.5`, () => expect(pair('--muted', bg)).toBeGreaterThanOrEqual(4.5))
    }
    for (const fg of ['--red', '--ok', '--warn', '--act', '--link', '--green2']) {
      if (fg === '--green2' && name === 'dark') continue // dark green2 is a fill, never text
      for (const bg of ['--ground', '--card']) {
        it(`${fg} on ${bg} >= 4.5`, () => expect(pair(fg, bg)).toBeGreaterThanOrEqual(4.5))
      }
    }
    // UI-16: chips sit on --soft. Light --ok is 4.40 there (fails), so light chips use --green; dark --green is a fill (1.6), so dark chips use --ok.
    const onSoft = name === 'light' ? '--green' : '--ok'
    it(`chip text ${onSoft} on --soft >= 4.5`, () => expect(pair(onSoft, '--soft')).toBeGreaterThanOrEqual(4.5))
    it('--on-green on --green >= 4.5', () => expect(pair('--on-green', '--green')).toBeGreaterThanOrEqual(4.5))
    it('--btn-fg on --btn >= 4.5', () => expect(pair('--btn-fg', '--btn')).toBeGreaterThanOrEqual(4.5))
    it('white on --green2 (switch and check mark) >= 3', () => expect(ratio([255, 255, 255], c('--green2'))).toBeGreaterThanOrEqual(3))
    it('white on --danger-bg (Call 911 button) >= 4.5', () => expect(ratio([255, 255, 255], c('--danger-bg'))).toBeGreaterThanOrEqual(4.5))
    it('ink on amber pill >= 4.5', () => expect(ratio([42, 28, 0], c('--amber'))).toBeGreaterThanOrEqual(4.5))
    it('focus ring on ground and card >= 3', () => {
      expect(pair('--focus', '--ground')).toBeGreaterThanOrEqual(3)
      expect(pair('--focus', '--card')).toBeGreaterThanOrEqual(3)
    })
    it('active tab (--ink on --fill over --card) >= 4.5', () => {
      expect(ratio(c('--ink'), over(parse(v['--fill']), c('--card')))).toBeGreaterThanOrEqual(4.5)
    })
    // D-71: the tab bar is glass, so its labels sit on --glass-bg over whatever scrolls behind it. Check the worst backdrops: page ground, card, and the dark green fill.
    for (const back of ['--ground', '--card', '--green', '--red']) {
      it(`tab label --ink on --glass-bg over ${back} >= 4.5`, () => {
        const glass = over(parse(v['--glass-bg']), c(back))
        expect(ratio(c('--ink'), glass)).toBeGreaterThanOrEqual(4.5)
      })
    }
    // sheets: --muted text on --glass-sheet over a 40% black dim over the worst page colours
    for (const back of ['--green', '--red', '--ground']) {
      it(`sheet --muted on --glass-sheet over dim over ${back} >= 4.5`, () => {
        const dimmed = over([[0, 0, 0], 0.4], c(back))
        expect(ratio(c('--muted'), over(parse(v['--glass-sheet']), dimmed))).toBeGreaterThanOrEqual(4.5)
      })
    }
    it('active tab pill (--ink on --fill over --glass-bg over --card) >= 4.5', () => {
      const glass = over(parse(v['--glass-bg']), c('--card'))
      expect(ratio(c('--ink'), over(parse(v['--fill']), glass))).toBeGreaterThanOrEqual(4.5)
    })
    it('keeps 8 sky stops for the P3 weather background', () => {
      expect(Object.keys(v).filter((k) => k.startsWith('--sky-'))).toHaveLength(8)
    })
  })
}

describe('v2 look files', () => {
  it('legacy token aliases stay defined', () => {
    for (const k of ['--bg', '--cell', '--ink2', '--sep', '--btn', '--btn-fg', '--danger', '--warn-bg', '--act']) expect(tokens).toContain(k + ':')
  })
  it('self-hosts the fonts it declares', () => {
    for (const f of ['fraunces-600', 'jakarta-400', 'jakarta-600', 'jakarta-700']) {
      expect(app).toContain(`/fonts/${f}.woff2`)
      expect(existsSync(`public/fonts/${f}.woff2`)).toBe(true)
    }
    expect(app).not.toMatch(/fonts\.googleapis/)
  })
})

describe('dark blocks', () => {
  it('prefers-color-scheme dark block equals the data-theme dark block (glass.css)', () => {
    expect(varsAt(glass, mediaAt(glass), MEDIA_SEL)).toEqual(varsAt(glass, 0, DARK_SEL))
  })
  it('same for tokens.css', () => {
    expect(varsAt(tokens, mediaAt(tokens), MEDIA_SEL)).toEqual(varsAt(tokens, 0, DARK_SEL))
  })
})
