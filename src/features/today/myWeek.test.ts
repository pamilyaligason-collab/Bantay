import { describe, expect, it } from 'vitest'
import type { Reading } from '../health/ranges'
import type { MedTaken, Medication } from '../log/store'
import { computeMyWeek, lastDays, nextReadingDue, sparkPoints } from './myWeek'

const now = new Date(2026, 9, 20, 15, 0)
const day = (back: number, h = 9) => new Date(2026, 9, 20 - back, h).toISOString()
const rd = (test: string, value: number, back: number, o: Partial<Reading> = {}): Reading => ({ personId: 'me', takenAt: day(back), test, value, ...o })
const base = { personId: 'me', readings: [] as Reading[], activity: [], meds: [] as Medication[], takes: [] as MedTaken[], now }
const find = (t: ReturnType<typeof computeMyWeek>, code: string) => t.find((x) => x.code === code)

describe('computeMyWeek', () => {
  it('no data at all gives no tiles, never zeros', () => {
    expect(computeMyWeek(base)).toEqual([])
  })
  it('blood pressure: average top/bottom with a range chip, only the last 7 days, only me', () => {
    const t = computeMyWeek({ ...base, readings: [rd('bp_systolic', 130, 1), rd('bp_diastolic', 80, 1), rd('bp_systolic', 140, 3), rd('bp_diastolic', 90, 3), rd('bp_systolic', 200, 9), rd('bp_systolic', 90, 1, { personId: 'ma' })] })
    const bp = find(t, 'bp_systolic')!
    expect(bp.value).toBe('135/85')
    expect(bp.href).toBe('#health/metric/bp_systolic')
    expect(bp.state?.kind).toBe('high')
    expect(bp.spark).toHaveLength(7)
    expect(bp.spark.filter((v) => v != null)).toEqual([140, 130])
  })
  it('fasting sugar average; other sugar tests are ignored', () => {
    const t = computeMyWeek({ ...base, readings: [rd('fasting_glucose', 90, 1), rd('fasting_glucose', 100, 2), rd('glucose', 200, 1)] })
    expect(find(t, 'fasting_glucose')).toMatchObject({ value: '95', unit: 'mg/dL' })
    expect(find(t, 'fasting_glucose')!.state?.kind).toBe('within')
  })
  it('weight shows the change, or the weight itself for one reading', () => {
    expect(find(computeMyWeek({ ...base, readings: [rd('weight', 62, 5), rd('weight', 61.4, 0)] }), 'weight')).toMatchObject({ value: '-0.6', unit: 'kg this week' })
    expect(find(computeMyWeek({ ...base, readings: [rd('weight', 62, 2)] }), 'weight')).toMatchObject({ value: '62', sub: 'latest reading' })
  })
  it('steps a day against the 6000 goal; zero-step rows do not count', () => {
    const t = computeMyWeek({ ...base, activity: [{ kind: 'steps', steps: 4000, startedAt: day(1) }, { kind: 'steps', steps: 8000, startedAt: day(2) }, { kind: 'steps', steps: 0, startedAt: day(3) }, { kind: 'walk', steps: null, startedAt: day(3) }] })
    expect(find(t, 'steps')).toMatchObject({ value: '6,000', sub: 'goal 6,000, reached' })
  })
  it('BP chip judges the worse of top and bottom: 110/95 is not "within range"', () => {
    const t = computeMyWeek({ ...base, readings: [rd('bp_systolic', 110, 1), rd('bp_diastolic', 95, 1)] })
    expect(find(t, 'bp_systolic')!.state?.kind).toBe('high')
  })
  it("doses on time: within 2 hours of the slot, from each medicine's first day, today only once its 2 hours passed", () => {
    const meds: Medication[] = [{ personId: 'me', name: 'Losartan', serverId: 'm1', schedule: { v: 1, times: ['08:00'] }, medStatus: 'active', startedOn: '2026-10-16' }]
    const take = (back: number, h: number, o: Partial<MedTaken> = {}): MedTaken => ({ personId: 'me', name: 'Losartan', takenAt: day(back, h), medicationId: 'm1', slot: '08:00', ...o })
    const t = computeMyWeek({ ...base, meds, takes: [take(1, 9), take(2, 13), take(3, 8, { skipped: true }), take(0, 8)] })
    // started 16 Oct: 16..19 past + today (08:00 + 2 h has passed at 15:00) = 5 doses; on time: yesterday 09:00 and today 08:00
    expect(find(t, 'doses')).toMatchObject({ value: '2 of 5', href: '#health' })
  })
  it('a medicine with no start date counts from its first take, not from before it was added', () => {
    const meds: Medication[] = [{ personId: 'me', name: 'Losartan', serverId: 'm1', schedule: { v: 1, times: ['08:00'] }, medStatus: 'active' }]
    const t = computeMyWeek({ ...base, meds, takes: [{ personId: 'me', name: 'Losartan', takenAt: day(2, 8), medicationId: 'm1', slot: '08:00' }] })
    expect(find(t, 'doses')).toMatchObject({ value: '1 of 3' }) // 18, 19, 20 Oct
  })
  it('no schedule: no doses tile. Resting heart rate is the daily low, averaged', () => {
    const t = computeMyWeek({ ...base, readings: [rd('heart_rate', 80, 1), rd('heart_rate', 64, 1), rd('heart_rate', 70, 2)] })
    expect(find(t, 'doses')).toBeUndefined()
    expect(find(t, 'heart_rate')).toMatchObject({ value: '67', unit: 'bpm' })
  })
})

describe('nextReadingDue (H6)', () => {
  const med = (name: string): Medication => ({ personId: 'me', name, schedule: { v: 1, times: ['08:00'] }, medStatus: 'active' })
  it('names the reading missing for a BP or sugar medicine', () => {
    expect(nextReadingDue({ personId: 'me', readings: [], meds: [med('Losartan 50 mg')], now })).toBe('Next reading due: blood pressure')
    expect(nextReadingDue({ personId: 'me', readings: [], meds: [med('Losartan'), med('Metformin')], now })).toBe('Next reading due: blood pressure and blood sugar')
  })
  it("nothing when a reading is in, there is no such medicine, or it is another person's", () => {
    expect(nextReadingDue({ personId: 'me', readings: [rd('bp_systolic', 120, 2)], meds: [med('Losartan')], now })).toBeNull()
    expect(nextReadingDue({ personId: 'me', readings: [], meds: [med('Vitamin C')], now })).toBeNull()
    expect(nextReadingDue({ personId: 'ma', readings: [], meds: [med('Losartan')], now })).toBeNull()
  })
})

describe('helpers', () => {
  it('lastDays is seven days ending today', () => {
    const d = lastDays(now)
    expect(d).toHaveLength(7)
    expect(d[6]).toBe('2026-10-20')
    expect(d[0]).toBe('2026-10-14')
  })
  it('sparkPoints needs two days of data', () => {
    expect(sparkPoints([null, 5, null], 70, 28)).toBeNull()
    const p = sparkPoints([1, null, 3], 70, 28)!
    expect(p).toHaveLength(2)
    expect(p[1]!.y).toBeLessThan(p[0]!.y) // higher value is higher on screen
  })
})
