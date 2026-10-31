import { describe, expect, it } from 'vitest'
import app from '../../styles/app.css?raw'
import glass from '../../styles/glass.css?raw'
import tokens from '../../styles/tokens.css?raw'
import { DARK_SEL, MEDIA_SEL, over, pair, parse, ratio, tokensOf, varsOf } from './contrastMath'

const TINTS = ['blue', 'red', 'amber', 'teal', 'purple', 'green'] as const
const FILLS = ['--ground', '--card', '--card2', '--green-tint', ...TINTS.map((t) => `--tint-${t}`)]
const WHITE: [number, number, number] = [255, 255, 255]
for (const theme of ['light', 'dark'] as const) {
  describe(`v13 tokens ${theme}`, () => {
    const t = { ...tokensOf(theme), ...tokensOf(theme, glass) }
    const c = (k: string) => parse(t[k]!)[0]
    for (const bg of FILLS) {
      it(`--ink on ${bg} >= 4.5`, () => expect(pair(t, '--ink', bg)).toBeGreaterThanOrEqual(4.5))
      it(`--muted on ${bg} >= 4.5`, () => expect(pair(t, '--muted', bg)).toBeGreaterThanOrEqual(4.5))
    }
    for (const x of TINTS) {
      it(`--tint-${x}-ink on its fill >= 4.5`, () => expect(pair(t, `--tint-${x}-ink`, `--tint-${x}`)).toBeGreaterThanOrEqual(4.5))
      it(`--tint-${x}-ink on --card >= 4.5`, () => expect(pair(t, `--tint-${x}-ink`, '--card')).toBeGreaterThanOrEqual(4.5))
    }
    for (const bg of ['--card', '--ground', '--green-tint']) it(`--green on ${bg} >= 4.5`, () => expect(pair(t, '--green', bg)).toBeGreaterThanOrEqual(4.5))
    it('white on --btn and --danger-bg >= 4.5', () => { expect(ratio(WHITE, c('--btn'))).toBeGreaterThanOrEqual(4.5); expect(ratio(WHITE, c('--danger-bg'))).toBeGreaterThanOrEqual(4.5) })
    it('--on-green on --green >= 4.5', () => expect(pair(t, '--on-green', '--green')).toBeGreaterThanOrEqual(4.5))
    it('--focus on --ground and --card >= 3', () => { expect(pair(t, '--focus', '--ground')).toBeGreaterThanOrEqual(3); expect(pair(t, '--focus', '--card')).toBeGreaterThanOrEqual(3) })
    for (const back of ['--ground', '--card', '--tint-red', '--green']) {
      it(`tab label --ink on --glass-bg over ${back} >= 4.5`, () => expect(ratio(c('--ink'), over(parse(t['--glass-bg']!), c(back)))).toBeGreaterThanOrEqual(4.5))
      it(`sheet --muted on --glass-sheet over dim over ${back} >= 4.5`, () => expect(ratio(c('--muted'), over(parse(t['--glass-sheet']!), over([[0, 0, 0], 0.38], c(back))))).toBeGreaterThanOrEqual(4.5))
    }
    it('active tab --green on --fill over --glass-bg over --card >= 4.5', () => expect(ratio(c('--green'), over(parse(t['--fill']!), over(parse(t['--glass-bg']!), c('--card'))))).toBeGreaterThanOrEqual(4.5))
    it('keeps 8 sky stops', () => expect(Object.keys(t).filter((k) => k.startsWith('--sky-'))).toHaveLength(8))
    it('legacy aliases stay defined', () => { for (const k of ['--green2', '--soft', '--line', '--ok', '--warn', '--warn-bg', '--link', '--act', '--fill', '--bg', '--cell', '--ink2', '--sep', '--btn-fg', '--danger', '--hue-blue', '--hue-blue-ic', '--hue-terra-ic']) expect(t[k], k).toBeDefined() })
  })
}
describe('dark blocks and fonts', () => {
  it('prefers-color-scheme dark equals data-theme dark (tokens and glass)', () => {
    for (const css of [tokens, glass]) expect(varsOf(css, MEDIA_SEL, css.indexOf('prefers-color-scheme: dark'))).toEqual(varsOf(css, DARK_SEL))
  })
  it('system font only: no @font-face, no googleapis, --f-ui starts with -apple-system', () => {
    expect(app).not.toMatch(/@font-face|fonts\.googleapis/)
    expect(app).toMatch(/--f-ui: -apple-system, "SF Pro Text", "Inter", system-ui/)
    expect(app).not.toMatch(/--f-display/)
  })
  it('--warn-bg keeps its exact color-mix text (viewas test reads it)', () => expect(tokens.match(/--warn-bg: color-mix\(in srgb, var\(--amber\) 22%, var\(--card\)\);/g)!.length).toBeGreaterThanOrEqual(2))
})
