import { supabase } from '../auth/client'
import type { Tone } from '../admin/desk/ui'

// Data integrity (S30): what the nightly integrity-check function found. Findings only: this file reads them, nothing here changes a record.
// Counts and short plain lines for the System health card. A person is shown by the desk's own name lookup, never stored in a finding.
export type Kind = 'duplicate' | 'impossible' | 'unit_mismatch' | 'tile_mismatch' | 'no_unit'
export type Res<T> = { ok: true; data: T } | { ok: false; error: string }
export interface Finding { id: number; kind: Kind; table_name: string; person_id: string | null; detail: Record<string, unknown>; checked_at: string }
export interface RunSummary { dupes: number; impossible: number; mismatched: number; checked: number }
export interface Snapshot { run: { ran_at: string; ok: boolean; summary: Partial<RunSummary> } | null; open: number; findings: Finding[]; available: boolean }

export const JOB = 'integrity-check'
export const LIST_MAX = 50
export const KIND_LABEL: Record<Kind, string> = { duplicate: 'Possible duplicate', impossible: 'Cannot be right', unit_mismatch: 'Unit looks wrong', tile_mismatch: 'Totals disagree', no_unit: 'No unit' }
const KINDS = Object.keys(KIND_LABEL) as Kind[]

const NO = { ok: false, error: 'not_connected' } as const
const bad = { ok: false, error: 'failed' } as const

const n = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const s = (x: unknown): string => (typeof x === 'string' ? x : '')
const NAMES: Record<string, string> = { bp_systolic: 'Blood pressure, top', bp_diastolic: 'Blood pressure, bottom', heart_rate: 'Pulse', fasting_glucose: 'Fasting sugar', glucose: 'Blood sugar' }
const word = (t: string) => { if (NAMES[t]) return NAMES[t]!; const w = t.replace(/_/g, ' ').trim(); return w ? w[0]!.toUpperCase() + w.slice(1) : 'Record' }
const hours = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`

/** One plain line for a finding: what it is about and why it was flagged. Unknown parts are left out, never made up. */
export function findingLine(f: Pick<Finding, 'kind' | 'detail'>): { title: string; note: string } {
  const d = f.detail ?? {}
  const what = s(d.metric) === 'sleep' ? 'Sleep' : s(d.metric) === 'steps' ? 'Steps' : word(s(d.test) || s(d.metric))
  const value = n(d.value) != null ? ` ${d.value}${s(d.unit) ? ` ${s(d.unit)}` : ''}` : ''
  const day = s(d.day) ? ` on ${s(d.day)}` : ''
  const reason = s(d.reason)
  let note: string
  if (f.kind === 'duplicate') note = n(d.gap_s) != null ? `Same value as another row, ${d.gap_s} seconds apart` : 'Same value as another row'
  else if (f.kind === 'no_unit') note = 'The unit is missing'
  else if (f.kind === 'tile_mismatch') {
    note = s(d.metric) === 'sleep' && n(d.rows_total_min) != null && n(d.shown_min) != null ? `Rows add up to ${hours(d.rows_total_min as number)}, the app shows ${hours(d.shown_min as number)}`
      : n(d.overlapping_rows) != null ? `${d.overlapping_rows} ${d.overlapping_rows === 1 ? 'row overlaps' : 'rows overlap'} another, so the day total counts them twice` : 'The day total and the detail disagree'
  } else if (reason === 'fits_other_unit') note = `Fits ${s(d.likely_unit) || 'another unit'} better than ${s(d.unit) || 'the unit written'}`
  else if (reason === 'unknown_unit') note = `Unit not recognised${s(d.expected) ? `, expected ${s(d.expected)}` : ''}`
  else if (reason === 'zero_or_negative') note = 'Zero or below'
  else if (reason === 'sleep_over_16h') note = `${hours(n(d.minutes) ?? 0)} of sleep in one night`
  else if (reason === 'over_100000_a_day') note = 'More than 100 000 steps in a day'
  else if (reason === 'over_250_a_minute') note = 'More than 250 steps a minute'
  else if (reason === 'bottom_not_below_top') note = `Bottom number ${n(d.diastolic) ?? ''} is not below the top number ${n(d.systolic) ?? ''}`.replace(/\s+/g, ' ')
  else if (reason === 'out_of_range') note = 'Outside what can be true'
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

export const loadIntegrity = async (): Promise<Res<Snapshot>> => {
  if (!supabase) return NO
  try {
    const [runs, found] = await Promise.all([
      supabase.from('job_runs').select('ran_at, ok, summary').eq('job', JOB).order('ran_at', { ascending: false }).limit(1),
      supabase.from('integrity_findings').select('id, kind, table_name, person_id, detail, checked_at', { count: 'exact' }).eq('status', 'open').order('kind').order('checked_at', { ascending: false }).limit(LIST_MAX)
    ])
    if (runs.error) return bad
    const r = ((runs.data ?? [])[0] ?? null) as { ran_at: string; ok: boolean; summary: Partial<RunSummary> | null } | null
    const run = r ? { ran_at: r.ran_at, ok: r.ok, summary: r.summary ?? {} } : null
    if (found.error) return { ok: true, data: { run, open: 0, findings: [], available: false } } // the table is missing until 0064 is applied: not a failure of the page
    const rows = ((found.data ?? []) as Finding[]).filter((f) => KINDS.includes(f.kind))
    return { ok: true, data: { run, open: found.count ?? rows.length, findings: rows, available: true } }
  } catch { return bad }
}
