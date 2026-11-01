import { describe, expect, it } from 'vitest'
import { over, pair, parse, ratio, tokensOf, type Theme } from '../look/contrastMath'
import css from './discover.css?raw'

const TINTS = ['blue', 'teal', 'purple', 'amber', 'red', 'green'] as const

describe.each<Theme>(['light', 'dark'])('Discover overview token pairs (%s)', (theme) => {
  const t = tokensOf(theme)
  it('titles and row text: --ink on --card', () => expect(pair(t, '--ink', '--card')).toBeGreaterThanOrEqual(4.5))
  it('.pt-s, .rw-sub, .lt-kicker: --muted on --card', () => expect(pair(t, '--muted', '--card')).toBeGreaterThanOrEqual(4.5))
  it('.pt-a and Section links: --green on --card and --ground', () => {
    expect(pair(t, '--green', '--card')).toBeGreaterThanOrEqual(4.5)
    expect(pair(t, '--green', '--ground')).toBeGreaterThanOrEqual(4.5)
  })
  it.each(TINTS)('tint %s: ink on its fill', (x) => expect(pair(t, `--tint-${x}-ink`, `--tint-${x}`)).toBeGreaterThanOrEqual(4.5))
})

describe('season row icon', () => {
  it('light: the amber icon over the white 55% lead is 3:1 (non-text)', () => {
    const t = tokensOf('light')
    const lead = over([parse('rgb(255 255 255 / .55)')[0], 0.55], parse(t['--tint-amber']!)[0])
    expect(ratio(parse(t['--tint-amber-ink']!)[0], lead)).toBeGreaterThanOrEqual(3)
  })
})

describe('thumbnail', () => {
  it('fills with the tile tint, else --card2', () => expect(css).toMatch(/\.dc-thumb\s*\{[^}]*background:\s*var\(--tint-fill, var\(--card2\)\)/))
})
