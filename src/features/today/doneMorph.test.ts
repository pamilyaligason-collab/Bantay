import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLLAPSE_MS, FADE_MS, inFirstWeek, leaveMs, takenLabel } from './doneMorph'

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

describe('inFirstWeek (local day, ML-38)', () => {
  it('day 0 to 6 is the first week, day 7 is not', () => {
    expect(inFirstWeek('2026-10-22', new Date(2026, 9, 22, 8))).toBe(true)
    expect(inFirstWeek('2026-10-22', new Date(2026, 9, 28, 23, 30))).toBe(true)
    expect(inFirstWeek('2026-10-22', new Date(2026, 9, 29, 0, 30))).toBe(false)
  })
  it('the day rolls at local midnight: 23:30 and 00:30 are different days', () => {
    expect(inFirstWeek('2026-10-28', new Date(2026, 9, 28, 23, 30))).toBe(true)
    expect(inFirstWeek('2026-10-28', new Date(2026, 9, 29, 0, 30))).toBe(true)
    expect(inFirstWeek('2026-10-29', new Date(2026, 9, 28, 23, 30))).toBe(false) // a start day in the future is unknown, not "first week"
  })
  it('unknown or malformed is never the first week', () => {
    expect(inFirstWeek(undefined, new Date())).toBe(false)
    expect(inFirstWeek('', new Date())).toBe(false)
    expect(inFirstWeek('yesterday', new Date())).toBe(false)
  })
})
