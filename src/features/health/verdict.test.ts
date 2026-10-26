import { describe, expect, it } from 'vitest'
import { vitalCards } from '../family/reportLogic'
import { bodyNodes } from './model'
import { computeKpis } from './kpisLogic'
import { labVerdict } from './labsLogic'
import { entrySpec, previewReading } from './readingPreview'
import { rangeState, type Reading } from './ranges'
import { bpLevel, kindOf, verdictFor } from './verdict'
import { computeMyWeek } from '../today/myWeekLogic'

const NOW = new Date('2026-10-20T12:00:00')
const R = (test: string, value: number, unit = 'mmHg', takenAt = '2026-10-20T07:00:00', personId = 'p1'): Reading => ({ personId, test, value, unit, takenAt } as Reading)
const bp = (s: number, d: number) => [R('bp_systolic', s), R('bp_diastolic', d)]

describe('one verdict table', () => {
  it('BP 148/92 says High on every surface', () => {
    const rs = bp(148, 92)
    expect(computeKpis({ personId: 'p1', readings: rs, activity: [], meds: [], takes: [], now: NOW })[0]!.state!.word).toBe('High')
    expect(bodyNodes(rs, [], NOW).find((n) => n.id === 'bp')!.note).toBe('High')
    expect(vitalCards(rs, NOW).find((v) => v.key === 'bp')!.word).toBe('High')
    expect(computeMyWeek({ personId: 'p1', readings: rs, activity: [], meds: [], takes: [], now: NOW }).find((t) => t.code === 'bp_systolic')!.state!.word).toBe('High')
    expect(previewReading(entrySpec('bp_systolic')!, { top: '148', bottom: '92' })).toMatchObject({ word: 'High' })
  })
  it('sugar 112 says A bit high on every surface', () => {
    const rs = [R('fasting_glucose', 112, 'mg/dL')]
    expect(computeKpis({ personId: 'p1', readings: rs, activity: [], meds: [], takes: [], now: NOW })[0]!.state!.word).toBe('A bit high')
    expect(bodyNodes(rs, [], NOW).find((n) => n.id === 'sugar')!.note).toBe('A bit high')
    expect(vitalCards(rs, NOW)[0]!.word).toBe('A bit high')
  })
  it('120 to 129 over under 80 is A little raised everywhere', () => {
    const rs = bp(125, 76)
    expect(computeKpis({ personId: 'p1', readings: rs, activity: [], meds: [], takes: [], now: NOW })[0]!.state!.word).toBe('A little raised')
    expect(bodyNodes(rs, [], NOW).find((n) => n.id === 'bp')!.note).toBe('A little raised')
    expect(vitalCards(rs, NOW).find((v) => v.key === 'bp')!.word).toBe('A little raised')
  })
  it('table values and no-range handling', () => {
    expect(verdictFor('vital', 'below')!.word).toBe('Low')
    expect(rangeState('within').word).toBe('In range')
    expect(labVerdict('above')!.word).toBe('High')
    expect(verdictFor('lab', 'none')).toBeNull()
    expect(kindOf('bp_diastolic')).toBe('bp')
    expect(kindOf('ldl', false)).toBe('lab')
  })
})

describe('the one blood pressure table (hand-computed)', () => {
  const cases: [number, number, string][] = [
    [134, 84, 'Above target'], [133, 83, 'Above target'], [138, 86, 'High'], [129, 79, 'A little raised'], [119, 79, 'In range'], [88, 58, 'Low'],
    [135, 70, 'High'], [120, 79, 'A little raised'], [130, 70, 'Above target'], [118, 84, 'Above target'], [118, 85, 'High'], [89, 70, 'Low'], [100, 59, 'Low'], [90, 60, 'In range'], [180, 120, 'High']
  ]
  for (const [t, b, word] of cases) it(`${t}/${b} is ${word}`, () => expect(verdictFor('bp', 'above', { top: t, bottom: b })!.word).toBe(word))
  it('a lone number is judged on its own; nothing typed is no verdict, never In range', () => {
    expect(bpLevel(132, null)).toBe('above')
    expect(bpLevel(null, 86)).toBe('high')
    expect(bpLevel(null, null)).toBeNull()
    expect(verdictFor('bp', 'none')).toBeNull()
  })
  it('the rest of the app agrees: every surface reads the same word for 134/84 and 88/58', () => {
    const rs = (t: number, b: number) => [R('bp_systolic', t), R('bp_diastolic', b)]
    expect(computeKpis({ personId: 'p1', readings: rs(134, 84), activity: [], meds: [], takes: [], now: NOW })[0]!.state!.word).toBe('Above target')
    expect(vitalCards(rs(134, 84), NOW).find((v) => v.key === 'bp')!.word).toBe('Above target')
    expect(bodyNodes(rs(88, 58), [], NOW).find((n) => n.id === 'bp')!.note).toBe('Low')
    expect(computeKpis({ personId: 'p1', readings: rs(88, 58), activity: [], meds: [], takes: [], now: NOW })[0]!.state).toMatchObject({ word: 'Low', kind: 'low' })
  })
})
