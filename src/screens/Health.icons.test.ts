import { describe, expect, it } from 'vitest'
import { NODE_ICON } from './Health'

describe('Readings icons (ICON-JACK-AUDIT rule 5)', () => {
  it('one glyph per measure, BP = gauge, Sugar = drop', () => {
    const names = Object.values(NODE_ICON)
    expect(new Set(names).size).toBe(names.length)
    expect(NODE_ICON.bp).toBe('gauge')
    expect(NODE_ICON.sugar).toBe('drop')
  })
})
