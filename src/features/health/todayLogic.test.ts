import { describe, expect, it } from 'vitest'
import css from './health.css?raw'
import type { WaterEntry } from '../log/store'
import type { DoseState } from './meds'
import type { Reading } from './ranges'
import { todayTiles } from './todayLogic'

const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 10, 6 + dayOffset, h, m)
const rd = (test: string, value: number, unit: string, when: Date): Reading => ({ personId: 'p1', test, value, unit, takenAt: when.toISOString() })
const water = (when: Date): WaterEntry => ({ clientId: `w${when.getTime()}`, personId: 'p1', drunkAt: when.toISOString(), ml: 250 })
const dose = (state: DoseState['state']) => ({ state, at: 480, name: 'X', key: 'k', medicationId: null, personId: 'p1', slot: 0 }) as unknown as DoseState
const run = (o: Partial<Parameters<typeof todayTiles>[0]> & { now?: Date } = {}) =>
  Object.fromEntries(todayTiles({ personId: 'p1', readings: [], activity: [], doses: null, water: [], goalMl: 1500, now: at(23, 30), ...o }).map((t) => [t.code, t]))

describe('Today row: medicines and BP pairing', () => {
  it('no medicines at all says "No medicines yet" (like Browse); medicines with nothing due say "None due today"', () => {
    expect(run({ doses: [], hasMeds: false }).meds!.sub).toBe('No medicines yet')
    expect(run({ doses: [], hasMeds: true }).meds!.sub).toBe('None due today')
    expect(run({ doses: [], hasMeds: false }).meds!.value).toBe('--')
  })
  it('BP bottom number is the diastolic within 30 minutes of the top number, none when too far away', () => {
    expect(run({ readings: [rd('bp_systolic', 128, 'mmHg', at(7, 40)), rd('bp_diastolic', 82, 'mmHg', at(7, 50))] }).bp!.value).toBe('128/82')
    expect(run({ readings: [rd('bp_systolic', 128, 'mmHg', at(7, 40)), rd('bp_diastolic', 82, 'mmHg', at(9, 0))] }).bp!.value).toBe('128')
  })
})

describe('Today row: null is not 0', () => {
  it('no data at all: six tiles in order, each "--" with its short line, none counted as zero', () => {
    const t = todayTiles({ personId: 'p1', readings: [], activity: [], doses: [], water: [], goalMl: 1500, now: at(23, 30) })
    expect(t.map((x) => x.code)).toEqual(['bp', 'pulse', 'water', 'steps', 'sleep', 'meds'])
    expect(t.map((x) => x.value)).toEqual(['--', '--', '--', '--', '--', '--'])
    expect(t.every((x) => x.empty)).toBe(true)
    expect(t.map((x) => x.sub)).toEqual(['No reading today', 'No reading today', 'Nothing logged today', 'No reading today', 'No reading today', 'None due today'])
  })
  it('medicines still loading is "--" with no claim', () => {
    const m = run({ doses: null }).meds!
    expect(m.value).toBe('--')
    expect(m.sub).toBe('')
  })
  it('hand-computed values: BP pair, pulse, water of 6, steps of 6,000, sleep 400 min, 2 of 3 taken', () => {
    const t = run({
      readings: [rd('bp_systolic', 128, 'mmHg', at(7, 40)), rd('bp_diastolic', 82, 'mmHg', at(7, 40)), rd('heart_rate', 72, 'bpm', at(7, 41))],
      water: [at(8), at(10), at(13)].map(water),
      activity: [{ kind: 'steps', minutes: null, steps: 4210, startedAt: at(12).toISOString() }, { kind: 'sleep', minutes: 400, steps: null, startedAt: at(6).toISOString() }],
      doses: [dose('taken'), dose('pending'), dose('taken')]
    })
    expect([t.bp!.value, t.bp!.sub]).toEqual(['128/82', '7:40 AM'])
    expect([t.pulse!.value, t.pulse!.sub]).toEqual(['72', 'bpm · 7:41 AM'])
    expect([t.water!.value, t.water!.sub]).toEqual(['3/6', 'glasses'])
    expect([t.steps!.value, t.steps!.sub]).toEqual(['4,210', 'of 6,000'])
    expect([t.sleep!.value, t.sleep!.sub]).toEqual(['6h 40', 'last night'])
    expect([t.meds!.value, t.meds!.sub]).toEqual(['2/3', 'taken'])
    expect(Object.values(t).some((x) => x.empty)).toBe(false)
  })
  it('a 0-step day that the phone reported is true data; one glass is "glass"', () => {
    const t = run({ activity: [{ kind: 'steps', minutes: null, steps: 0, startedAt: at(9).toISOString() }], water: [water(at(9))] })
    expect([t.steps!.value, t.steps!.empty]).toEqual(['0', false])
    expect([t.water!.value, t.water!.sub]).toEqual(['1/6', 'glass'])
  })
  it('yesterday\'s reading is not today\'s: at 00:30 a 23:50 reading is yesterday, a 00:10 one is today', () => {
    const now = at(0, 30)
    const t = run({ now, readings: [rd('heart_rate', 80, 'bpm', at(23, 50, -1))] })
    expect(t.pulse!.empty).toBe(true)
    const u = run({ now, readings: [rd('heart_rate', 80, 'bpm', at(23, 50, -1)), rd('heart_rate', 66, 'bpm', at(0, 10))] })
    expect(u.pulse!.value).toBe('66')
  })
  it('each tile opens its existing page', () => {
    expect(Object.values(run()).map((x) => x.href)).toEqual(['#health/metric/bp_systolic', '#health/metric/heart_rate', '#health/nutrition', '#health/metric/steps', '#health/metric/sleep', '#health/meds'])
  })
})

describe('S22-D styles', () => {
  it('Browse rise-in and the staggered delay are switched off under reduced motion', () => {
    expect(css).toContain('animation-delay: calc(var(--i, 0) * 80ms)')
    expect(/@media \(prefers-reduced-motion: reduce\) \{ \.card\.hb \{ animation: none; \} \}/.test(css)).toBe(true)
  })
})
