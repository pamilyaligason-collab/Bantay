import { describe, expect, it, vi } from 'vitest'
import type { MedTaken, Medication } from '../log/store'
import type { Reading } from './ranges'
import { shareSummary } from './summaryImage'
import { adherence, buildSummary } from './visitSummary'

const NOW = new Date(2026, 10, 1, 21, 0) // 1 Nov 2026, 9 PM local
const ago = (days: number, h = 7) => new Date(2026, 10, 1 - days, h, 30).toISOString()
const r = (test: string, value: number, days: number, personId = 'p1', unit = test.startsWith('bp_') ? 'mmHg' : 'mg/dL'): Reading => ({ personId, takenAt: ago(days), test, value, unit })
const med = (o: Partial<Medication> = {}): Medication => ({ personId: 'p1', name: 'Losartan', strength: '50 mg', dose: '1 tablet', serverId: 's-los', medStatus: 'active', startedOn: '2026-10-01', schedule: { v: 1, times: ['08:00'] }, ...o })
const take = (days: number, h: number, o: Partial<MedTaken> = {}): MedTaken => ({ personId: 'p1', name: 'Losartan', takenAt: ago(days, h), medicationId: 's-los', slot: '08:00', ...o })

describe('visit summary', () => {
  const readings = [
    r('bp_systolic', 124, 1), r('bp_diastolic', 80, 1), r('bp_systolic', 136, 3), r('bp_diastolic', 88, 3),
    r('bp_systolic', 150, 40), // outside 30 days
    r('fasting_glucose', 104, 2), r('fasting_glucose', 96, 9),
    r('bp_systolic', 200, 1, 'p2') // someone else
  ]
  it('averages the last 30 days of BP and sugar, counting readings above the guide', () => {
    const s = buildSummary({ person: { name: 'Maria Sample', birthdate: '1958-03-02', bloodType: 'O+', allergies: ['Penicillin'], conditions: ['Hypertension'] }, readings, meds: [med()], takes: [], personId: 'p1', now: NOW })
    expect(s.bp).toEqual({ text: '130/84 mmHg', n: 2, high: 2 })
    expect(s.sugar).toEqual({ text: '100 mg/dL', n: 2, high: 1 })
    expect(s.facts).toEqual(['68 years · blood type O+', 'Allergies: Penicillin', 'Conditions: Hypertension'])
    expect(s.medicines).toEqual(['Losartan 50 mg: 1 tablet, 8:00 AM'])
    expect(s.lines.join('\n')).toContain('Blood pressure average 130/84 mmHg (2 readings, 2 above the general guide)')
  })
  it('sugar in mmol/L is converted before averaging, and the unit printed is the one averaged; an unknown unit is left out', () => {
    const rs = [r('fasting_glucose', 5.5, 1, 'p1', 'mmol/L'), r('fasting_glucose', 100, 2), r('fasting_glucose', 7, 3, 'p1', 'stone'), r('bp_systolic', 120, 1), r('bp_diastolic', 80, 1)]
    const s = buildSummary({ person: { name: 'A' }, readings: rs, meds: [], takes: [], personId: 'p1', now: NOW })
    expect(s.sugar).toMatchObject({ text: '99.6 mg/dL', n: 2 }) // (99.1 + 100) / 2
    expect(s.bp!.text).toBe('120/80 mmHg')
  })
  it('no readings and no medicines say so, never a zero', () => {
    const s = buildSummary({ person: { name: 'A' }, readings: [], meds: [], takes: [], personId: 'p1', now: NOW })
    expect(s.bp).toBeNull()
    expect(s.adherence).toBeNull()
    expect(s.lines).toContain('Blood pressure: no readings')
    expect(s.lines).toContain('None listed')
    expect(s.lines).toContain('Doses on time: not enough data yet')
  })
  it('adherence: on time within 2 hours, counted from the first day, today only once its slot is over', () => {
    const takes = [take(2, 8), take(1, 8), take(3, 14)] // a 2 PM take for the 8 AM slot is late
    const a = adherence([med({ startedOn: '2026-10-29' })], takes, 'p1', NOW)
    // days 29 Oct..1 Nov: 29 Oct no take, 30 Oct late, 31 Oct on time, 1 Oct... (1 Nov) no take and slot over
    expect(a).toEqual({ done: 2, want: 4, pct: 50 })
  })
})

describe('share', () => {
  const blob = new Blob(['x'], { type: 'image/png' })
  it('uses the system share sheet when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    expect(await shareSummary(blob, 'T', { share, canShare: () => true })).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
    expect(share.mock.calls[0]![0].files[0].name).toBe('visit-summary.png')
  })
  it('says unsupported when the browser cannot share files, cancelled when the person closes the sheet', async () => {
    expect(await shareSummary(blob, 'T', {})).toBe('unsupported')
    expect(await shareSummary(blob, 'T', { share: vi.fn(), canShare: () => false })).toBe('unsupported')
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    expect(await shareSummary(blob, 'T', { share: vi.fn().mockRejectedValue(abort), canShare: () => true })).toBe('cancelled')
  })
})
