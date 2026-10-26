// Job heartbeat (contract: docs/session-10/contracts.md). STUB from the s10 p2 base: S8 MONITOR replaces the body
// (insert into job_runs; ok = false also raises a `system` carer_alerts row for every admin). Callers may import it now.
// The client is typed structurally: _shared is type-checked by the app tsconfig, which cannot resolve npm: specifiers.
export type HeartbeatClient = { from: (table: string) => unknown }

export async function heartbeat(_sb: HeartbeatClient, _job: string, _ok: boolean, _summary: Record<string, unknown> = {}): Promise<void> {
  // no-op until S8 lands; a heartbeat failure must never fail the job it reports on
}
