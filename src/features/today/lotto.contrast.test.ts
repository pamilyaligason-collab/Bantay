import { describe, expect, it } from 'vitest'
import { over, parse, ratio, tokensOf, type Theme } from '../look/contrastMath'

// .lotto-ball: --amber-ink on --warn-bg, which is 22% --amber over --card (tokens.css), on a --card row.
describe.each<Theme>(['light', 'dark'])('Lotto ball chip (%s)', (theme) => {
  const t = tokensOf(theme)
  const chip = over([parse(t['--amber']!)[0], 0.22], parse(t['--card']!)[0])
  it('ball number: --amber-ink on the chip fill is 4.5:1', () => expect(ratio(parse(t['--amber-ink']!)[0], chip)).toBeGreaterThanOrEqual(4.5))
  it('row name and sub line: --ink and --muted on --card', () => {
    expect(ratio(parse(t['--ink']!)[0], parse(t['--card']!)[0])).toBeGreaterThanOrEqual(4.5)
    expect(ratio(parse(t['--muted']!)[0], parse(t['--card']!)[0])).toBeGreaterThanOrEqual(4.5)
  })
})
