// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ActivityRow, LabRow, ReadingRow } from './checks.ts'
import { KEEP_RESOLVED_DAYS, type FindingRow, type OpenRef, type Port, runIntegrity } from './run.ts'

const P = '11111111-1111-1111-1111-111111111111'
const NOW = Date.parse('2026-11-10T19:30:00Z')
const rd = (id: string, test: string, value: number, unit: string, taken_at: string): ReadingRow => ({ id, person_id: P, taken_at, test, value, unit })

/** A fake database: findings are stored by (kind, table, row_ref) like the unique index; nothing else is written. */
function fake(init: { readings?: ReadingRow[]; labs?: LabRow[]; activity?: ActivityRow[]; logged?: string[]; open?: OpenRef[]; fail?: 'read' | 'write' } = {}) {
  const stored = new Map<string, FindingRow>()
  const calls = { resolved: [] as number[], trimmed: '' as string, writes: 0 }
  const port: Port = {
    readings: async () => { if (init.fail === 'read') throw new Error('read'); return init.readings ?? [] },
    labs: async () => init.labs ?? [],
    activity: async () => init.activity ?? [],
    logged: async () => new Set(init.logged ?? []),
    openRefs: async () => init.open ?? [],
    upsert: async (rows) => { if (init.fail === 'write') throw new Error('write'); calls.writes++; for (const r of rows) stored.set(`${r.kind}|${r.table_name}|${r.row_ref}`, r) },
    resolve: async (ids) => { calls.resolved.push(...ids) },
    trim: async (c) => { calls.trimmed = c }
  }
  return { port, stored, calls }
}

describe('runIntegrity', () => {
  it('stores findings as open with the run time, returns counts only, and trims resolved rows after 90 days', async () => {
    const f = fake({ readings: [rd('a', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z'), rd('b', 'heart_rate', 72, 'bpm', '2026-11-09T10:00:00Z'), rd('c', 'bp_systolic', 400, 'mmHg', '2026-11-09T11:00:00Z')] })
    const r = await runIntegrity(f.port, NOW)
    expect(r).toEqual({ ok: true, dupes: 1, impossible: 1, mismatched: 0, checked: 3, resolved: 0 })
    expect([...f.stored.keys()].sort()).toEqual(['duplicate|readings|b', 'impossible|readings|c'])
    expect(f.stored.get('duplicate|readings|b')).toMatchObject({ status: 'open', checked_at: '2026-11-10T19:30:00.000Z', person_id: P })
    expect(f.calls.trimmed).toBe(new Date(NOW - KEEP_RESOLVED_DAYS * 86_400_000).toISOString())
  })
  it('a finding that no longer applies is marked resolved; one that still applies is not', async () => {
    const f = fake({ readings: [rd('c', 'bp_systolic', 400, 'mmHg', '2026-11-09T11:00:00Z')], open: [{ id: 7, kind: 'impossible', table_name: 'readings', row_ref: 'c' }, { id: 8, kind: 'duplicate', table_name: 'readings', row_ref: 'gone' }] })
    const r = await runIntegrity(f.port, NOW)
    expect(r.resolved).toBe(1)
    expect(f.calls.resolved).toEqual([8])
  })
  it('chunks big runs: 1 200 findings are written in 3 requests and every one arrives', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => rd(`r${i}`, 'bp_systolic', 400, 'mmHg', new Date(Date.UTC(2026, 10, 9, 0, 0) + i * 120_000).toISOString())) // 2 minutes apart: no duplicates
    const f = fake({ readings: rows })
    const r = await runIntegrity(f.port, NOW)
    expect(r.impossible).toBe(1200)
    expect(f.calls.writes).toBe(3)
    expect(f.stored.size).toBe(1200)
  })
  it('a second run over the same rows stores the same findings (idempotent)', async () => {
    const rows = [rd('c', 'bp_systolic', 400, 'mmHg', '2026-11-09T11:00:00Z')]
    const f = fake({ readings: rows })
    await runIntegrity(f.port, NOW)
    await runIntegrity(f.port, NOW + 86_400_000)
    expect(f.stored.size).toBe(1)
    expect(f.stored.get('impossible|readings|c')!.checked_at).toBe('2026-11-11T19:30:00.000Z')
  })
  it('a read or write failure is a failed run with zero counts, not a throw', async () => {
    expect(await runIntegrity(fake({ fail: 'read' }).port, NOW)).toEqual({ ok: false, dupes: 0, impossible: 0, mismatched: 0, checked: 0, resolved: 0 })
    expect((await runIntegrity(fake({ readings: [rd('c', 'bp_systolic', 400, 'mmHg', '2026-11-09T11:00:00Z')], fail: 'write' }).port, NOW)).ok).toBe(false)
  })
  it('never writes to a health table: the port has no way to (findings, resolve and trim only)', () => {
    expect(Object.keys(fake().port).sort()).toEqual(['activity', 'labs', 'logged', 'openRefs', 'readings', 'resolve', 'trim', 'upsert'])
  })
})

describe('index.ts wiring (source guard: it is Deno code and cannot run here)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('writes only integrity_findings; health tables are selected, never changed', () => {
    const writes = [...src.matchAll(/\.from\('([a-z_]+)'\)\s*\.(insert|update|upsert|delete)\(/g)].map((m) => m[1])
    expect(writes.length).toBeGreaterThan(0)
    expect(new Set(writes)).toEqual(new Set(['integrity_findings']))
  })
  it('is gated by a 32+ character secret before any work, and never chains .catch/.finally on a query builder', () => {
    expect(src).toMatch(/INTEGRITY_CRON_SECRET/)
    expect(src.indexOf('not_configured')).toBeLessThan(src.indexOf('createClient('))
    expect(src.indexOf('unauthorized')).toBeLessThan(src.indexOf('createClient('))
    expect(src).not.toMatch(/\.(catch|finally)\(/)
  })
  it('the heartbeat carries counts only', () => {
    expect(src).toMatch(/heartbeat\(sb, 'integrity-check', r\.ok, \{ dupes: r\.dupes, impossible: r\.impossible, mismatched: r\.mismatched, checked: r\.checked \}\)/)
  })
})
