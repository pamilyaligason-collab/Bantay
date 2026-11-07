import { afterEach, describe, expect, it, vi } from 'vitest'
import { bpRow, checkInRow, countLeft, doneCardSeen, markDoneCardSeen, PRIORITY, ringValue, waterRow } from './dayRows'
const now = new Date(2026, 9, 31, 18)
describe('myDay rows', () => {
  it('bp: none this week, then one this week', () => {
    expect(bpRow([], now)).toEqual({ title: 'Blood pressure', sub: 'Weekly · none this week', done: false, href: '#health/metric/bp_systolic' })
    const t = new Date(2026, 9, 27, 7).toISOString()
    expect(bpRow([{ test: 'bp_systolic', value: 128, takenAt: t }, { test: 'bp_diastolic', value: 82, takenAt: t }], now)).toMatchObject({ sub: 'Last 128/82 · Tue', done: true })
  })
  it('water: glasses today over the goal in glasses', () => {
    expect(waterRow([{ ml: 250, drunkAt: now.toISOString() }], 1500, now)).toEqual({ title: 'Water', sub: '1 of 6 glasses', done: false, frac: 1 / 6 })
    expect(waterRow([], 2000, now).sub).toBe('0 of 8 glasses')
    expect(waterRow([], 1500, now, 'limit').sub).toBe("0 of 6 glasses · Your doctor's limit")
    expect(waterRow([], 1150, now, 'limit').sub).toBe("0 of 4 glasses · Your doctor's limit") // floor, never past the limit
    const four = Array.from({ length: 4 }, () => ({ ml: 250, drunkAt: now.toISOString() }))
    expect(waterRow(four, 1150, now, 'limit').done).toBe(true)
    expect(waterRow(four, 1150, now, 'weight').done).toBe(false) // without a limit 1150 rounds to 5
    expect(waterRow([], 1500, now, 'weight').sub).toBe('0 of 6 glasses')
    expect(waterRow([{ ml: 1500, drunkAt: now.toISOString() }], 1500, now).done).toBe(true)
  })
  it('check-in is done only when one is today', () => {
    expect(checkInRow([{ kind: 'check-in', startedAt: now.toISOString() }], now).done).toBe(true)
    expect(checkInRow([{ kind: 'check-in', startedAt: new Date(2026, 9, 30, 9).toISOString() }], now).done).toBe(false)
  })
  it('check-in sub does not promise the family signed out', () => {
    expect(checkInRow([], now, true).sub).toBe('Lets the family know you are fine')
    expect(checkInRow([], now, false).sub).toBe('Sign in to let the family know')
  })
  it('countLeft wording', () => {
    expect(countLeft([{ done: false }, { done: true }, { done: false }])).toEqual({ left: 2, total: 3, title: '2 things left today' })
    expect(countLeft([{ done: true }]).title).toBe('All done for today')
    expect(countLeft([{ done: false }]).title).toBe('1 thing left today')
  })
})

describe('S22 rewards helpers', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
  it('priority order is blood pressure, water, how are you', () => expect(PRIORITY).toEqual(['bp', 'water', 'checkin']))
  it('water is done at the goal and a glass short is not; frac caps at 1', () => {
    const g = (n: number) => waterRow(Array.from({ length: n }, () => ({ ml: 250, drunkAt: now.toISOString() })), 1500, now)
    expect([g(5).done, g(6).done]).toEqual([false, true])
    expect(g(5).frac).toBeCloseTo(5 / 6)
    expect(g(9).frac).toBe(1)
  })
  it('ring: 1 of 4 done plus half the water goal reads 3/8; a done water adds nothing extra', () => {
    expect(ringValue(1, 4, false, 0.5)).toBe(0.375)
    expect(ringValue(2, 4, true, 1)).toBe(0.5)
    expect(ringValue(0, 0, false, 0)).toBe(0)
  })
  it('the done card is seen per local day and per person; 23:30 and 00:30 are different days', () => {
    const a = new Date(2026, 10, 5, 23, 30), b = new Date(2026, 10, 6, 0, 30)
    expect(doneCardSeen(a, 'me')).toBe(false)
    markDoneCardSeen(a, 'me')
    expect(doneCardSeen(a, 'me')).toBe(true)
    expect(doneCardSeen(a, 'mama')).toBe(false)
    expect(doneCardSeen(b, 'me')).toBe(false)
  })
  it('a blocked localStorage never throws: unseen, and marking is a no-op', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    expect(doneCardSeen(now, 'me')).toBe(false)
    expect(() => markDoneCardSeen(now, 'me')).not.toThrow()
  })
})
