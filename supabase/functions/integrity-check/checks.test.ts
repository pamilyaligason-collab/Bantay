// @vitest-environment node
// Fixtures follow the shapes of the real tables (readings, lab_results, activity) read on 10 Nov 2026: ids and people are made up, values are hand-checked below.
import { describe, expect, it } from 'vitest'
import { sleepNights, stepDayTotals } from '../../../src/features/health/model.ts'
import { type ActivityRow, type LabRow, type ReadingRow, checkValue, normUnit, runChecks, sleepFindings, stepsFindings, wakeDay } from './checks.ts'

const P = '11111111-1111-1111-1111-111111111111'
const Q = '22222222-2222-2222-2222-222222222222'
const NONE = new Set<string>()
const rd = (id: string, test: string, value: number | null, unit: string | null, taken_at: string, person_id = P, lab_result_id: string | null = null): ReadingRow => ({ id, person_id, taken_at, test, value, unit, lab_result_id })
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
  it('same person, test and value within a minute: one finding for the group (heart rate re-sync, 3 rows)', () => {
    const r = run({ readings: [rd('a', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z'), rd('b', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z'), rd('c', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:40Z')] })
    expect(kinds(r)).toEqual(['duplicate:g:a']) // one finding for the group, not one per row
    expect(r.findings[0]!.detail).toEqual({ test: 'heart_rate', count: 3, first_row: 'a', last_row: 'c', sample_ids: ['b', 'c'], span_s: 40 })
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
    expect(kinds(r)).toEqual(['duplicate:g:l1'])
  })
  it('two differential counts of 50 % on one day are different tests, not duplicates', () => {
    const r = run({ labs: [lab('n', null, 50, '%', undefined, 'confirmed', 'Neutrophils'), lab('y', null, 50, '%', undefined, 'confirmed', 'Lymphocytes'), lab('n2', null, 50, '%', undefined, 'confirmed', 'neutrophils ')] })
    expect(kinds(r)).toEqual(['duplicate:g:n'])
  })
  it('activity: the same steps row twice is a duplicate; the same value on another start is not', () => {
    const r = run({ activity: [st('s1', m(9, 8), 1200), st('s2', m(9, 8), 1200), st('s3', m(9, 9), 1200)] })
    expect(kinds(r)).toEqual(['duplicate:g:s1'])
  })
})

describe('blood pressure pair', () => {
  it('the bottom number at or above the top number is impossible', () => {
    const r = run({ readings: [rd('s', 'bp_systolic', 80, 'mmHg', '2026-11-09T10:00:10Z'), rd('d', 'bp_diastolic', 90, 'mmHg', '2026-11-09T10:00:30Z')] })
    expect(kinds(r)).toEqual(['impossible:g:d'])
  })
  it('120/80 is fine', () => {
    expect(run({ readings: [rd('s', 'bp_systolic', 120, 'mmHg', '2026-11-09T10:00:10Z'), rd('d', 'bp_diastolic', 80, 'mmHg', '2026-11-09T10:00:30Z')] }).findings).toEqual([])
  })
})

describe('labs', () => {
  it('lab without a unit, mixed with a good one and a rejected one', () => {
    const r = run({ labs: [lab('a', 'hemoglobin', 215, null), lab('b', 'hemoglobin', 150, 'g/L'), lab('c', 'hemoglobin', 215, null, undefined, 'rejected')] })
    expect(kinds(r)).toEqual(['no_unit:g:a'])
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
  it('overlapping rows double count the day: flagged with what the app shows (1 750, not 2 200)', () => {
    const r = run({ activity: [st('a', m(9, 8, 0), 1000, 60), st('b', m(9, 8, 30), 900, 60), st('c', m(9, 10, 0), 300, 30)] })
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]).toMatchObject({ kind: 'tile_mismatch', detail: { metric: 'steps', day: '2026-11-09', rows_total: 2200, shown_total: 1750, overlapping_rows: 1 } }) // a 1000, b adds its later half (450), c 300
  })
  it('back to back rows are fine; 961 real-shaped rows of up to 60 min pass', () => {
    expect(run({ activity: [st('a', m(9, 8, 0), 1000, 60), st('b', m(9, 9, 0), 900, 60)] }).findings).toEqual([])
  })
  it('impossible: 20 000 steps in 30 minutes and 120 000 in a day', () => {
    expect(kinds(run({ activity: [st('a', m(9, 8, 0), 20000, 30)] }))).toEqual(['impossible:g:a'])
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

describe('volume: one finding per group, not per row (live shape: ~10 100 duplicate heart rate rows, 650 groups)', () => {
  const burst = (prefix: string, minute: number, n: number, value = 72) => Array.from({ length: n }, (_, i) => rd(`${prefix}${String(i).padStart(4, '0')}`, 'heart_rate', value, 'bpm', new Date(Date.UTC(2026, 10, 9, 10, minute, i % 30)).toISOString()))
  it('600 identical rows in one minute are ONE finding with count, first, last and at most 5 sample ids', () => {
    const r = run({ readings: burst('a', 0, 600) })
    expect(r.findings).toHaveLength(1)
    const d = r.findings[0]!.detail
    expect(r.findings[0]!.row_ref).toBe('g:a0000')
    expect(d).toMatchObject({ test: 'heart_rate', count: 600, first_row: 'a0000' })
    expect((d.sample_ids as string[])).toEqual(['a0030', 'a0060', 'a0090', 'a0120', 'a0150']) // earliest first (time, then id)
    expect(JSON.stringify(r.findings[0]!.detail).length).toBeLessThan(2000) // fits the table check
    expect(r.counts.dupes).toBe(599) // rows, not groups
  })
  it('three minutes apart are three groups; a rerun gives the same row_refs (stable keys)', () => {
    const rows = [...burst('a', 0, 200), ...burst('b', 5, 200), ...burst('c', 9, 200)]
    const r = run({ readings: rows })
    expect(kinds(r)).toEqual(['duplicate:g:a0000', 'duplicate:g:b0000', 'duplicate:g:c0000'])
    expect(kinds(run({ readings: [...rows].reverse() }))).toEqual(kinds(r))
    expect(r.counts.dupes).toBe(597)
  })
  it('the same impossible value repeated on one day is one finding with value_min and value_max; another day is another finding', () => {
    const rows = [...Array.from({ length: 40 }, (_, i) => rd(`x${i}`, 'heart_rate', 300 + i, 'bpm', new Date(Date.UTC(2026, 10, 9, 2, i * 5)).toISOString())), rd('y0', 'heart_rate', 300, 'bpm', '2026-11-11T02:00:00Z')]
    const r = run({ readings: rows })
    expect(kinds(r)).toEqual(['impossible:g:x0', 'impossible:g:y0'])
    expect(r.findings[0]!.detail).toMatchObject({ reason: 'out_of_range', count: 40, value_min: 300, value_max: 339, first_row: 'x0', last_row: 'x39' })
    expect(r.findings[0]!.detail.value).toBeUndefined()
    expect(r.counts.impossible).toBe(41)
  })
  it('repeated impossible steps rows from one source on one day are one finding; another source is another', () => {
    const fast = (id: string, h: number, source: string): ActivityRow => ({ ...st(id, m(9, h, 0), 20000, 30), source })
    const r = run({ activity: [fast('a', 8, 'health-connect'), fast('b', 10, 'health-connect'), fast('c', 12, 'health-connect'), fast('d', 14, 'manual')] })
    expect(kinds(r).filter((k) => k.startsWith('impossible'))).toEqual(['impossible:g:a', 'impossible:g:d'])
    expect(r.findings.find((f) => f.row_ref === 'g:a')!.detail).toMatchObject({ count: 3, reason: 'over_250_a_minute' })
  })
})

describe('lab values mirrored into readings are checked once', () => {
  it('a bad lab with its readings mirror gives one finding (on the lab), not two', () => {
    const r = run({ labs: [lab('l1', 'hemoglobin', 215, null)], readings: [rd('m1', 'hemoglobin', 215, null, '2026-10-01T00:00:00Z', P, 'l1')] })
    expect(kinds(r)).toEqual(['no_unit:g:l1'])
    expect(r.findings[0]!.table_name).toBe('lab_results')
  })
  it('a mirror row is also left out of the duplicate check; a hand-entered reading with the same value is still checked', () => {
    const r = run({ readings: [rd('m1', 'hemoglobin', 150, 'g/L', '2026-10-01T00:00:00Z', P, 'l1'), rd('m2', 'hemoglobin', 150, 'g/L', '2026-10-01T00:00:00Z', P, 'l2'), rd('h1', 'weight', 900, 'kg', '2026-10-01T00:00:00Z')] })
    expect(kinds(r)).toEqual(['impossible:g:h1'])
  })
})

describe('local day at the edge of midnight and in other zones (ML-38)', () => {
  const CST = -360 // Texas in November
  it('Manila 23:30 and 00:30: a night that starts either side of midnight wakes on the 10th', () => {
    expect(wakeDay(m(9, 23, 30), 400, 'health-connect').day).toBe('2026-11-10')
    expect(wakeDay(m(10, 0, 30), 400, 'health-connect').day).toBe('2026-11-10')
    expect(wakeDay(m(10, 0, 30), 400, 'manual').day).toBe('2026-11-10') // a manual row counts on the day it was logged
  })
  it('Texas (UTC-6): 23:30 and 00:30 local, and an afternoon nap, use the Texas clock, not Manila or UTC', () => {
    expect(wakeDay('2026-11-10T05:30:00Z', 400, 'health-connect', CST).day).toBe('2026-11-10') // 23:30 on the 9th in Texas
    expect(wakeDay('2026-11-10T06:30:00Z', 400, 'health-connect', CST).day).toBe('2026-11-10') // 00:30 on the 10th
    expect(wakeDay('2026-11-10T20:00:00Z', 45, 'health-connect', CST)).toEqual({ day: '2026-11-10', nap: true }) // 14:00 local
    expect(wakeDay('2026-11-10T20:00:00Z', 45, 'health-connect', 480)).toEqual({ day: '2026-11-11', nap: false }) // the same instant in Manila is 04:00 on the 11th: a night start
  })
  it('a Texas night split across midnight is one night under the Texas offset', () => {
    const rows = [sl('a', '2026-11-10T03:00:00Z', 120), sl('b', '2026-11-10T05:00:00Z', 240)] // 21:00 and 23:00 on the 9th, Texas
    expect(sleepFindings(rows, CST)).toEqual([])
    expect(wakeDay(rows[0]!.started_at, 120, 'health-connect', CST).day).toBe(wakeDay(rows[1]!.started_at, 240, 'health-connect', CST).day)
  })
})

describe('steps: the server count is the app count (parity with stepDayTotals)', () => {
  const off = -new Date(2026, 10, 10).getTimezoneOffset()
  const L = (h: number, mi = 0) => new Date(2026, 10, 10, h, mi).toISOString()
  it('many short rows with overlapping pairs: same shown total on both sides', () => {
    const rows: ActivityRow[] = []
    for (let i = 0; i < 40; i++) rows.push(st(`r${i}`, L(6, i * 10), 100 + i, 10)) // back to back
    for (let i = 0; i < 40; i += 4) rows.push(st(`o${i}`, L(6, i * 10 + 5), 80, 10)) // half overlapping the row before
    const app = stepDayTotals(rows.map((r) => ({ kind: 'steps', steps: r.steps as number, minutes: r.minutes as number, startedAt: r.started_at, source: r.source ?? undefined }))).get('2026-11-10')!
    const f = stepsFindings(rows, new Set(), off).find((x) => x.kind === 'tile_mismatch')!
    expect(f.detail.shown_total).toBe(app)
    expect(app).toBeLessThan(rows.reduce((s, r) => s + Number(r.steps), 0))
  })
  it('zero-length rows inside a covered span and negative rows: the same shown total on both sides', () => {
    const rows = [st('a', L(9, 0), 1000, 10), st('b', L(9, 5), 400, null), st('c', L(9, 5), 400, 0), st('d', L(9, 10), 300, null), st('e', L(11), 250, null), st('f', L(12), -50, 10), st('g', L(12, 30), 600, 30)]
    const app = stepDayTotals(rows.map((r) => ({ kind: 'steps', steps: r.steps as number, minutes: r.minutes as number, startedAt: r.started_at, source: r.source ?? undefined }))).get('2026-11-10')!
    expect(app).toBe(2150) // 1000 + 300 (at the span end) + 250 + 600; the two inside the span and the negative add nothing
    const f = stepsFindings(rows, new Set(), off)
    expect(f.find((x) => x.kind === 'tile_mismatch')!.detail).toMatchObject({ shown_total: app, rows_total: 2950 }) // the negative row is dropped from the rows total too
    expect(f.some((x) => x.detail.reason === 'negative')).toBe(true) // and still flagged
  })
})
