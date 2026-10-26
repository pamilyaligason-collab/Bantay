// Job heartbeat (contract: docs/session-10/contracts.md, owner S8, migration 0033). Every scheduled edge function calls this once at the end
// of a run: it records a `job_runs` row (service role) and, when the run failed, raises one `system` carer_alerts row per admin so the
// failure shows in the app (D-78: in-app alerts only, no push, no third-party monitor).
// The client is typed structurally: _shared is type-checked by the app tsconfig, which cannot resolve npm: specifiers.
// B-7: the summary holds COUNTS only. Anything that is not a finite number or a boolean under a plain key is dropped, so a name, a reading
// or an error text can never reach job_runs. It never throws into the caller: a heartbeat failure must not fail the job it reports on.
export type HeartbeatClient = { from: (table: string) => unknown }

type Res<T = unknown> = PromiseLike<{ data?: T | null; error?: unknown }>
type Table = {
  insert(row: unknown): Res
  select(cols: string): { eq(col: string, v: unknown): { eq(col: string, v: unknown): Res<{ user_id: string }[]> } }
}

/** One `system` alert per admin per job per 6 hours (the unique (kind, ref, carer) index drops the repeats). */
export const ALERT_WINDOW_S = 21_600
export const systemRef = (job: string, nowMs: number) => `${job}:${Math.floor(nowMs / 1000 / ALERT_WINDOW_S)}`

/** Counts and flags only, plain keys, at most 20. */
export function countsOnly(summary: Record<string, unknown> | undefined): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {}
  for (const [k, v] of Object.entries(summary ?? {})) {
    if (Object.keys(out).length >= 20) break
    if (!/^[a-z0-9_]{1,40}$/.test(k)) continue
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v
  }
  return out
}

export async function heartbeat(sb: HeartbeatClient, job: string, ok: boolean, summary: Record<string, unknown> = {}): Promise<void> {
  try {
    const name = String(job ?? '').slice(0, 64)
    if (!name) return
    const from = (t: string) => sb.from(t) as Table
    await from('job_runs').insert({ job: name, ok, summary: countsOnly(summary) })
    if (ok) return
    const admins = (await from('app_roles').select('user_id').eq('role', 'admin').eq('disabled', false)).data ?? []
    const ref = systemRef(name, Date.now())
    for (const a of admins) {
      // one by one: a repeat of the same (kind, ref, carer) fails alone and must not drop the other admins' rows
      try { await from('carer_alerts').insert({ kind: 'system', template: 'system', person_id: null, carer_user_id: a.user_id, ref }) } catch { /* ignored */ }
    }
  } catch {
    // never throws into the job
  }
}
