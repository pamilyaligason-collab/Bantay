import { supabase } from '../auth/client'
import type { Tone } from '../admin/desk/ui'

// Data integrity (S30): what the nightly integrity-check function found. Findings only: this file reads them, nothing here changes a record.
// Counts and short plain lines for the System health card. A person is shown by the desk's own name lookup, never stored in a finding.
export type Kind = 'duplicate' | 'impossible' | 'unit_mismatch' | 'tile_mismatch' | 'no_unit'
export type Res<T> = { ok: true; data: T } | { ok: false; error: string }
export interface Finding { id: number; kind: Kind; table_name: string; person_id: string | null; detail: Record<string, unknown>; checked_at: string }
export interface RunSummary { dupes: number; impossible: number; mismatched: number; checked: number }
export interface Snapshot { run: { ran_at: string; ok: boolean; summary: Partial<RunSummary> } | null; open: number; counts: Record<Kind, number>; byKind: Record<Kind, Finding[]>; available: boolean }

export const JOB = 'integrity-check'
export const PAGE_SIZE = 10 // rows shown per kind; 'Show more' adds this many
export const KIND_LABEL: Record<Kind, string> = { duplicate: 'Possible duplicate', impossible: 'Cannot be right', unit_mismatch: 'Unit looks wrong', tile_mismatch: 'Totals disagree', no_unit: 'No unit' }
/** Worst first: a medical value that cannot be right or is in the wrong unit, then a missing unit, then totals that disagree, then duplicates. */
export const KIND_ORDER: Kind[] = ['impossible', 'unit_mismatch', 'no_unit', 'tile_mismatch', 'duplicate']
const empty = <T,>(make: () => T): Record<Kind, T> => ({ impossible: make(), unit_mismatch: make(), no_unit: make(), tile_mismatch: make(), duplicate: make() })

const NO = { ok: false, error: 'not_connected' } as const
const bad = { ok: false, error: 'failed' } as const

const n = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const s = (x: unknown): string => (typeof x === 'string' ? x : '')
const NAMES: Record<string, string> = { bp_systolic: 'Blood pressure, top', bp_diastolic: 'Blood pressure, bottom', heart_rate: 'Pulse', fasting_glucose: 'Fasting sugar', glucose: 'Blood sugar' }
const word = (t: string) => { if (NAMES[t]) return NAMES[t]!; const w = t.replace(/_/g, ' ').trim(); return w ? w[0]!.toUpperCase() + w.slice(1) : 'Record' }
const hours = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`

/** One plain line for a finding: what it is about and why it was flagged. Unknown parts are left out, never made up. A grouped finding (detail.count above 1) says how many rows it covers. */
export function findingLine(f: Pick<Finding, 'kind' | 'detail'>): { title: string; note: string } {
  const d = f.detail ?? {}
  const what = s(d.metric) === 'sleep' ? 'Sleep' : s(d.metric) === 'steps' ? 'Steps' : s(d.metric) ? word(s(d.metric)) : word(s(d.test))
  const count = n(d.count) ?? 1
  const lo = n(d.value_min), hi = n(d.value_max)
  const shown = n(d.value) ?? (lo != null && hi != null ? (lo === hi ? lo : `${lo} to ${hi}`) : null)
  const value = shown != null ? ` ${shown}${s(d.unit) ? ` ${s(d.unit)}` : ''}` : ''
  const day = s(d.day) ? ` on ${s(d.day)}` : ''
  const reason = s(d.reason)
  const rows = count > 1 ? `${count} rows: ` : ''
  let note: string
  if (f.kind === 'duplicate') note = count > 1 ? `${count} rows with the same value within a minute of each other` : n(d.gap_s) != null ? `Same value as another row, ${d.gap_s} seconds apart` : 'Same value as another row'
  else if (f.kind === 'no_unit') note = `${rows}The unit is missing`
  else if (f.kind === 'tile_mismatch') {
    note = s(d.metric) === 'sleep' && n(d.rows_total_min) != null && n(d.shown_min) != null ? `Rows add up to ${hours(d.rows_total_min as number)}, the app shows ${hours(d.shown_min as number)}`
      : s(d.metric) === 'steps' && n(d.rows_total) != null && n(d.shown_total) != null ? `Rows add up to ${(d.rows_total as number).toLocaleString('en-PH')} steps, the app shows ${(d.shown_total as number).toLocaleString('en-PH')}`
      : n(d.overlapping_rows) != null ? `${d.overlapping_rows} ${d.overlapping_rows === 1 ? 'row overlaps' : 'rows overlap'} another, so the day total counts them twice` : 'The day total and the detail disagree'
  } else if (reason === 'fits_other_unit') note = `${rows}Fits ${s(d.likely_unit) || 'another unit'} better than ${s(d.unit) || 'the unit written'}`
  else if (reason === 'unknown_unit') note = `${rows}Unit not recognised${s(d.expected) ? `, expected ${s(d.expected)}` : ''}`
  else if (reason === 'zero_or_negative') note = `${rows}Zero or below`
  else if (reason === 'sleep_over_16h') note = `${hours(n(d.minutes) ?? 0)} of sleep in one night`
  else if (reason === 'over_100000_a_day') note = 'More than 100 000 steps in a day'
  else if (reason === 'over_250_a_minute') note = `${rows}More than 250 steps a minute`
  else if (reason === 'bottom_not_below_top') note = count > 1 ? `${rows}Bottom number is not below the top number` : `Bottom number ${n(d.diastolic) ?? ''} is not below the top number ${n(d.systolic) ?? ''}`.replace(/\s+/g, ' ')
  else if (reason === 'out_of_range') note = `${rows}Outside what can be true`
  else note = KIND_LABEL[f.kind]
  return { title: `${what}${value}${day}`, note }
}

/** Red when the last run failed, amber when anything is open or nothing has run yet, green when the last run was clean. The stale check is the scheduled-jobs row (a missed night goes red there). */
export function integrityStatus(snap: Snapshot | null): { tone: Tone; text: string } {
  if (!snap || !snap.available) return { tone: 'plain', text: 'Not available yet' }
  if (!snap.run) return { tone: 'warn', text: 'The check has not run yet' }
  if (!snap.run.ok) return { tone: 'bad', text: 'The last check failed' }
  return snap.open > 0 ? { tone: 'warn', text: `${snap.open} to look at` } : { tone: 'ok', text: 'Nothing to look at' }
}

const COLS = 'id, kind, table_name, person_id, detail, checked_at'
/** Open findings of one kind, newest first (the highest id is the one found last). */
const page = (kind: Kind, from: number) => supabase!.from('integrity_findings').select(COLS, { count: 'exact' }).eq('status', 'open').eq('kind', kind).order('id', { ascending: false }).range(from, from + PAGE_SIZE - 1)

export const loadIntegrity = async (): Promise<Res<Snapshot>> => {
  if (!supabase) return NO
  try {
    const [runs, ...found] = await Promise.all([
      supabase.from('job_runs').select('ran_at, ok, summary').eq('job', JOB).order('ran_at', { ascending: false }).limit(1),
      ...KIND_ORDER.map((k) => page(k, 0))
    ])
    if (runs.error) return bad
    const r = ((runs.data ?? [])[0] ?? null) as { ran_at: string; ok: boolean; summary: Partial<RunSummary> | null } | null
    const run = r ? { ran_at: r.ran_at, ok: r.ok, summary: r.summary ?? {} } : null
    const counts = empty(() => 0), byKind = empty<Finding[]>(() => [])
    if (found.some((x) => x.error)) return { ok: true, data: { run, open: 0, counts, byKind, available: false } } // the table is missing until 0064 is applied: not a failure of the page
    KIND_ORDER.forEach((k, i) => { const rows = ((found[i]!.data ?? []) as Finding[]).filter((x) => x.kind === k); byKind[k] = rows; counts[k] = found[i]!.count ?? rows.length })
    return { ok: true, data: { run, open: KIND_ORDER.reduce((sum, k) => sum + counts[k], 0), counts, byKind, available: true } }
  } catch { return bad }
}

/** The next page of one kind ("Show more"); `have` is how many rows of that kind are already shown. */
export const loadMore = async (kind: Kind, have: number): Promise<Res<Finding[]>> => {
  if (!supabase) return NO
  try {
    const r = await page(kind, have)
    return r.error ? bad : { ok: true, data: ((r.data ?? []) as Finding[]).filter((x) => x.kind === kind) }
  } catch { return bad }
}
