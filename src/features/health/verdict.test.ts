import { describe, expect, it } from 'vitest'
import { vitalCards } from '../family/reportLogic'
import { bodyNodes } from './model'
import { computeKpis } from './kpisLogic'
import { labVerdict } from './labsLogic'
import { entrySpec, previewReading } from './readingPreview'
import { rangeState, type Reading } from './ranges'
import { kindOf, verdictFor } from './verdict'
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
