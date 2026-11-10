// Data integrity checks (S30, lane L2). Pure functions: rows in, findings out. No database, no clock, no names.
// FINDINGS ONLY: nothing here (or in run.ts) changes or deletes a record. A person reviews each finding; a fix is a separate, logged step
// (duplicates only through the existing records_dedupe_log path).
// Medical rule: the ranges below are "cannot be true / cannot be this unit" bounds, wide on purpose. They are not reference ranges and never
// say a value is high or low. A value that fits another unit of the same test is a unit mismatch, never silently converted.

export type Kind = 'duplicate' | 'impossible' | 'unit_mismatch' | 'tile_mismatch' | 'no_unit'
export type Table = 'readings' | 'lab_results' | 'activity'
export type Detail = Record<string, string | number | boolean | null | string[]>
export interface Finding { kind: Kind; table_name: Table; row_ref: string; person_id: string | null; detail: Detail }

export interface ReadingRow { id: string; person_id: string; taken_at: string; test: string; value: number | string | null; unit: string | null; lab_result_id?: string | null }
export interface LabRow { id: string; person_id: string; test_code: string | null; name_raw: string | null; value_num: number | string | null; unit_raw: string | null; collected_at: string | null; status: string }
export interface ActivityRow { id: string; person_id: string; kind: string; minutes: number | string | null; steps: number | string | null; started_at: string; source: string | null }

const MIN = 60_000
export const DUPE_WINDOW_MS = MIN // same person, kind and value within a minute
export const MAX_SLEEP_MIN = 16 * 60 // a night of more than 16 h is not a night
export const MAX_STEPS_DAY = 100_000
const MANILA_OFFSET_MIN = 480

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN)

// ---------- units and plausible bounds ----------
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }
/** "x10^9 / L", "10⁹/L" and "10^9/L" are one unit. Case, spaces, ^, a leading x and the micro sign are ignored. Unknown text stays unknown (never guessed). */
export function normUnit(u: string | null | undefined): string {
  return String(u ?? '').toLowerCase().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUP[c] ?? c).replace(/[µμ]/g, 'u').replace(/\s+/g, '').replace(/\^/g, '').replace(/^x(?=10)/, '')
}

type Bounds = Record<string, readonly [number, number]> // normalised unit -> [lowest, highest] that can be true
const T = (b: Bounds): Bounds => b
export const BOUNDS: Record<string, Bounds> = {
  bp_systolic: T({ mmhg: [50, 300] }),
  bp_diastolic: T({ mmhg: [20, 200] }),
  heart_rate: T({ bpm: [20, 250] }),
  fasting_glucose: T({ 'mg/dl': [20, 900], 'mmol/l': [1.1, 50] }),
  glucose: T({ 'mg/dl': [20, 900], 'mmol/l': [1.1, 50] }),
  weight: T({ kg: [2, 400] }),
  spo2: T({ '%': [50, 100] }),
  temperature: T({ '°c': [30, 45], c: [30, 45] }),
  alt: T({ 'u/l': [1, 10000] }),
  ast: T({ 'u/l': [1, 10000] }),
  bun: T({ 'mg/dl': [1, 300] }),
  creatinine: T({ 'mg/dl': [0.1, 30], 'umol/l': [8, 2650] }),
  egfr: T({ 'ml/min/1.73m2': [1, 200] }),
  hdl: T({ 'mg/dl': [5, 200], 'mmol/l': [0.13, 5.2] }),
  ldl: T({ 'mg/dl': [5, 600], 'mmol/l': [0.13, 15.5] }),
  total_cholesterol: T({ 'mg/dl': [40, 800], 'mmol/l': [1, 20.7] }),
  triglycerides: T({ 'mg/dl': [20, 5000], 'mmol/l': [0.2, 56] }),
  tsh: T({ 'miu/l': [0.001, 500] }),
  uric_acid: T({ 'mg/dl': [0.5, 25], 'umol/l': [30, 1500] }),
  hemoglobin: T({ 'g/l': [30, 250], 'g/dl': [3, 25] }),
  hematocrit: T({ 'l/l': [0.1, 0.75], '%': [10, 75] }),
  platelets: T({ '109/l': [5, 2000] }),
  wbc: T({ '109/l': [0.1, 500] }),
  rbc: T({ '1012/l': [1, 10] })
}

/** A short, printable-ASCII copy of a unit text for the finding (no names: a unit is a few symbols). */
const unitText = (u: string | null | undefined): string => String(u ?? '').replace(/[^\x20-\x7e°µμ⁰-⁹]/g, '?').trim().slice(0, 24)

type ValueVerdict = null | { kind: 'impossible' | 'unit_mismatch' | 'no_unit'; detail: Detail }
/** One value against its test. Null when it is plausible in its stated unit. Order: missing unit, unknown unit, out of bounds (fits another unit = mismatch, else impossible). */
export function checkValue(test: string | null, unitRaw: string | null, valueIn: number | string | null): ValueVerdict {
  const value = num(valueIn)
  if (value == null) return null // an empty value is "unknown", handled elsewhere (never 0)
  const known = test ? BOUNDS[test] : undefined
  const unit = normUnit(unitRaw)
  const base: Detail = { test: test ?? null, value, unit: unitText(unitRaw) || null }
  if (!unit) return { kind: 'no_unit', detail: base }
  if (!known) return null
  if (value <= 0) return { kind: 'impossible', detail: { ...base, reason: 'zero_or_negative' } }
  const own = known[unit]
  if (!own) return { kind: 'unit_mismatch', detail: { ...base, reason: 'unknown_unit', expected: Object.keys(known).join(' or ') } }
  if (value >= own[0] && value <= own[1]) return null
  const other = Object.entries(known).find(([u, [lo, hi]]) => u !== unit && value >= lo && value <= hi)
  if (other) return { kind: 'unit_mismatch', detail: { ...base, reason: 'fits_other_unit', likely_unit: other[0] } }
  return { kind: 'impossible', detail: { ...base, reason: 'out_of_range', low: own[0], high: own[1] } }
}

// ---------- grouping: one finding per group, never one per row ----------
export const SAMPLE_IDS = 5
const dayKey = (iso: string | null | undefined, off: number) => (iso && !Number.isNaN(Date.parse(iso)) ? dayOf(iso, off) : '')
interface Item { table: Table; id: string; person: string | null; at: number; kind: Kind; detail: Detail; gkey: string }
const byTimeThenId = <T extends { id: string; at: number }>(a: T, b: T) => (Number.isNaN(a.at) ? 0 : a.at) - (Number.isNaN(b.at) ? 0 : b.at) || a.id.localeCompare(b.id)
/** Rows that share a group key (person, test or metric, kind, reason, unit, local day, source) become ONE finding: row_ref is a stable key from the earliest row, detail has {count, first_row, last_row, sample_ids (max 5)}.
 *  A group of several rows drops the single value of its first row and carries value_min / value_max instead. No names. */
function groupItems(items: Item[]): Finding[] {
  const by = new Map<string, Item[]>()
  for (const i of items) { const l = by.get(i.gkey); if (l) l.push(i); else by.set(i.gkey, [i]) }
  return [...by.values()].map((g) => {
    g.sort(byTimeThenId)
    const first = g[0]!, last = g[g.length - 1]!
    const detail: Detail = { ...first.detail }
    if (g.length > 1) {
      let lo = Infinity, hi = -Infinity
      for (const x of g) { const v = x.detail.value; if (typeof v === 'number') { if (v < lo) lo = v; if (v > hi) hi = v } }
      for (const k of ['value', 'systolic', 'diastolic', 'steps', 'minutes']) delete detail[k]
      if (lo <= hi) { detail.value_min = lo; detail.value_max = hi }
    }
    return { kind: first.kind, table_name: first.table, row_ref: `g:${first.id}`, person_id: first.person, detail: { ...detail, count: g.length, first_row: first.id, last_row: last.id, sample_ids: g.slice(0, SAMPLE_IDS).map((x) => x.id) } }
  })
}

// ---------- duplicates ----------
/** Rows with the same key within a minute of the first kept one are duplicates of it: one group per keeper. Rows already in records_dedupe_log are skipped (handled before). */
function dupeGroups<T>(rows: T[], key: (r: T) => string | null, at: (r: T) => number, id: (r: T) => string, logged: ReadonlySet<string>): { keeper: T; members: T[] }[] {
  const by = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    if (k == null || Number.isNaN(at(r)) || logged.has(id(r))) continue
    const list = by.get(k)
    if (list) list.push(r); else by.set(k, [r])
  }
  const out: { keeper: T; members: T[] }[] = []
  for (const list of by.values()) {
    list.sort((a, b) => at(a) - at(b) || id(a).localeCompare(id(b)))
    let cur: { keeper: T; members: T[] } = { keeper: list[0]!, members: [] }
    for (const r of list.slice(1)) {
      if (at(r) - at(cur.keeper) <= DUPE_WINDOW_MS) cur.members.push(r)
      else { if (cur.members.length) out.push(cur); cur = { keeper: r, members: [] } }
    }
    if (cur.members.length) out.push(cur)
  }
  return out
}

// ---------- sleep and steps by local day ----------
const isReal = (s: string | null) => s === 'health-connect' || s === 'healthkit' // same rule as the app (hasRealStart in features/health/model.ts)
const local = (iso: string, off: number) => new Date(Date.parse(iso) + off * MIN)
const dayOf = (iso: string, off: number) => local(iso, off).toISOString().slice(0, 10)

/** Same rule as sleepWakeDay in src/features/health/model.ts, with a fixed UTC offset instead of the phone's zone (the family is in Manila, UTC+8, no daylight saving). */
export function wakeDay(iso: string, minutes: number, source: string | null, off = MANILA_OFFSET_MIN): { day: string; nap: boolean } {
  if (!isReal(source)) return { day: dayOf(iso, off), nap: false }
  const h = local(iso, off).getUTCHours()
  if (h >= 9 && h < 18 && minutes < 180) return { day: dayOf(iso, off), nap: true }
  return { day: dayOf(new Date(Date.parse(iso) + 6 * 3_600_000).toISOString(), off), nap: false }
}

/** Minutes covered by the union of [start, start + minutes] spans (same maths as unionMinutes in the app). */
export function unionMinutes(rows: { t: number; min: number }[]): number {
  const iv = rows.map((r) => [r.t, r.t + r.min * MIN] as const).sort((a, b) => a[0] - b[0])
  let total = 0, from = NaN, to = NaN
  for (const [s, e] of iv) {
    if (Number.isNaN(to) || s > to) { if (!Number.isNaN(to)) total += to - from; from = s; to = e } else if (e > to) to = e
  }
  return Number.isNaN(to) ? 0 : (total + (to - from)) / MIN
}

/** Per person and wake day: what adding every row gives, what the app shows (overlaps counted once), and whether a night is longer than 16 h. */
export function sleepFindings(rows: ActivityRow[], off = MANILA_OFFSET_MIN): Finding[] {
  type Day = { person: string; day: string; sum: number; real: { t: number; min: number }[]; manual: number; nap: { t: number; min: number }[] }
  const g = new Map<string, Day>()
  for (const r of rows) {
    const min = num(r.minutes), t = ms(r.started_at)
    if (r.kind !== 'sleep' || min == null || !(min > 0) || Number.isNaN(t)) continue
    const { day, nap } = wakeDay(r.started_at, min, r.source, off)
    const k = `${r.person_id}|${day}`
    const d = g.get(k) ?? { person: r.person_id, day, sum: 0, real: [], manual: 0, nap: [] }
    d.sum += min
    if (nap) d.nap.push({ t, min }); else if (isReal(r.source)) d.real.push({ t, min }); else d.manual += min
    g.set(k, d)
  }
  const out: Finding[] = []
  for (const [k, d] of g) {
    const night = unionMinutes(d.real) + d.manual, nap = unionMinutes(d.nap)
    if (night > MAX_SLEEP_MIN) out.push({ kind: 'impossible', table_name: 'activity', row_ref: `sleep:${k}`, person_id: d.person, detail: { metric: 'sleep', day: d.day, reason: 'sleep_over_16h', minutes: Math.round(night) } })
    if (d.sum - (night + nap) > 1) out.push({ kind: 'tile_mismatch', table_name: 'activity', row_ref: `sleep:${k}`, person_id: d.person, detail: { metric: 'sleep', day: d.day, rows_total_min: Math.round(d.sum), shown_min: Math.round(night + nap), double_counted_min: Math.round(d.sum - (night + nap)) } })
  }
  return out
}

/** What the app shows for one source's rows in a day (same maths as stepDayTotals in src/features/health/model.ts, parity-tested): a later row adds only the part of its span not already covered. */
export function shownSteps(rows: { t: number; end: number; steps: number }[]): { total: number; overlaps: number } {
  const sorted = [...rows].sort((a, b) => a.t - b.t || b.end - a.end)
  let total = 0, overlaps = 0, reach = -Infinity
  const seen = new Set<string>()
  for (const r of sorted) {
    if (r.end <= r.t) { const k = `${r.t}|${r.steps}`; if (!seen.has(k)) { seen.add(k); total += r.steps } else overlaps++; continue }
    if (r.t < reach) overlaps++
    total += r.steps * (Math.max(0, r.end - Math.max(r.t, reach)) / (r.end - r.t))
    reach = Math.max(reach, r.end)
  }
  return { total, overlaps }
}

/** Steps per local day: a row faster than 250 steps a minute (grouped per person, day and source), more than 100 000 shown in a day, and a day whose rows add up to more than the app shows (overlapping rows, or two sources). */
export function stepsFindings(rows: ActivityRow[], skip: ReadonlySet<string>, off = MANILA_OFFSET_MIN): Finding[] {
  const g = new Map<string, { person: string; day: string; total: number; by: Map<string, { t: number; end: number; steps: number }[]> }>()
  const items: Item[] = []
  for (const r of rows) {
    const steps = num(r.steps), t = ms(r.started_at)
    if (r.kind !== 'steps' || steps == null || Number.isNaN(t) || skip.has(r.id)) continue
    const min = Math.max(num(r.minutes) ?? 0, 0)
    const day = dayOf(r.started_at, off), k = `${r.person_id}|${day}`, src = r.source ?? 'manual'
    if (steps < 0 || (min > 0 && steps > 250 * min)) {
      const reason = steps < 0 ? 'negative' : 'over_250_a_minute'
      items.push({ table: 'activity', id: r.id, person: r.person_id, at: t, kind: 'impossible', detail: { metric: 'steps', reason, steps, minutes: min, day }, gkey: `activity|${r.person_id}|impossible|steps|${reason}|${day}|${src}` })
    }
    const d = g.get(k) ?? { person: r.person_id, day, total: 0, by: new Map() }
    d.total += Math.max(steps, 0)
    const l = d.by.get(src) ?? []
    l.push({ t, end: t + min * MIN, steps: Math.max(steps, 0) })
    d.by.set(src, l)
    g.set(k, d)
  }
  const out = groupItems(items)
  for (const [k, d] of g) {
    let shown = 0, overlaps = 0
    for (const list of d.by.values()) { const s = shownSteps(list); shown = Math.max(shown, s.total); overlaps += s.overlaps }
    shown = Math.round(shown)
    if (shown > MAX_STEPS_DAY) out.push({ kind: 'impossible', table_name: 'activity', row_ref: `steps:${k}`, person_id: d.person, detail: { metric: 'steps', day: d.day, reason: 'over_100000_a_day', steps: shown } })
    if (d.total - shown > 1) out.push({ kind: 'tile_mismatch', table_name: 'activity', row_ref: `steps:${k}`, person_id: d.person, detail: { metric: 'steps', day: d.day, rows_total: Math.round(d.total), shown_total: shown, overlapping_rows: overlaps } })
  }
  return out
}

// ---------- all of it ----------
export interface Input { readings: ReadingRow[]; labs: LabRow[]; activity: ActivityRow[]; logged: ReadonlySet<string>; tzOffsetMin?: number }
export interface Counts { dupes: number; impossible: number; mismatched: number; checked: number }
export interface Result { findings: Finding[]; counts: Counts }

/** Every check over the rows given. A finding is keyed (kind, table_name, row_ref): the same problem found twice is one finding. */
export function runChecks(input: Input): Result {
  const off = input.tzOffsetMin ?? MANILA_OFFSET_MIN
  const f = new Map<string, Finding>()
  const add = (x: Finding) => { f.set(`${x.kind}|${x.table_name}|${x.row_ref}`, x) }

  const labs = input.labs.filter((l) => l.status !== 'rejected') // a rejected row is a copy already set aside by the dedupe run
  const readings = input.readings.filter((r) => !r.lab_result_id) // a lab value mirrored into readings is checked once, as the lab result (one bad lab = one finding)
  const items: Item[] = []
  for (const r of readings) {
    const v = checkValue(r.test, r.unit, r.value)
    if (v) items.push({ table: 'readings', id: r.id, person: r.person_id, at: ms(r.taken_at), kind: v.kind, detail: v.detail, gkey: `readings|${r.person_id}|${v.kind}|${r.test}|${v.detail.reason ?? ''}|${normUnit(r.unit)}|${dayKey(r.taken_at, off)}` })
  }
  for (const l of labs) {
    const v = checkValue(l.test_code, l.unit_raw, l.value_num)
    if (v) items.push({ table: 'lab_results', id: l.id, person: l.person_id, at: ms(l.collected_at), kind: v.kind, detail: v.detail, gkey: `lab_results|${l.person_id}|${v.kind}|${l.test_code}|${v.detail.reason ?? ''}|${normUnit(l.unit_raw)}|${dayKey(l.collected_at, off)}` })
  }

  // blood pressure: the bottom number cannot reach the top number (same person, same minute)
  const sys = new Map<string, number>()
  for (const r of readings) if (r.test === 'bp_systolic' && num(r.value) != null) sys.set(`${r.person_id}|${Math.floor(ms(r.taken_at) / MIN)}`, num(r.value)!)
  for (const r of readings) {
    const top = r.test === 'bp_diastolic' ? sys.get(`${r.person_id}|${Math.floor(ms(r.taken_at) / MIN)}`) : undefined
    const dia = num(r.value)
    if (top != null && dia != null && dia >= top) items.push({ table: 'readings', id: r.id, person: r.person_id, at: ms(r.taken_at), kind: 'impossible', detail: { test: 'bp_diastolic', reason: 'bottom_not_below_top', systolic: top, diastolic: dia }, gkey: `readings|${r.person_id}|impossible|bp_diastolic|bottom_not_below_top||${dayKey(r.taken_at, off)}` })
  }
  for (const x of groupItems(items)) add(x)

  const dupeOf = new Set<string>()
  const noteDupes = <T extends { id: string; person_id: string }>(table: Table, groups: { keeper: T; members: T[] }[], at: (r: T) => number, extra: (r: T) => Detail) => {
    for (const { keeper, members } of groups) {
      for (const m of members) dupeOf.add(m.id)
      const last = members[members.length - 1]!
      add({ kind: 'duplicate', table_name: table, row_ref: `g:${keeper.id}`, person_id: keeper.person_id, detail: { ...extra(keeper), count: members.length + 1, first_row: keeper.id, last_row: last.id, sample_ids: members.slice(0, SAMPLE_IDS).map((m) => m.id), span_s: Math.round((at(last) - at(keeper)) / 1000) } })
    }
  }
  noteDupes('readings', dupeGroups(readings, (r) => (num(r.value) == null ? null : `${r.person_id}|${r.test}|${num(r.value)}|${normUnit(r.unit)}`), (r) => ms(r.taken_at), (r) => r.id, input.logged), (r) => ms(r.taken_at), (r) => ({ test: r.test ?? null }))
  noteDupes('lab_results', dupeGroups(labs, (l) => {
    const name = l.test_code || l.name_raw?.trim().toLowerCase()
    return name && num(l.value_num) != null && l.collected_at ? `${l.person_id}|${name}|${num(l.value_num)}|${normUnit(l.unit_raw)}` : null
  }, (l) => ms(l.collected_at), (l) => l.id, input.logged), (l) => ms(l.collected_at), (l) => ({ test: l.test_code ?? null }))
  noteDupes('activity', dupeGroups(input.activity, (a) => `${a.person_id}|${a.kind}|${num(a.minutes)}|${num(a.steps)}`, (a) => ms(a.started_at), (a) => a.id, input.logged), (a) => ms(a.started_at), (a) => ({ metric: a.kind ?? null }))

  // sleep and steps: duplicates are reported as duplicates, so they are taken out before the day totals are compared
  const act = input.activity.filter((a) => !dupeOf.has(a.id))
  for (const x of [...sleepFindings(act, off), ...stepsFindings(act, dupeOf, off)]) add(x)

  const findings = [...f.values()]
  // counts are ROWS (a group of 600 duplicate rows counts 599 extra rows), findings are groups
  const rowsIn = (x: Finding) => (typeof x.detail.count === 'number' ? x.detail.count : 1) - (x.kind === 'duplicate' ? 1 : 0)
  const n = (k: Kind[]) => findings.filter((x) => k.includes(x.kind)).reduce((sum, x) => sum + rowsIn(x), 0)
  return { findings, counts: { dupes: n(['duplicate']), impossible: n(['impossible']), mismatched: n(['unit_mismatch', 'tile_mismatch', 'no_unit']), checked: input.readings.length + labs.length + input.activity.length } }
}
