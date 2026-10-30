import { describe, expect, it } from 'vitest'
import { isNarrow, textScale } from './narrowMode'

describe('narrow mode (S16 M-1)', () => {
  it('a 195 px viewport at 100% text is narrow; 375 px is not', () => {
    expect(isNarrow(195, textScale(96))).toBe(true)
    expect(isNarrow(375, textScale(96))).toBe(false)
  })
  it('Android 200% text on a 390 px phone is narrow even though the viewport stays 390 px', () => {
    expect(textScale(192)).toBe(2)
    expect(isNarrow(390, textScale(192))).toBe(true)
    expect(isNarrow(390, textScale(115))).toBe(false) // 120% text keeps the normal layout
  })
  it('a failed measure (0 px, jsdom) means 100% text', () => {
    expect(textScale(0)).toBe(1)
  })
})
