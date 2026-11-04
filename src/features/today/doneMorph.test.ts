import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLLAPSE_MS, FADE_MS, leaveMs, takenLabel } from './doneMorph'

afterEach(() => vi.useRealTimers())

describe('takenLabel', () => {
  it('reads Taken and the local clock', () => {
    expect(takenLabel(new Date(2026, 9, 28, 9, 2))).toMatch(/^Taken 9:02\s?am$/i)
    expect(takenLabel(new Date(2026, 9, 28, 23, 30))).toMatch(/^Taken 11:30\s?pm$/i)
    expect(takenLabel(new Date(2026, 9, 29, 0, 30))).toMatch(/^Taken 12:30\s?am$/i)
  })
})

describe('leaveMs', () => {
  it('240 ms collapse, 150 ms cross-fade under reduced motion', () => {
    expect(leaveMs(false)).toBe(240)
    expect(leaveMs(true)).toBe(150)
    expect([COLLAPSE_MS, FADE_MS]).toEqual([240, 150])
  })
})

