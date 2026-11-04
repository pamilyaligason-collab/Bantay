import { describe, expect, it } from 'vitest'
import type { MedTaken, Medication } from '../log/store'
import { computeKpis, whenWords } from './kpisLogic'
import { latestSteps } from './stepsDay'
import type { Reading } from './ranges'
import { averageNodes, byVitalOrder, isVital, labFlagLine, positionOf, weekAverages } from './vitals'

const NOW = new Date(2026, 9, 20, 10, 0)
const at = (daysAgo: number, h = 7, m = 30) => new Date(2026, 9, 20 - daysAgo, h, m).toISOString()
const r = (test: string, value: number, daysAgo: number, h = 7, m = 30, unit = ''): Reading => ({ personId: 'p1', takenAt: at(daysAgo, h, m), test, value, unit })
const readings: Reading[] = [
  r('bp_systolic', 128, 0, 7, 30, 'mmHg'), r('bp_diastolic', 82, 0, 7, 31, 'mmHg'), r('bp_systolic', 140, 2, 8, 0, 'mmHg'), r('bp_diastolic', 90, 2, 8, 0, 'mmHg'),
  r('fasting_glucose', 104, 0, 6, 45, 'mg/dL'), r('weight', 61.2, 1, 6, 50, 'kg'), r('heart_rate', 72, 0, 7, 30, 'bpm'), r('heart_rate', 110, 3, 7, 30, 'bpm'),
  r('bp_systolic', 118, 20, 7, 0, 'mmHg')
]
const none = { activity: [], meds: [] as Medication[], takes: [] as MedTaken[] }

describe('time words', () => {
  it('today, yesterday, then the date', () => {
    expect(whenWords(at(0, 7, 30), NOW)).toBe('today 7:30 AM')
    expect(whenWords(at(1, 18, 5), NOW)).toBe('yesterday 6:05 PM')
    expect(whenWords(at(3, 9, 0), NOW)).toBe('Sat 17 Oct')
  })
})

describe('My KPIs: the latest reading, not the average', () => {
  it('latest per measure with its time, BP as one pair, chips from the ranges', () => {
    const k = computeKpis({ personId: 'p1', readings, now: NOW, ...none })
    const by = Object.fromEntries(k.map((x) => [x.code, x]))
    expect(by.bp_systolic).toMatchObject({ value: '128/82', unit: 'mmHg', when: 'today 7:30 AM', state: { kind: 'high' } })
    expect(by.fasting_glucose).toMatchObject({ value: '104', when: 'today 6:45 AM', state: { kind: 'high' } })
    expect(by.weight).toMatchObject({ value: '61.2', when: 'yesterday 6:50 AM' })
    expect(by.weight!.state).toBeUndefined()
    expect(by.heart_rate).toMatchObject({ value: '72', state: { kind: 'within' } })
  })
  it('shares the 7-day sparkline with My week (one slot per day, oldest first)', () => {
    const bp = computeKpis({ personId: 'p1', readings, now: NOW, ...none }).find((x) => x.code === 'bp_systolic')!
    expect(bp.spark).toHaveLength(7)
    expect(bp.spark[6]).toBe(128)
    expect(bp.spark[4]).toBe(140)
    expect(bp.spark[0]).toBeNull()
  })
  it('steps: the newest day total with the goal; doses on time from the same computation as My week', () => {
    const activity = [{ kind: 'steps', steps: 2000, startedAt: at(0, 8), personId: 'p1' }, { kind: 'steps', steps: 2210, startedAt: at(0, 9), personId: 'p1' }]
    const meds: Medication[] = [{ personId: 'p1', name: 'Losartan', serverId: 's1', medStatus: 'active', startedOn: '2026-10-19', schedule: { v: 1, times: ['08:00'] } }]
    const takes: MedTaken[] = [{ personId: 'p1', name: 'Losartan', medicationId: 's1', slot: '08:00', takenAt: at(1, 8, 10) }, { personId: 'p1', name: 'Losartan', medicationId: 's1', slot: '08:00', takenAt: at(0, 8, 12) }]
    const k = computeKpis({ personId: 'p1', readings: [], activity, meds, takes, now: NOW })
    expect(k.find((x) => x.code === 'steps')).toMatchObject({ value: '4,210', when: 'today so far', sub: 'Goal 6,000' })
    expect(k.find((x) => x.code === 'doses')).toMatchObject({ value: '2 of 2', when: 'last 7 days' })
  })
  it('a measure with no data is not drawn, never a zero', () => {
    expect(computeKpis({ personId: 'p1', readings: [], now: NOW, ...none })).toEqual([])
    expect(computeKpis({ personId: 'other', readings, now: NOW, ...none })).toEqual([])
  })
})

describe('units and wording', () => {
  it('glucose in mmol/L is converted (x 18.016) before judging and averaging; an unknown unit is skipped', () => {
    const g = (v: number, unit: string, h: number): Reading => ({ personId: 'p1', takenAt: at(0, h), test: 'fasting_glucose', value: v, unit })
    const k = computeKpis({ personId: 'p1', readings: [g(5.8, 'mmol/L', 8)], now: NOW, ...none })
    expect(k[0]).toMatchObject({ value: '104.5', unit: 'mg/dL', state: { word: 'High' } }) // 5.8 mmol/L is 104.5 mg/dL, not "5.8 is low"
    expect(computeKpis({ personId: 'p1', readings: [g(5.8, 'stone', 8)], now: NOW, ...none })).toEqual([])
    const a = weekAverages([g(5.5, 'mmol/L', 7), g(100, 'mg/dL', 8), g(9, 'stone', 9)], NOW)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ unit: 'mg/dL', value: 99.6 })
  })
  it('KPI chips use the Normal bands: 124/76 is a little raised, 138/86 high, sugar 65 low', () => {
    const bp = (s: number, d: number) => computeKpis({ personId: 'p1', readings: [r('bp_systolic', s, 0, 7, 30, 'mmHg'), r('bp_diastolic', d, 0, 7, 30, 'mmHg')], now: NOW, ...none })[0]!
    expect(bp(124, 76).state?.word).toBe('A little raised')
    expect(bp(138, 86).state?.word).toBe('High')
    expect(bp(118, 76).state?.word).toBe('In range')
    expect(computeKpis({ personId: 'p1', readings: [r('fasting_glucose', 65, 0, 7, 30, 'mg/dL')], now: NOW, ...none })[0]!.state?.word).toBe('Low')
  })
  it('vitals list in reading order: top before bottom, and BP averages are whole numbers', () => {
    expect(byVitalOrder([{ test: 'weight' }, { test: 'bp_diastolic' }, { test: 'heart_rate' }, { test: 'bp_systolic' }, { test: 'fasting_glucose' }]).map((x) => x.test)).toEqual(['bp_systolic', 'bp_diastolic', 'fasting_glucose', 'heart_rate', 'weight'])
    const a = weekAverages([r('bp_diastolic', 79, 0, 7, 30, 'mmHg'), r('bp_diastolic', 88, 1, 7, 30, 'mmHg')], NOW)
    expect(a[0]!.value).toBe(84)
  })
})

describe('7-day averages', () => {
  it('averages only the last 7 days, per test', () => {
    const a = weekAverages(readings, NOW)
    expect(a.find((x) => x.test === 'bp_systolic')!.value).toBe(134)
    expect(a.find((x) => x.test === 'heart_rate')!.value).toBe(91)
    expect(a.find((x) => x.test === 'weight')!.value).toBe(61.2)
  })
  it('the body map shows the averages, coloured by status', () => {
    const n = averageNodes(readings, [], NOW)
    const bp = n.find((x) => x.id === 'bp')!
    expect(bp.value).toBe('134/86')
    expect(bp.state).toBe('above')
    expect(bp.note).toBe('High')
    expect(n.find((x) => x.id === 'pulse')).toMatchObject({ value: '91', state: 'within' })
    expect(n.find((x) => x.id === 'sleep')!.empty).toBe(true)
  })
  it('pulse has a resting range even though the guide file has none', () => {
    expect(positionOf(r('heart_rate', 110, 0))).toBe('above')
    expect(positionOf(r('heart_rate', 55, 0))).toBe('below')
    expect(positionOf(r('heart_rate', 72, 0))).toBe('within')
  })
  it('vitals vs labs', () => {
    expect(isVital('bp_systolic') && isVital('weight')).toBe(true)
    expect(isVital('hba1c') || isVital('ldl')).toBe(false)
  })
  it('lab flags are plain language', () => {
    expect(labFlagLine('above', 'LDL cholesterol')).toBe('LDL cholesterol is high. Ask your doctor at the next visit.')
    expect(labFlagLine('none', 'X')).toMatch(/no range/)
  })
})

describe('a 0 from missing data never prints', () => {
  const acts = (steps: number) => [{ personId: 'p1', kind: 'steps', steps, startedAt: at(0, 9, 0) }] as never
  it('a 0 kg weight gives no KPI and an empty average tile', () => {
    const rs = [r('weight', 0, 0, 7, 0, 'kg'), r('fasting_glucose', 104, 0, 6, 45, 'mg/dL')]
    expect(computeKpis({ personId: 'p1', readings: rs, now: NOW, ...none }).map((x) => x.code)).not.toContain('weight')
    expect(averageNodes(rs, [], NOW).find((n) => n.id === 'weight')!.empty).toBe(true)
  })
  it('no step rows at all: no KPI and an empty tile (no data is not a 0 day)', () => {
    expect(computeKpis({ personId: 'p1', readings: [], now: NOW, ...none }).map((x) => x.code)).not.toContain('steps')
    expect(averageNodes([], [], NOW).find((n) => n.id === 'steps')).toMatchObject({ empty: true, value: '--' })
  })
  it('a dropped 0 neither counts as a day nor sets the verdict: weight 0 yesterday, 61 the day before', () => {
    const n = averageNodes([r('weight', 0, 1, 7, 0, 'kg'), r('weight', 61, 2, 7, 0, 'kg')], [], NOW).find((x) => x.id === 'weight')!
    expect(n.value).toBe('61 kg')
    expect(n.when).toBe('Average of 1 day')
  })
  it('pulse 0 yesterday, 72 the day before: plain In range, never "latest Low"', () => {
    const n = averageNodes([r('heart_rate', 0, 1, 7, 0, 'bpm'), r('heart_rate', 72, 2, 7, 0, 'bpm')], [], NOW).find((x) => x.id === 'pulse')!
    expect(n.value).toBe('72')
    expect(n.when).toBe('Average of 1 day')
    expect(n.sub).toBe('In range')
  })
  const stepDay = (daysAgo: number, steps: number) => ({ personId: 'p1', kind: 'steps', minutes: null, steps, startedAt: at(daysAgo, 9, 0) })
  it('a real 0 steps day stays in the average: 3000, 3000, 0 is 2,000 over 3 days', () => {
    const n = averageNodes([], [stepDay(2, 3000), stepDay(1, 3000), stepDay(0, 0)] as never, NOW).find((x) => x.id === 'steps')!
    expect(n.value).toBe('2,000') // (3000 + 3000 + 0) / 3
    expect(n.when).toBe('Average of 3 days')
    expect(n.empty).toBe(false)
  })
  it('a 0 today and 4,210 yesterday: the KPI and Move both say 0 today', () => {
    const activity = [stepDay(1, 4210), stepDay(0, 0)] as never
    expect(computeKpis({ personId: 'p1', readings: [], now: NOW, ...none, activity }).find((x) => x.code === 'steps')).toMatchObject({ value: '0', when: 'today so far' })
    expect(latestSteps(activity, NOW)).toMatchObject({ total: 0, today: true })
  })
  it('sleep keeps its guard: a 0 minute night is no night', () => {
    const sleep = (daysAgo: number, minutes: number) => ({ personId: 'p1', kind: 'sleep', minutes, steps: null, startedAt: at(daysAgo, 1, 0) })
    expect(averageNodes([], [sleep(1, 420), sleep(0, 0)] as never, NOW).find((x) => x.id === 'sleep')!.when).toBe('Average of 1 day')
  })
  it('real values still show beside it', () => {
    const rs = [r('weight', 61, 0, 7, 0, 'kg')]
    expect(computeKpis({ personId: 'p1', readings: rs, now: NOW, ...none, activity: acts(4210) }).map((x) => x.value)).toEqual(['61', '4,210'])
    expect(averageNodes(rs, acts(4210), NOW).find((n) => n.id === 'steps')!.value).toBe('4,210')
  })
})
