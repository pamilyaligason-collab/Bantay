import { describe, expect, it } from 'vitest'
import type { Reading } from '../health/ranges'
import type { Medication, MedTaken } from '../log/store'
import { adherence, bringUp, buildReport, canViewReport, flagLine, flaggedLabs, vitalCards } from './reportLogic'

// Made-up data only. "Now" is Wed 21 Oct 2026, noon, local.
const NOW = new Date(2026, 9, 21, 12, 0, 0)
const ago = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const r = (test: string, value: number, unit: string, days = 1, extra: Partial<Reading> = {}): Reading => ({ personId: 'p1', takenAt: ago(days), test, value, unit, ...extra })
const med: Medication = { personId: 'p1', name: 'Losartan', serverId: 'm1', medStatus: 'active', schedule: { v: 1, times: ['08:00'] } }
const take = (daysAgo: number): MedTaken => {
  const d = new Date(2026, 9, 21 - daysAgo, 8, 5)
  return { personId: 'p1', name: 'Losartan', takenAt: d.toISOString(), medicationId: 'm1', slot: '08:00' }
}

describe('vitalCards', () => {
  it('joins blood pressure into one card and judges it by the worse number', () => {
    const v = vitalCards([r('bp_systolic', 132, 'mmHg'), r('bp_diastolic', 76, 'mmHg')], NOW)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ key: 'bp', value: '132/76', pos: 'above', word: 'A bit high', icon: 'up' })
  })
  it('says Usual for an in-range reading and never "Usual" when there is no range', () => {
    const v = vitalCards([r('heart_rate', 72, 'bpm'), r('weight', 58.2, 'kg')], NOW)
    expect(v.find((x) => x.key === 'heart_rate')).toMatchObject({ word: 'Usual', pos: 'within' })
    expect(v.find((x) => x.key === 'weight')).toMatchObject({ word: 'No range to compare', pos: 'none', icon: 'info' })
  })
  it('ignores readings older than 30 days, non-numbers, and labs', () => {
    expect(vitalCards([r('heart_rate', 72, 'bpm', 45), r('heart_rate', NaN, 'bpm'), r('ldl', 150, 'mg/dL')], NOW)).toEqual([])
  })
  it('uses the family limit when there is one', () => {
    const v = vitalCards([r('heart_rate', 72, 'bpm')], NOW, () => ({ low: 50, high: 60 }))
    expect(v[0]!.pos).toBe('above')
  })
})

describe('adherence', () => {
  it('builds 7 cells ending today; a past day without a take is missed, today open is pending', () => {
    const takes = [take(6), take(5), take(4), take(3), take(2) /* Mon 19 */] // Tue 20 missed, Wed 21 pending
    const a = adherence([med], takes, 'p1', NOW)
    expect(a.cells.map((c) => c.state)).toEqual(['taken', 'taken', 'taken', 'taken', 'taken', 'missed', 'pending'])
    expect(a.cells[6]!.label).toBe('Wed')
    expect(a.cells[5]!.label).toBe('Tue')
    expect(a).toMatchObject({ taken: 5, due: 6 }) // today's open dose is not counted as due yet
    expect(a.missed).toEqual([{ day: '2026-10-20', label: 'Tue', names: ['Losartan'] }])
  })
  it('counts today as taken once it is taken', () => {
    const a = adherence([med], [take(0)], 'p1', NOW)
    expect(a.cells[6]!.state).toBe('taken')
  })
  it('a skipped dose is not a taken dose', () => {
    const a = adherence([med], [{ ...take(1), skipped: true }], 'p1', NOW)
    expect(a.cells[5]!.state).toBe('missed')
  })
  it('no medicines gives "none" cells and no counts, not zeros that look like 100%', () => {
    const a = adherence([], [], 'p1', NOW)
    expect(a.cells.every((c) => c.state === 'none')).toBe(true)
    expect(a.due).toBe(0)
  })
  it('as-needed and other people\'s medicines make no cells', () => {
    const a = adherence([{ ...med, asNeeded: true }, { ...med, personId: 'p2' }], [], 'p1', NOW)
    expect(a.due).toBe(0)
  })
})

describe('flaggedLabs', () => {
  it('lists only out-of-range labs, with a verdict word', () => {
    const f = flaggedLabs([r('ldl', 162, 'mg/dL'), r('creatinine', 0.9, 'mg/dL', 1, { labLow: 0.6, labHigh: 1.3 }), r('hemoglobin', 11.2, 'g/dL', 1, { labLow: 12, labHigh: 17.5 }), r('uric_acid', 5.1, 'mg/dL')])
    expect(f.total).toBe(4)
    expect(f.flagged.map((x) => [x.test, x.word, x.icon]).sort()).toEqual([['hemoglobin', 'Low', 'down'], ['ldl', 'High', 'up']])
  })
})

describe('bringUp', () => {
  it('numbers flagged vitals, labs, missed doses, then saved questions; no repeats; capped', () => {
    const rep = buildReport({ readings: [r('bp_systolic', 140, 'mmHg'), r('bp_diastolic', 90, 'mmHg'), r('ldl', 162, 'mg/dL')], meds: [med], takes: [take(6), take(5)], questions: ['Can I stop the aspirin?', 'Can I stop the aspirin?', '  '], personId: 'p1', now: NOW })
    expect(rep.bring).toHaveLength(4)
    expect(rep.bring[0]).toMatch(/blood pressure was a bit high/i)
    expect(rep.bring[1]).toMatch(/^LDL cholesterol was high/i)
    expect(rep.bring[2]).toMatch(/doses were missed this week \(Losartan\)/)
    expect(rep.bring[3]).toBe('Can I stop the aspirin?')
  })
  it('caps at 8', () => {
    const q = Array.from({ length: 12 }, (_, i) => `Question ${i}`)
    expect(bringUp({ vitals: [], labs: [], missed: [], questions: q })).toHaveLength(8)
  })
  it('is empty when nothing is flagged and nothing was saved', () => {
    expect(bringUp({ vitals: [], labs: [], missed: [], questions: [] })).toEqual([])
  })
})

describe('flagLine (People list: no numbers)', () => {
  const base = { meds: [] as Medication[], takes: [] as MedTaken[], personId: 'p1', now: NOW }
  it('counts what needs a look and carries no digits except the count', () => {
    const l = flagLine({ ...base, readings: [r('bp_systolic', 150, 'mmHg'), r('bp_diastolic', 95, 'mmHg'), r('ldl', 162, 'mg/dL')] })
    expect(l).toBe('2 to check')
  })
  it('says All up to date only when there is data and nothing is flagged', () => {
    expect(flagLine({ ...base, readings: [r('heart_rate', 72, 'bpm')] })).toBe('All up to date')
  })
  it('is null when this phone has nothing for them (unknown is not "up to date")', () => {
    expect(flagLine({ ...base, readings: [] })).toBeNull()
  })
})

describe('canViewReport (mirrors readings RLS)', () => {
  const o = { signedIn: true, personId: 'p2', ownId: 'p1', carerIds: [] as string[], isAdmin: false }
  it('the person themself', () => expect(canViewReport({ ...o, personId: 'p1' })).toBe(true))
  it('a carer, including a read-only one', () => expect(canViewReport({ ...o, carerIds: ['p2'] })).toBe(true))
  it('an admin', () => expect(canViewReport({ ...o, isAdmin: true })).toBe(true))
  it('a stranger is refused', () => expect(canViewReport(o)).toBe(false))
  it('no person, or no known own person, is refused', () => {
    expect(canViewReport({ ...o, personId: '' })).toBe(false)
    expect(canViewReport({ ...o, ownId: '', personId: '' })).toBe(false)
  })
  it('a phone with nobody signed in (local only) is allowed', () => expect(canViewReport({ ...o, signedIn: false })).toBe(true))
})
