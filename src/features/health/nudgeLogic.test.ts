import { describe, expect, it } from 'vitest'
import { computeNudge } from './nudgeLogic'

const now = new Date(2026, 9, 22, 10, 0)
const at = (back: number, h = 8) => new Date(2026, 9, 22 - back, h).toISOString()
const base = { personId: 'p', readings: [], takes: [], activity: [], food: [], water: [], meds: [], now }
const bp = (back: number) => ({ personId: 'p', takenAt: at(back), test: 'bp_systolic', value: 130, unit: 'mmHg' })

describe('computeNudge', () => {
  it('nothing logged: no streak number, no zero, BP is the next step', () => {
    const n = computeNudge(base)
    expect(n.streak).toBeNull()
    expect(n.goals.every((g) => g.done === null && g.text === 'Not yet this week')).toBe(true)
    expect(n.next?.id).toBe('bp')
    expect(n.allMet).toBe(false)
  })
  it('streak counts days in a row and keeps running while today is still open', () => {
    expect(computeNudge({ ...base, readings: [bp(0), bp(1), bp(2), bp(4)] }).streak).toBe(3)
    expect(computeNudge({ ...base, readings: [bp(1), bp(2)] }).streak).toBe(2)
    expect(computeNudge({ ...base, readings: [bp(2)] }).streak).toBeNull()
  })
  it('a skipped dose does not count; other people do not count', () => {
    const t = { personId: 'p', name: 'Losartan', takenAt: at(0), skipped: true }
    expect(computeNudge({ ...base, takes: [t] }).streak).toBeNull()
    expect(computeNudge({ ...base, readings: [{ ...bp(0), personId: 'q' }] }).streak).toBeNull()
  })
  it('BP goal is met at 3 distinct days and the next step moves on', () => {
    const n = computeNudge({ ...base, readings: [bp(0), bp(1), bp(1), bp(2)] })
    const g = n.goals.find((x) => x.id === 'bp')!
    expect(g.met).toBe(true)
    expect(g.text).toBe('3 of 3 days')
    expect(n.next?.id).toBe('meals')
  })
  it('sugar shows only once a sugar reading exists; move counts minutes and ignores null minutes', () => {
    expect(computeNudge(base).goals.some((g) => g.id === 'sugar')).toBe(false)
    const n = computeNudge({ ...base, readings: [{ ...bp(0), test: 'glucose', value: 100, unit: 'mg/dL' }], activity: [{ personId: 'p', kind: 'walk', minutes: 20, steps: null, startedAt: at(0), source: 'manual' }, { personId: 'p', kind: 'steps', minutes: null, steps: 900, startedAt: at(0), source: 'manual' }] })
    expect(n.goals.some((g) => g.id === 'sugar')).toBe(true)
    expect(n.goals.find((g) => g.id === 'move')!.text).toBe('20 of 150 minutes')
  })
})
