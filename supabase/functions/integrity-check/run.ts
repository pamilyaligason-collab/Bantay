// One integrity run over ALL history (the first run is the backfill; every night is the same full pass, so a fixed record leaves the list).
// Writes findings only: integrity_findings gets rows, and rows that no longer apply are marked resolved. No health record is changed or deleted.
import { type ActivityRow, type Counts, type Finding, type LabRow, type ReadingRow, runChecks } from './checks.ts'

export const MAX_ROWS = 400_000 // a table longer than this is cut short: the run fails loudly instead of checking half the history
export const KEEP_RESOLVED_DAYS = 90 // resolved findings are trimmed after this (ML-06); open ones stay until fixed
export const CHUNK = 500

export interface OpenRef { id: number; kind: string; table_name: string; row_ref: string }
export interface FindingRow extends Finding { status: 'open'; checked_at: string }
export interface Port {
  readings(): Promise<ReadingRow[]>
  labs(): Promise<LabRow[]>
  activity(): Promise<ActivityRow[]>
  logged(): Promise<Set<string>> // row ids in records_dedupe_log
  openRefs(): Promise<OpenRef[]>
  upsert(rows: FindingRow[]): Promise<void>
  resolve(ids: number[], at: string): Promise<void>
  trim(cutoffIso: string): Promise<void>
}
export interface RunResult { ok: boolean; dupes: number; impossible: number; mismatched: number; checked: number; resolved: number }

const slices = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
const key = (x: { kind: string; table_name: string; row_ref: string }) => `${x.kind}|${x.table_name}|${x.row_ref}`

export async function runIntegrity(port: Port, nowMs: number): Promise<RunResult> {
  const zero: RunResult = { ok: false, dupes: 0, impossible: 0, mismatched: 0, checked: 0, resolved: 0 }
  try {
    const [readings, labs, activity, logged] = await Promise.all([port.readings(), port.labs(), port.activity(), port.logged()])
    const { findings, counts }: { findings: Finding[]; counts: Counts } = runChecks({ readings, labs, activity, logged })
    const at = new Date(nowMs).toISOString()
    for (const part of slices(findings, CHUNK)) await port.upsert(part.map((f) => ({ ...f, status: 'open' as const, checked_at: at })))
    const now = new Set(findings.map(key))
    const gone = (await port.openRefs()).filter((o) => !now.has(key(o))).map((o) => o.id)
    for (const part of slices(gone, 200)) await port.resolve(part, at)
    await port.trim(new Date(nowMs - KEEP_RESOLVED_DAYS * 86_400_000).toISOString())
    return { ok: true, ...counts, resolved: gone.length }
  } catch {
    return zero
  }
}
