import { describe, expect, it } from 'vitest'
import type { Reading } from './ranges'
import { dailyActivity, dailyCount, dailyMean, seriesMean, sleepAverage, vitalSummary, waterSummary } from './trendLogic'
import { memberRings } from './memberRingsLogic'

const NOW = new Date(2026, 10, 9, 12, 0) // Mon 9 Nov 2026 local noon
const at = (d: number, h = 8) => new Date(2026, 10, d, h).toISOString()
const rd = (test: string, value: number, d: number, h = 8): Reading => ({ personId: 'p1', test, value, unit: '', takenAt: at(d, h) })

describe('series: a day with no data is null, never 0', () => {
  it('daily mean of readings over 7 days, oldest first', () => {
    const s = dailyMean([rd('bp_systolic', 120, 7), rd('bp_systolic', 130, 7, 20), rd('bp_systolic', 141, 9), rd('heart_rate', 70, 8)], 'bp_systolic', NOW)
    expect(s).toEqual([null, null, null, null, 125, null, 141])
  })
  it('readings older than the window and non-finite values are ignored', () => {
    expect(dailyMean([rd('heart_rate', 70, 1), rd('heart_rate', Number.NaN, 9)], 'heart_rate', NOW)).toEqual([null, null, null, null, null, null, null])
  })
  it('glasses per day: 2 on the 8th, none elsewhere', () => {
    expect(dailyCount([at(8, 9), at(8, 15), at(1)], NOW)).toEqual([null, null, null, null, null, 2, null])
  })
  it('steps and sleep hours per day', () => {
    const acts = [
      { kind: 'steps', minutes: null, steps: 1000, startedAt: at(9, 7) }, { kind: 'steps', minutes: null, steps: 500, startedAt: at(9, 9) },
      { kind: 'sleep', minutes: 420, steps: null, startedAt: at(8, 9), source: 'manual' }
    ]
    expect(dailyActivity(acts, 'steps', NOW)[6]).toBe(1500)
    expect(dailyActivity(acts, 'steps', NOW)[5]).toBeNull()
    expect(dailyActivity(acts, 'sleep', NOW)[5]).toBe(7) // 420 min = 7 hours on the 8th
  })
  it('mean ignores nulls and is null when there is nothing', () => {
    expect(seriesMean([null, 2, null, 4])).toBe(3)
    expect(seriesMean([null, null])).toBeNull()
  })
})

describe('plain summaries only when data exists', () => {
  it('BP: 7-day average, days counted, the AHA guide wording from the guide data', () => {
    const t = dailyMean([rd('bp_systolic', 128, 8), rd('bp_systolic', 132, 9)], 'bp_systolic', NOW)
    const b = dailyMean([rd('bp_diastolic', 80, 8), rd('bp_diastolic', 84, 9)], 'bp_diastolic', NOW)
    const s = vitalSummary('bp', t, b)!
    expect(s).toContain('Average over the last 7 days: 130/82 mmHg, from 2 days with a reading.')
    expect(s).toContain('under 120 on top, under 80 on the bottom (AHA, 2025)')
  })
  it('BP with no bottom number still reads; pulse says 72 bpm from 1 day with the MedlinePlus guide', () => {
    expect(vitalSummary('bp', [null, 140, null], [])).toContain('140 mmHg, from 1 day with a reading.')
    expect(vitalSummary('pulse', [null, 72, null])).toContain('72 bpm, from 1 day with a reading. General guide for a resting pulse in adults: 60 to 100 (MedlinePlus, 2024).')
  })
  it('no data: no summary at all (null, not a line saying 0)', () => {
    expect(vitalSummary('bp', [null, null], [null])).toBeNull()
    expect(vitalSummary('pulse', [])).toBeNull()
    expect(waterSummary([null, null], 6)).toBeNull()
    expect(sleepAverage([null])).toBeNull()
  })
  it('water average on logged days with the goal; sleep average as hours and minutes', () => {
    expect(waterSummary([null, 4, 6, null], 8)).toBe("Average over the last 7 days: 5 glasses a day, from 2 days with a drink logged. Today's goal is 8.")
    expect(waterSummary([1], null)).toBe('Average over the last 7 days: 1 glass a day, from 1 day with a drink logged.')
    expect(sleepAverage([6.5, null, 7.5])).toEqual({ text: '7 h 00 min', nights: 2 })
  })
})

describe('family rings: masking and null', () => {
  it('a person you may not see in detail gets no medicine numbers even if doses are passed', () => {
    const r = memberRings({ canSeeDetail: false, stepsToday: 3000, doses: { taken: 1, total: 2 }, checkedIn: true })
    expect(r.meds).toBeNull()
    expect(r.steps).toEqual({ n: 3000, ring: 0.5 })
  })
  it('detail visible: medicines 1 of 4 is a quarter ring', () => {
    expect(memberRings({ canSeeDetail: true, stepsToday: null, doses: { taken: 1, total: 4 }, checkedIn: false }).meds).toEqual({ taken: 1, total: 4, ring: 0.25 })
  })
  it('null is not 0: no steps shared is null, no doses due is null, check-in unknown stays null', () => {
    expect(memberRings({ canSeeDetail: true, stepsToday: null, doses: { taken: 0, total: 0 }, checkedIn: null })).toEqual({ steps: null, meds: null, checkedIn: null })
  })
  it('steps over the goal cap the ring at 1; a real 0 is kept as 0', () => {
    expect(memberRings({ canSeeDetail: true, stepsToday: 9000, doses: null, checkedIn: true }).steps!.ring).toBe(1)
    expect(memberRings({ canSeeDetail: true, stepsToday: 0, doses: null, checkedIn: true }).steps).toEqual({ n: 0, ring: 0 })
  })
})
