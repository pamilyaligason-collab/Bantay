import { describe, expect, it } from 'vitest'
import type { MedTaken, Medication } from '../log/store'
import { computeKpis, whenWords } from './kpis'
import type { Reading } from './ranges'
import { GUIDE } from './ranges'
import { averageNodes, byVitalOrder, isVital, labFlagLine, NORMAL, positionOf, weekAverages } from './vitals'

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
    expect(k[0]).toMatchObject({ value: '104.5', unit: 'mg/dL', state: { word: 'A bit high' } }) // 5.8 mmol/L is 104.5 mg/dL, not "5.8 is low"
    expect(computeKpis({ personId: 'p1', readings: [g(5.8, 'stone', 8)], now: NOW, ...none })).toEqual([])
    const a = weekAverages([g(5.5, 'mmol/L', 7), g(100, 'mg/dL', 8), g(9, 'stone', 9)], NOW)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ unit: 'mg/dL', value: 99.6 })
  })
  it('KPI chips use the Normal bands: 124/76 is a little raised, 138/86 high, sugar 65 low', () => {
    const bp = (s: number, d: number) => computeKpis({ personId: 'p1', readings: [r('bp_systolic', s, 0, 7, 30, 'mmHg'), r('bp_diastolic', d, 0, 7, 30, 'mmHg')], now: NOW, ...none })[0]!
    expect(bp(124, 76).state?.word).toBe('A little raised')
    expect(bp(138, 86).state?.word).toBe('High')
    expect(bp(118, 76).state?.word).toBe('Within range')
    expect(computeKpis({ personId: 'p1', readings: [r('fasting_glucose', 65, 0, 7, 30, 'mg/dL')], now: NOW, ...none })[0]!.state?.word).toBe('Low')
  })
  it('vitals list in reading order: top before bottom, and BP averages are whole numbers', () => {
    expect(byVitalOrder([{ test: 'weight' }, { test: 'bp_diastolic' }, { test: 'heart_rate' }, { test: 'bp_systolic' }, { test: 'fasting_glucose' }]).map((x) => x.test)).toEqual(['bp_systolic', 'bp_diastolic', 'fasting_glucose', 'heart_rate', 'weight'])
    const a = weekAverages([r('bp_diastolic', 79, 0, 7, 30, 'mmHg'), r('bp_diastolic', 88, 1, 7, 30, 'mmHg')], NOW)
    expect(a[0]!.value).toBe(84)
  })
  it('Normal rows and the guide agree: the fasting sugar range text is the guide text', () => {
    const f = NORMAL.find((n) => n.code === 'fasting_glucose')!
    expect(f.range).toBe(GUIDE.fasting_glucose!.text)
    expect([f.low, f.high]).toEqual([70, 99])
  })
})

describe('7-day averages and the Normal list', () => {
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
    expect(bp.note).toBe('A bit high')
    expect(n.find((x) => x.id === 'pulse')).toMatchObject({ value: '91', state: 'within' })
    expect(n.find((x) => x.id === 'sleep')!.empty).toBe(true)
  })
  it('pulse has a resting range even though the guide file has none', () => {
    expect(positionOf(r('heart_rate', 110, 0))).toBe('above')
    expect(positionOf(r('heart_rate', 55, 0))).toBe('below')
    expect(positionOf(r('heart_rate', 72, 0))).toBe('within')
  })
  it('vitals vs labs, and the Normal list carries one plain line each', () => {
    expect(isVital('bp_systolic') && isVital('weight')).toBe(true)
    expect(isVital('hba1c') || isVital('ldl')).toBe(false)
    expect(NORMAL.map((n) => n.code)).toEqual(['bp_systolic', 'fasting_glucose', 'heart_rate', 'weight'])
    expect(NORMAL.find((n) => n.code === 'fasting_glucose')!.range).toBe('70 to 99 mg/dL (3.9 to 5.5 mmol/L)')
    expect(NORMAL.find((n) => n.code === 'heart_rate')!.range).toBe('60 to 100 bpm')
    for (const n of NORMAL) expect(n.line.length).toBeGreaterThan(20)
  })
  it('lab flags are plain language', () => {
    expect(labFlagLine('above', 'LDL cholesterol')).toBe('LDL cholesterol is a bit high. Ask your doctor at the next visit.')
    expect(labFlagLine('none', 'X')).toMatch(/no range/)
  })
})
