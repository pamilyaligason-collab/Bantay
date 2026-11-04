// @vitest-environment node
// Drives the real index.ts handler with a faked Deno and a faked supabase client (in-memory tables). Fixed clock: 2026-11-05 06:45 Asia/Manila. Invented rows only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  log: [] as string[],
  fail: new Set<string>(), // tables whose read answers an error
  serve: null as null | ((req: Request) => Promise<Response>),
  heartbeat: vi.fn()
}))

function builder(name: string) {
  let op: 'select' | 'upsert' | 'delete' = 'select'
  let payload: Row = {}
  const preds: ((r: Row) => boolean)[] = []
  let order: { c: string; asc: boolean } | null = null
  let lim = Infinity
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = (c: string, v: unknown) => { preds.push((r) => r[c] === v); return b }
  b.lt = (c: string, v: string) => { preds.push((r) => String(r[c]) < v); return b }
  b.or = (s: string) => { h.log.push(`or:${name}:${s}`); return b } // the real filter runs in Postgres; buildDigest filters again
  b.order = (c: string, o?: { ascending?: boolean }) => { order = { c, asc: o?.ascending !== false }; return b }
  b.limit = (n: number) => { lim = n; return b }
  b.upsert = (row: Row, o: { onConflict: string }) => { op = 'upsert'; payload = row; h.log.push(`upsert:${name}:${o.onConflict}`); return b }
  b.delete = () => { op = 'delete'; return b }
  b.then = (ok: (v: unknown) => unknown) => {
    const all = (h.tables[name] ??= [])
    if (op === 'select' && h.fail.has(name)) return Promise.resolve({ data: null, error: { message: 'x' } }).then(ok)
    if (op === 'upsert') {
      const i = all.findIndex((r) => r.day === payload.day)
      if (i >= 0) all[i] = payload; else all.push(payload)
      return Promise.resolve({ data: null, error: null }).then(ok)
    }
    const hit = all.filter((r) => preds.every((p) => p(r)))
    if (op === 'delete') { h.tables[name] = all.filter((r) => !hit.includes(r)); return Promise.resolve({ data: null, error: null }).then(ok) }
    if (order) hit.sort((x, y) => (String(x[order!.c]) < String(y[order!.c]) ? -1 : 1) * (order!.asc ? 1 : -1))
    return Promise.resolve({ data: hit.slice(0, lim), error: null }).then(ok)
  }
  return b
}
vi.mock('npm:@supabase/supabase-js@2.118.0', () => ({ createClient: () => ({ from: (t: string) => builder(t) }) }))
vi.mock('../_shared/heartbeat.ts', () => ({ heartbeat: (...a: unknown[]) => h.heartbeat(...a) }))

const SECRET = 's'.repeat(40)
const NOW = new Date('2026-11-05T06:45:00+08:00')
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
const alertRow = (id: string, kind: string, hours: number, o: Row = {}) => ({ id, kind, level: 'L', title: `Title ${id}`, source: 'PAGASA', issued_at: ago(hours), expires_at: null, ...o })
const run = (hours: number, summary: Row) => ({ job: 'alerts-ingest', ran_at: ago(hours), ok: true, summary })
const OK = { pagasa_ok: true, usgs_ok: true, gdacs_ok: true, sources_failed: 0 }

async function call(secret: string | null = SECRET, method = 'POST') {
  const headers: Record<string, string> = {}
  if (secret != null) headers['x-alerts-secret'] = secret
  const res = await h.serve!(new Request('https://f.test/alerts-digest', { method, headers }))
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}
const digestRows = () => h.tables.safety_digests ?? []

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Object.assign(h, { tables: { safety_alerts: [], job_runs: [run(0.2, OK)], safety_digests: [] }, log: [], serve: null })
  h.fail.clear(); h.heartbeat.mockReset()
  ;(globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => (k === 'ALERTS_CRON_SECRET' ? SECRET : k === 'SUPABASE_URL' ? 'https://x.supabase.test' : k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'svc' : undefined) }, serve: (fn: (r: Request) => Promise<Response>) => { h.serve = fn } }
  vi.resetModules()
  await import('./index.ts')
})
afterEach(() => { vi.useRealTimers(); delete (globalThis as { Deno?: unknown }).Deno })

describe('alerts-digest handler', () => {
  it('gate: wrong or missing secret is 401 and writes nothing; a GET is 405; an unset secret is 500', async () => {
    expect((await call('nope')).status).toBe(401)
    expect((await call(null)).status).toBe(401)
    expect((await call(SECRET, 'GET')).status).toBe(405)
    expect(digestRows()).toEqual([])
    ;(globalThis as { Deno: { env: { get: () => undefined } } }).Deno.env.get = () => undefined
    expect((await call()).status).toBe(500)
  })
  it('writes one digest row for the Manila day from the stored alerts, and heartbeats ok with a count', async () => {
    h.tables.safety_alerts!.push(alertRow('a1', 'tcws', 2), alertRow('a2', 'quake', 30, { source: 'USGS' }), alertRow('a3', 'gdacs', 72, { expires_at: ago(-5), source: 'GDACS' }))
    const r = await call()
    expect(r).toEqual({ status: 200, json: { ok: true, day: '2026-11-05' } })
    expect(digestRows()).toHaveLength(1)
    const body = digestRows()[0].body as { counts: Record<string, number>; summary: string; top: { id: string }[] }
    expect(digestRows()[0].day).toBe('2026-11-05')
    expect(body.summary).toBe('1 warning in the last 24 h. 1 GDACS event in or near the Philippines in the last 24 h (not an official warning).') // a2 is 30 h old and not in force: out; a3 (GDACS) is in force: counted as GDACS context
    expect(body.top.map((t) => t.id)).toEqual(['a1', 'a3'])
    expect(h.log).toContain('upsert:safety_digests:day')
    expect(h.log.some((l) => l.startsWith('or:safety_alerts:issued_at.gte.') && l.includes(',expires_at.gt.'))).toBe(true)
    expect(h.heartbeat).toHaveBeenCalledWith(expect.anything(), 'alerts-digest', true, { warnings: 2 })
  })
  it('a second run the same day rewrites that day, not a second row', async () => {
    await call(); await call()
    expect(digestRows()).toHaveLength(1)
  })
  it('an empty day with a clean recent ingest run says so; a failed official feed, an old run or no run says it was not checked', async () => {
    const summary = async () => { digestRows().length = 0; await call(); return (digestRows()[0].body as { summary: string; sources: string }) }
    expect((await summary()).summary).toBe('No warnings in the last 24 h.')
    h.tables.job_runs = [run(0.2, { ...OK, usgs_ok: false })]
    const failed = await summary()
    expect(failed.summary).toBe('Some warning feeds were not checked recently, so this may be missing some.')
    expect(failed.sources).toBe('No feed check could be confirmed.')
    h.tables.job_runs = [run(5, OK)]
    expect((await summary()).summary).toMatch(/not checked recently/)
    h.tables.job_runs = []
    expect((await summary()).summary).toMatch(/not checked recently/)
  })
  it('only the three official feeds count: Open-Meteo or EONET failing does not spoil a quiet day; an older run without the flags falls back to its failed count', async () => {
    h.tables.job_runs = [run(0.2, { ...OK, sources_failed: 2 })] // the two that failed were not official
    await call()
    expect((digestRows()[0].body as { summary: string }).summary).toBe('No warnings in the last 24 h.')
    h.tables.job_runs = [run(0.2, { sources_failed: 1 })]
    digestRows().length = 0
    await call()
    expect((digestRows()[0].body as { summary: string }).summary).toMatch(/not checked recently/)
  })
  it('uses the newest ingest run', async () => {
    h.tables.job_runs = [run(5, { ...OK, usgs_ok: false }), run(0.2, OK)]
    await call()
    expect((digestRows()[0].body as { summary: string }).summary).toBe('No warnings in the last 24 h.')
  })
  it('prunes digests older than 30 days of its own table only', async () => {
    h.tables.safety_digests = [{ day: '2026-10-01', body: {} }, { day: '2026-10-20', body: {} }]
    h.tables.safety_alerts!.push(alertRow('old', 'quake', 24 * 40))
    await call()
    expect(digestRows().map((r) => r.day).sort()).toEqual(['2026-10-20', '2026-11-05'])
    expect(h.tables.safety_alerts).toHaveLength(1) // alert rows are never deleted
  })
  it('a failed read answers 502, writes no digest, and heartbeats a failure', async () => {
    h.fail.add('safety_alerts')
    const r = await call()
    expect(r.status).toBe(502)
    expect(digestRows()).toEqual([])
    expect(h.heartbeat).toHaveBeenCalledWith(expect.anything(), 'alerts-digest', false, {})
  })
})
