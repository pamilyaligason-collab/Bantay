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
  it('all met: BP 3 days, meals 4 days and 150 minutes of moving, no next step', () => {
    const food = [0, 1, 2, 3].map((b) => ({ personId: 'p', eatenAt: at(b), meal: 'lunch' as const, name: 'Rice', clientId: `f${b}`, foodKey: null, portion: 1, servingLabel: null, kcal: null, sodiumMg: null, potassiumMg: null, proteinG: null }))
    const activity = [{ personId: 'p', kind: 'walk', minutes: 100, steps: null, startedAt: at(0), source: 'manual' as const }, { personId: 'p', kind: 'walk', minutes: 50, steps: null, startedAt: at(1), source: 'manual' as const }]
    const n = computeNudge({ ...base, readings: [bp(0), bp(1), bp(2)], food, activity })
    expect(n.goals.map((g) => g.id)).toEqual(['bp', 'meals', 'move'])
    expect(n.goals.every((g) => g.met)).toBe(true)
    expect(n.allMet).toBe(true)
    expect(n.next).toBeNull()
  })
  it('medicines come from the shared dose counter: started 20 Oct, 08:00 daily, one taken on 22 Oct = 1 of 3', () => {
    const med = { personId: 'p', name: 'Losartan', clientId: 'm1', schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-10-20' }
    const take = { personId: 'p', name: 'Losartan', takenAt: at(0, 8) }
    const g = computeNudge({ ...base, meds: [med], takes: [take] }).goals.find((x) => x.id === 'meds')
    expect(g?.text).toBe('1 of 3 doses')
  })
})
