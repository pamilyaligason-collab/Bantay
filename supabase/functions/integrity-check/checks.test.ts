// @vitest-environment node
// Fixtures follow the shapes of the real tables (readings, lab_results, activity) read on 10 Nov 2026: ids and people are made up, values are hand-checked below.
import { describe, expect, it } from 'vitest'
import { sleepNights } from '../../../src/features/health/model.ts'
import { type ActivityRow, type LabRow, type ReadingRow, checkValue, normUnit, runChecks, sleepFindings, wakeDay } from './checks.ts'

const P = '11111111-1111-1111-1111-111111111111'
const Q = '22222222-2222-2222-2222-222222222222'
const NONE = new Set<string>()
const rd = (id: string, test: string, value: number | null, unit: string | null, taken_at: string, person_id = P): ReadingRow => ({ id, person_id, taken_at, test, value, unit })
const lab = (id: string, test_code: string | null, value_num: number | null, unit_raw: string | null, collected_at = '2026-10-01T00:00:00Z', status = 'confirmed', name_raw: string | null = null): LabRow => ({ id, person_id: P, test_code, name_raw, value_num, unit_raw, collected_at, status })
// Manila local time -> instant (UTC+8)
const m = (d: number, h: number, mi = 0) => new Date(Date.UTC(2026, 10, d, h - 8, mi)).toISOString()
const sl = (id: string, started_at: string, minutes: number, source = 'health-connect', person_id = P): ActivityRow => ({ id, person_id, kind: 'sleep', minutes, steps: null, started_at, source })
const st = (id: string, started_at: string, steps: number, minutes: number | null = 30, person_id = P): ActivityRow => ({ id, person_id, kind: 'steps', minutes, steps, started_at, source: 'health-connect' })
const run = (x: { readings?: ReadingRow[]; labs?: LabRow[]; activity?: ActivityRow[]; logged?: Set<string> }) => runChecks({ readings: x.readings ?? [], labs: x.labs ?? [], activity: x.activity ?? [], logged: x.logged ?? NONE })
const kinds = (r: ReturnType<typeof run>) => r.findings.map((f) => `${f.kind}:${f.row_ref}`).sort()

describe('units', () => {
  it('reads the unit spellings found in the real lab table as one unit', () => {
    for (const u of ['x10^9/L', '10^9/L', '10⁹/L', '10^9 / L', '10^9 /L']) expect(normUnit(u)).toBe('109/l')
    for (const u of ['10^12/L', '10¹²/L', '10^12 / L']) expect(normUnit(u)).toBe('1012/l')
    expect(normUnit('mL/min/1.73 m2')).toBe(normUnit('mL/min/1.73m^2'))
    expect(normUnit('µmol/L')).toBe('umol/l')
    expect(normUnit(null)).toBe('')
  })
})

describe('checkValue', () => {
  it('passes plausible values in their own unit', () => {
    expect(checkValue('bp_systolic', 'mmHg', 120)).toBeNull()
    expect(checkValue('heart_rate', 'bpm', 51)).toBeNull()
    expect(checkValue('hemoglobin', 'g/L', 207)).toBeNull()
    expect(checkValue('creatinine', 'umol/L', 122.7)).toBeNull()
    expect(checkValue('hematocrit', 'L/L', 0.653)).toBeNull()
  })
  it('sugar in mg/dL that is really mmol/L is a unit mismatch, and the reverse', () => {
    expect(checkValue('glucose', 'mg/dL', 5.6)).toMatchObject({ kind: 'unit_mismatch', detail: { reason: 'fits_other_unit', likely_unit: 'mmol/l' } })
    expect(checkValue('glucose', 'mmol/L', 126)).toMatchObject({ kind: 'unit_mismatch', detail: { likely_unit: 'mg/dl' } })
    expect(checkValue('fasting_glucose', 'mg/dL', 91)).toBeNull()
  })
  it('a hematocrit of 0.46 written in % and 46 written in L/L are mismatches (never converted)', () => {
    expect(checkValue('hematocrit', '%', 0.46)).toMatchObject({ kind: 'unit_mismatch' })
    expect(checkValue('hematocrit', 'L/L', 46)).toMatchObject({ kind: 'unit_mismatch' })
  })
  it('impossible values: BP, pulse, ALT, zero and negative', () => {
    expect(checkValue('bp_systolic', 'mmHg', 400)).toMatchObject({ kind: 'impossible', detail: { reason: 'out_of_range', low: 50, high: 300 } })
    expect(checkValue('bp_diastolic', 'mmHg', 5)).toMatchObject({ kind: 'impossible' })
    expect(checkValue('heart_rate', 'bpm', 300)).toMatchObject({ kind: 'impossible' })
    expect(checkValue('alt', 'U/L', 20000)).toMatchObject({ kind: 'impossible' })
    expect(checkValue('ast', 'U/L', 0)).toMatchObject({ kind: 'impossible', detail: { reason: 'zero_or_negative' } })
    expect(checkValue('weight', 'kg', -3)).toMatchObject({ kind: 'impossible' })
  })
  it('an unknown or garbled unit is a mismatch; a unit that belongs to another test (rbc /hpf) too', () => {
    expect(checkValue('uric_acid', 'mg/tltr-', 0.67)).toMatchObject({ kind: 'unit_mismatch', detail: { reason: 'unknown_unit' } })
    expect(checkValue('ast', 'mg/dL', 150.94)).toMatchObject({ kind: 'unit_mismatch', detail: { reason: 'unknown_unit', expected: 'u/l' } })
    expect(checkValue('rbc', '/hpf', 2)).toMatchObject({ kind: 'unit_mismatch' })
  })
  it('a missing unit is its own finding; a missing value is no finding (unknown, never 0)', () => {
    expect(checkValue('hemoglobin', null, 215)).toMatchObject({ kind: 'no_unit' })
    expect(checkValue('hemoglobin', '  ', 215)).toMatchObject({ kind: 'no_unit' })
    expect(checkValue('hemoglobin', 'g/L', null)).toBeNull()
    expect(checkValue(null, '%', 84.6)).toBeNull() // no test code: nothing to compare to
  })
  it('a finding carries the test, value and unit text and no name', () => {
    expect(checkValue('bp_systolic', 'mmHg', 400)!.detail).toEqual({ test: 'bp_systolic', value: 400, unit: 'mmHg', reason: 'out_of_range', low: 50, high: 300 })
  })
})

describe('duplicates', () => {
  it('same person, test and value within a minute: the later one is the duplicate (heart rate re-sync, 3 rows)', () => {
    const r = run({ readings: [rd('a', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z'), rd('b', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z'), rd('c', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:40Z')] })
    expect(kinds(r)).toEqual(['duplicate:b', 'duplicate:c'])
    expect(r.findings.find((f) => f.row_ref === 'c')!.detail).toMatchObject({ duplicate_of: 'a', gap_s: 40, test: 'heart_rate' })
    expect(r.counts).toEqual({ dupes: 2, impossible: 0, mismatched: 0, checked: 3 })
  })
  it('a different value, a different person or more than a minute apart is not a duplicate', () => {
    const r = run({ readings: [rd('a', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z'), rd('b', 'heart_rate', 73, 'bpm', '2026-11-09T10:00:00Z'), rd('c', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z', Q), rd('d', 'heart_rate', 72, 'bpm', '2026-11-09T10:01:01Z')] })
    expect(r.findings).toEqual([])
  })
  it('rows already in records_dedupe_log are not reported again', () => {
    const r = run({ readings: [rd('a', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z'), rd('b', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z')], logged: new Set(['b']) })
    expect(r.findings).toEqual([])
  })
  it('a rejected lab copy is not checked (the dedupe run set it aside); a draft twin of a confirmed result is a duplicate', () => {
    const r = run({ labs: [lab('l1', 'hdl', 57.64, 'mg/dL'), lab('l2', 'hdl', 57.64, 'mg/dL', undefined, 'rejected'), lab('l3', 'hdl', 57.64, 'mg/dL', undefined, 'draft')] })
    expect(kinds(r)).toEqual(['duplicate:l3'])
  })
  it('two differential counts of 50 % on one day are different tests, not duplicates', () => {
    const r = run({ labs: [lab('n', null, 50, '%', undefined, 'confirmed', 'Neutrophils'), lab('y', null, 50, '%', undefined, 'confirmed', 'Lymphocytes'), lab('n2', null, 50, '%', undefined, 'confirmed', 'neutrophils ')] })
    expect(kinds(r)).toEqual(['duplicate:n2'])
  })
  it('activity: the same steps row twice is a duplicate; the same value on another start is not', () => {
    const r = run({ activity: [st('s1', m(9, 8), 1200), st('s2', m(9, 8), 1200), st('s3', m(9, 9), 1200)] })
    expect(kinds(r)).toEqual(['duplicate:s2'])
  })
})

describe('blood pressure pair', () => {
  it('the bottom number at or above the top number is impossible', () => {
    const r = run({ readings: [rd('s', 'bp_systolic', 80, 'mmHg', '2026-11-09T10:00:10Z'), rd('d', 'bp_diastolic', 90, 'mmHg', '2026-11-09T10:00:30Z')] })
    expect(kinds(r)).toEqual(['impossible:d'])
  })
  it('120/80 is fine', () => {
    expect(run({ readings: [rd('s', 'bp_systolic', 120, 'mmHg', '2026-11-09T10:00:10Z'), rd('d', 'bp_diastolic', 80, 'mmHg', '2026-11-09T10:00:30Z')] }).findings).toEqual([])
  })
})

describe('labs', () => {
  it('lab without a unit, mixed with a good one and a rejected one', () => {
    const r = run({ labs: [lab('a', 'hemoglobin', 215, null), lab('b', 'hemoglobin', 150, 'g/L'), lab('c', 'hemoglobin', 215, null, undefined, 'rejected')] })
    expect(kinds(r)).toEqual(['no_unit:a'])
    expect(r.counts).toMatchObject({ mismatched: 1, checked: 2 })
  })
})

describe('sleep: the live bug (10h 57 beside 6 h 38)', () => {
  // real shape: a start at 01:54 on the 9th (259 min) and one at 23:58 on the 9th (398 min); they are two nights
  const live = [sl('a', m(9, 1, 54), 259), sl('b', m(9, 23, 58), 398)]
  it('two nights are two nights: no finding, wake days are the 9th and the 10th', () => {
    expect(wakeDay(m(9, 1, 54), 259, 'health-connect').day).toBe('2026-11-09')
    expect(wakeDay(m(9, 23, 58), 398, 'health-connect').day).toBe('2026-11-10')
    expect(run({ activity: live }).findings).toEqual([])
  })
  it('two watches reporting the same night overlap: the day total counted by adding rows is flagged', () => {
    const r = run({ activity: [sl('a', m(9, 23, 0), 400), sl('b', m(9, 23, 30), 360, 'healthkit')] })
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]).toMatchObject({ kind: 'tile_mismatch', table_name: 'activity', detail: { metric: 'sleep', day: '2026-11-10', rows_total_min: 760, shown_min: 400, double_counted_min: 360 } })
  })
  it('a night of more than 16 h is impossible', () => {
    const r = run({ activity: [sl('a', m(9, 20, 0), 500), sl('b', m(10, 4, 30), 500)] }) // 20:00 to 04:20 and 04:30 to 12:50: no overlap, 1000 min on the wake day
    expect(r.findings.map((f) => [f.kind, f.detail.reason])).toContainEqual(['impossible', 'sleep_over_16h'])
  })
  it('a nap is its own day part and is not double counted', () => {
    expect(run({ activity: [sl('a', m(9, 23, 0), 400), sl('n', m(10, 14, 0), 45)] }).findings).toEqual([])
  })
  it('agrees with the app: the server night equals sleepNights for the same rows', () => {
    const rows = [sl('a', m(9, 22, 0), 120), sl('b', m(10, 1, 30), 180), sl('c', m(10, 1, 0), 120, 'healthkit'), sl('n', m(10, 14, 0), 45)]
    const off = -new Date(2026, 10, 10).getTimezoneOffset() // the zone this test runs in, so both sides use the same clock
    const server = sleepFindings(rows, off)
    const app = [...sleepNights(rows.map((r) => ({ kind: 'sleep', minutes: Number(r.minutes), steps: null, startedAt: r.started_at, source: r.source ?? undefined }))).values()]
    const night = app.find((n) => n.minutes > 0)!
    const shown = night.minutes + night.napMinutes
    const f = server.find((x) => x.kind === 'tile_mismatch')!
    expect(f.detail.shown_min).toBe(Math.round(shown))
    expect(f.detail.rows_total_min).toBe(120 + 180 + 120 + 45)
  })
})

describe('steps', () => {
  it('overlapping rows double count the day: flagged with the number of overlapping rows', () => {
    const r = run({ activity: [st('a', m(9, 8, 0), 1000, 60), st('b', m(9, 8, 30), 900, 60), st('c', m(9, 10, 0), 300, 30)] })
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]).toMatchObject({ kind: 'tile_mismatch', detail: { metric: 'steps', day: '2026-11-09', rows_total: 2200, overlapping_rows: 1 } })
  })
  it('back to back rows are fine; 961 real-shaped rows of up to 60 min pass', () => {
    expect(run({ activity: [st('a', m(9, 8, 0), 1000, 60), st('b', m(9, 9, 0), 900, 60)] }).findings).toEqual([])
  })
  it('impossible: 20 000 steps in 30 minutes and 120 000 in a day', () => {
    expect(kinds(run({ activity: [st('a', m(9, 8, 0), 20000, 30)] }))).toEqual(['impossible:a'])
    const day = Array.from({ length: 8 }, (_, i) => st(`d${i}`, m(9, i * 2, 0), 15000, 60))
    expect(run({ activity: day }).findings.map((f) => f.detail.reason)).toEqual(['over_100000_a_day'])
  })
  it('the Manila day is used: 00:30 Manila on the 10th is the 10th, not the 9th (UTC)', () => {
    expect(run({ activity: [st('a', m(10, 0, 30), 130000, 0)] }).findings[0]!.detail.day).toBe('2026-11-10')
  })
})

describe('result', () => {
  it('counts and one finding per (kind, table, row)', () => {
    const r = run({ readings: [rd('a', 'bp_systolic', 400, 'mmHg', '2026-11-09T10:00:00Z'), rd('g', 'glucose', 5.6, 'mg/dL', '2026-11-09T11:00:00Z')], labs: [lab('x', 'hemoglobin', 150, null)] })
    expect(r.counts).toEqual({ dupes: 0, impossible: 1, mismatched: 2, checked: 3 })
    expect(new Set(r.findings.map((f) => `${f.kind}|${f.table_name}|${f.row_ref}`)).size).toBe(3)
  })
  it('an empty database is a clean run', () => {
    expect(run({})).toEqual({ findings: [], counts: { dupes: 0, impossible: 0, mismatched: 0, checked: 0 } })
  })
})
