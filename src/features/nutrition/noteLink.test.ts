import { describe, expect, it } from 'vitest'
import { over, parse, ratio, tokensOf, type Theme } from '../look/contrastMath'
import { NOTE_LINK_STYLE } from './noteLink'

// --warn-bg is color-mix(amber 22%, card); contrastMath cannot read color-mix, so mix it here.
const warn = (t: Record<string, string>) => over([parse(t['--amber']!)[0], 0.22], parse(t['--card']!)[0])

describe('nutrition note link', () => {
  it.each<Theme>(['light', 'dark'])('ink link on the warn card passes 4.5:1 (%s)', (theme) => {
    const t = tokensOf(theme)
    expect(NOTE_LINK_STYLE.color).toBe('var(--ink)')
    expect(ratio(parse(t['--ink']!)[0], warn(t))).toBeGreaterThanOrEqual(4.5)
  })
  it('the old green link failed in dark', () => {
    const t = tokensOf('dark')
    expect(ratio(parse(t['--act'] ?? t['--green']!)[0], warn(t))).toBeLessThan(4.5)
  })
})
