import { describe, expect, it } from 'vitest'
import { addEntry, circleScale, cyclesFor, momentAt, PATTERNS, totalSecs } from './breathLogic'

const [relax, sleep, calm] = PATTERNS as [typeof PATTERNS[0], typeof PATTERNS[0], typeof PATTERNS[0]]
describe('breathing', () => {
  it('fits whole breaths into 1, 3 and 5 minutes', () => {
    expect(cyclesFor(relax, 1)).toBe(6) // 10 s a breath
    expect(cyclesFor(sleep, 3)).toBe(9) // 19 s a breath: 9.47 rounds to 9
    expect(totalSecs(calm, 5)).toBe(304) // 16 s x 19
    expect(cyclesFor(sleep, 0)).toBe(1)
  })
  it('walks through the phases and counts down whole seconds', () => {
    expect(momentAt(relax, 1, 0)).toMatchObject({ phase: 'in', left: 4, cycle: 1 })
    expect(momentAt(relax, 1, 3.5)).toMatchObject({ phase: 'in', left: 1 })
    expect(momentAt(relax, 1, 4)).toMatchObject({ phase: 'out', left: 6 })
    expect(momentAt(relax, 1, 10)).toMatchObject({ phase: 'in', cycle: 2 })
    expect(momentAt(sleep, 1, 5)).toMatchObject({ phase: 'hold', left: 6 })
    expect(momentAt(relax, 1, 60).done).toBe(true)
    expect(momentAt(relax, 1, -3).phase).toBe('in')
    expect(momentAt(relax, 1, Number.NaN).phase).toBe('in')
  })
  it('the circle grows on in and shrinks on out', () => {
    expect(circleScale(momentAt(relax, 1, 2), null)).toBeCloseTo(0.775)
    expect(circleScale(momentAt(sleep, 1, 5), 'in')).toBe(1)
    expect(circleScale(momentAt(calm, 1, 13), 'out')).toBe(0.55)
  })
  it('keeps a bounded, valid mood log; no mood stays null', () => {
    let log: unknown = 'junk'
    for (let i = 0; i < 70; i++) log = addEntry(log, { at: String(i), pattern: 'relax', minutes: 1, mood: i === 69 ? 9 : null })
    expect((log as unknown[]).length).toBe(60)
    expect((log as { mood: number | null }[])[59]!.mood).toBeNull()
  })
})
