// @vitest-environment node
// Drives the real index.ts handler with a faked Deno, a faked supabase client (in-memory tables) and a faked web-push. Fixed clock: 2026-10-26 10:05 Asia/Manila.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNotification } from '../../../src/features/notify/templates'

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  claimed: new Set<string>(),
  sent: [] as { endpoint: string; payload: Record<string, unknown>; opts: Record<string, unknown> }[],
  failWith: new Map<string, number | undefined>(), // endpoint -> status code (undefined = network error)
  heartbeat: vi.fn(),
  rpcs: [] as string[],
  failUpdate: new Set<string>(), // tables whose update answers an error
  afterSend: null as null | (() => void),
  serve: null as null | ((req: Request) => Promise<Response>)
}))

function builder(name: string) {
  let rows: Row[] | undefined = h.tables[name]
  const preds: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let patch: Row = {}
  let inserted: Row | null = null
  let lim = Infinity
  let single = false
  const val = (r: Row, c: string) => (r[c] === undefined ? null : r[c])
  const b: Record<string, unknown> = {}
  const f = (fn: (r: Row) => boolean) => { preds.push(fn); return b }
  b.select = () => b
  b.eq = (c: string, v: unknown) => f((r) => val(r, c) === v)
  b.is = (c: string, v: unknown) => f((r) => val(r, c) === v)
  b.in = (c: string, vs: unknown[]) => f((r) => vs.includes(r[c]))
  b.gt = (c: string, v: string) => f((r) => val(r, c) != null && String(r[c]) > v)
  b.gte = (c: string, v: string) => f((r) => val(r, c) != null && String(r[c]) >= v)
  b.lt = (c: string, v: string) => f((r) => val(r, c) != null && String(r[c]) < v)
  b.order = (c: string, o?: { ascending?: boolean }) => { rows = rows && [...rows].sort((x, y) => (String(x[c]) < String(y[c]) ? -1 : 1) * (o?.ascending === false ? -1 : 1)); return b }
  b.limit = (n: number) => { lim = n; return b }
  b.range = (from: number, to: number) => { lim = to - from + 1; return b }
  b.maybeSingle = () => { single = true; return b }
  b.insert = (row: Row) => { op = 'insert'; inserted = row; return b }
  b.update = (p: Row) => { op = 'update'; patch = p; return b }
  b.delete = () => { op = 'delete'; return b }
  b.then = (ok: (v: unknown) => unknown) => {
    const run = () => {
      if (!h.tables[name]) return { data: null, error: { message: 'relation does not exist', code: '42P01' } }
      const all = h.tables[name]!
      if (op === 'insert') {
        const r = inserted!
        if (r.ref != null && all.some((x) => x.kind === r.kind && x.ref === r.ref && x.carer_user_id === r.carer_user_id)) return { data: null, error: { code: '23505', message: 'duplicate' } }
        all.push({ id: `id${all.length + 1}`, pushed_at: null, seen_at: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), ...r })
        return { data: null, error: null }
      }
      const hit = (rows ?? all).filter((r) => preds.every((p) => p(r)))
      if (op === 'update' && h.failUpdate.has(name)) return { data: null, error: { message: 'write failed' } }
      if (op === 'update') { for (const r of hit) Object.assign(r, patch); return { data: null, error: null } }
      if (op === 'delete') { h.tables[name] = all.filter((r) => !hit.includes(r)); return { data: null, error: null } }
      const out = hit.slice(0, lim)
      return { data: single ? out[0] ?? null : out, error: null }
    }
    return Promise.resolve(run()).then(ok)
  }
  return b
}
const fakeSb = {
  from: (n: string) => builder(n),
  rpc: (n: string, a: Record<string, string>) => {
    h.rpcs.push(n)
    if (n === 'dose_watch_claim') { const k = `${a.p_person}|${a.p_day}|${a.p_slot}`; const fresh = !h.claimed.has(k); h.claimed.add(k); return Promise.resolve({ data: fresh, error: null }) }
    return Promise.resolve({ data: 0, error: null })
  }
}
vi.mock('npm:@supabase/supabase-js@2.118.0', () => ({ createClient: () => fakeSb }))
vi.mock('npm:web-push@3.6.7', () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string, opts: Record<string, unknown>) => {
      if (h.failWith.has(sub.endpoint)) { const e = new Error('push') as Error & { statusCode?: number }; e.statusCode = h.failWith.get(sub.endpoint); throw e }
      h.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), opts })
      h.afterSend?.()
    }
  }
}))
vi.mock('../_shared/heartbeat.ts', () => ({ heartbeat: (...a: unknown[]) => h.heartbeat(...a) }))

const SECRET = 's'.repeat(40)
const ENV: Record<string, string> = { DOSE_WATCH_CRON_SECRET: SECRET, VAPID_SUBJECT: 'mailto:x@example.com', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SUPABASE_URL: 'https://x.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' }
const NOW = new Date('2026-10-26T10:05:00+08:00')

async function call(body: unknown, secret: string | null = SECRET) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret != null) headers['x-dose-watch-secret'] = secret
  const res = await h.serve!(new Request('https://f.test/dose-watch', { method: 'POST', headers, body: JSON.stringify(body) }))
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}
const sub = (user: string, n = 1) => ({ user_id: user, endpoint: `https://push.test/${user}/${n}`, p256dh: 'k', auth: 'a' })
const alert = (id: string, user: string, template: string, extra: Row = {}) => ({ id, person_id: 'p1', carer_user_id: user, kind: 'sos', template, ref: id, pushed_at: null, created_at: '2026-10-26T09:50:00+08:00', expires_at: '2026-11-02T00:00:00Z', ...extra })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Object.assign(h, { tables: { carer_alerts: [], push_subscriptions: [], people: [{ id: 'p1', display_name: 'Lola Rosa Cruz', auth_user_id: 'u-p1', archived_at: null }], carers: [{ carer_id: 'c1', person_id: 'p1', can_write: true }, { carer_id: 'c2', person_id: 'p1', can_write: false }], medications: [], meds_taken: [], phone_health: [] }, claimed: new Set(), sent: [], rpcs: [], serve: null })
  h.failWith.clear(); h.failUpdate.clear(); h.afterSend = null; h.heartbeat.mockReset()
  ;(globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => ENV[k] }, serve: (fn: (r: Request) => Promise<Response>) => { h.serve = fn } }
  vi.resetModules()
  await import('./index.ts')
})
afterEach(() => { vi.useRealTimers(); delete (globalThis as { Deno?: unknown }).Deno })

describe('gate', () => {
  it('wrong or missing secret: 401 and no work, in flush mode too', async () => {
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_subscriptions!.push(sub('c1'))
    expect((await call({ mode: 'flush' }, 'nope')).status).toBe(401)
    expect((await call({ mode: 'flush' }, null)).status).toBe(401)
    expect((await call({}, 'x'.repeat(40))).status).toBe(401)
    expect(h.sent).toEqual([])
    expect(h.tables.carer_alerts![0]!.pushed_at).toBeNull()
  })
})

describe("mode 'flush'", () => {
  it('pushes only {t} to the carer own subscriptions, marks every row offered, never touches a pushed row, and runs nothing else', async () => {
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'), alert('a2', 'c2', 'storm_warning', { kind: 'hazard' }), alert('a3', 'c1', 'digest', { kind: 'digest', pushed_at: '2026-10-26T09:00:00Z' }))
    h.tables.push_subscriptions!.push(sub('c1'), sub('c1', 2), sub('other'))
    const r = await call({ mode: 'flush' })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ ok: true, mode: 'flush', pushed: 2 })
    expect(h.sent.map((s) => [s.endpoint, s.payload])).toEqual([['https://push.test/c1/1', { t: 'family_sos' }], ['https://push.test/c1/2', { t: 'family_sos' }]])
    expect(h.sent[0]!.opts).toMatchObject({ urgency: 'high' })
    for (const s of h.sent) expect(buildNotification(s.payload)).not.toBeNull() // the phone accepts every payload
    const byId = Object.fromEntries(h.tables.carer_alerts!.map((r) => [r.id, r.pushed_at]))
    expect(byId.a1).toBe(NOW.toISOString())
    expect(byId.a2).toBe(NOW.toISOString()) // c2 has no subscription: still "offered", the in-app row is the record
    expect(byId.a3).toBe('2026-10-26T09:00:00Z')
    expect(h.rpcs).toEqual([]) // no dose-watch run, no prune
    expect(h.heartbeat).not.toHaveBeenCalled()
  })
  it('a missed dose carries the first name only (the existing dose_watch payload); an unknown template is not pushed but is marked', async () => {
    h.tables.carer_alerts!.push(alert('d1', 'c1', 'dose_missed', { kind: 'dose_missed' }), alert('x1', 'c1', 'from_the_future'))
    h.tables.push_subscriptions!.push(sub('c1'))
    await call({ mode: 'flush' })
    expect(h.sent.map((s) => s.payload)).toEqual([{ t: 'dose_watch', n: 'Lola Rosa' }])
    expect(buildNotification(h.sent[0]!.payload)).not.toBeNull()
    expect(h.tables.carer_alerts!.every((r) => r.pushed_at)).toBe(true)
  })
  it('a gone subscription (410) is removed; a network error or a 500 is not removed; the row is still marked offered', async () => {
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_subscriptions!.push(sub('c1', 1), sub('c1', 2), sub('c1', 3))
    h.failWith.set('https://push.test/c1/1', 410); h.failWith.set('https://push.test/c1/2', undefined); h.failWith.set('https://push.test/c1/3', 500)
    const r = await call({ mode: 'flush' })
    expect(r.json.pushed).toBe(0)
    expect(h.tables.push_subscriptions!.map((s) => s.endpoint)).toEqual(['https://push.test/c1/2', 'https://push.test/c1/3'])
    expect(h.tables.carer_alerts![0]!.pushed_at).toBe(NOW.toISOString())
  })
  it('only fresh rows are offered: an alert older than 12 h or already expired is left alone', async () => {
    h.tables.carer_alerts!.push(alert('old', 'c1', 'family_sos', { created_at: '2026-10-25T10:00:00+08:00' }), alert('exp', 'c1', 'family_sos', { expires_at: '2026-10-26T00:00:00Z' }))
    h.tables.push_subscriptions!.push(sub('c1'))
    expect((await call({ mode: 'flush' })).json.pushed).toBe(0)
    expect(h.sent).toEqual([])
  })
})

describe('flush budget and write check (audit S1 minors)', () => {
  it('the 100 s budget runs from the start of the request and is checked before every send: nothing more starts, and the unfinished row stays unmarked', async () => {
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'), alert('a2', 'c1', 'storm_warning', { kind: 'hazard', created_at: '2026-10-26T09:40:00+08:00' }))
    h.tables.push_subscriptions!.push(sub('c1', 1), sub('c1', 2))
    h.afterSend = () => { vi.setSystemTime(new Date(NOW.getTime() + 101_000)) } // the first send "took" the rest of the budget
    const r = await call({ mode: 'flush' })
    expect(r.json.pushed).toBe(1)
    expect(h.sent).toHaveLength(1)
    expect(h.tables.carer_alerts!.every((x) => x.pushed_at == null)).toBe(true) // a1 had one send left: offered again next run, the tag makes it a replace
  })
  it('a failed pushed_at write is a failed run, not ok (else every run would resend for 12 h)', async () => {
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_subscriptions!.push(sub('c1'))
    h.failUpdate.add('carer_alerts')
    expect((await call({ mode: 'flush' })).status).toBe(500)
    const r = await call({})
    expect(r.json).toMatchObject({ ok: false, flush_failed: true })
  })
})

describe('a normal run', () => {
  it('prunes, sends the heartbeat once with counts only, and flushes too', async () => {
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_subscriptions!.push(sub('c1'))
    const r = await call({})
    expect(r.status).toBe(200)
    expect(h.rpcs).toContain('dose_watch_prune')
    expect(h.heartbeat).toHaveBeenCalledTimes(1)
    const [, job, ok, summary] = h.heartbeat.mock.calls[0]!
    expect([job, ok]).toEqual(['dose-watch', true])
    expect(JSON.stringify(summary)).not.toMatch(/Rosa|c1|u-p1/) // counts only
    expect(h.sent).toHaveLength(1)
  })
  it('a missing phone_health table (before 0032) is nothing to sweep, not a failure', async () => {
    delete h.tables.phone_health
    const r = await call({})
    expect(r.json.ok).toBe(true)
    expect(h.tables.carer_alerts).toHaveLength(0)
  })
})

describe('phone-health sweep', () => {
  const ph = (user_id: string, o: Row) => ({ user_id, platform: 'android', alarms_ok: null, last_open_at: '2026-10-26T08:00:00+08:00', ...o })
  it('alarms_ok false or not opened for 48 h raises one phone_health row for the WRITER carers only; unknown (null) raises nothing', async () => {
    h.tables.people!.push({ id: 'p2', display_name: 'Papa', auth_user_id: 'u-p2', archived_at: null }, { id: 'p3', display_name: 'Ate', auth_user_id: 'u-p3', archived_at: null }, { id: 'p4', display_name: 'Kuya', auth_user_id: 'u-p4', archived_at: null })
    h.tables.carers!.push({ carer_id: 'c1', person_id: 'p2', can_write: true }, { carer_id: 'c1', person_id: 'p3', can_write: true }, { carer_id: 'c1', person_id: 'p4', can_write: true })
    h.tables.phone_health!.push(
      ph('u-p1', { alarms_ok: false }),
      ph('u-p2', { last_open_at: '2026-10-23T10:00:00+08:00' }), // 3 days
      ph('u-p3', { last_open_at: null, alarms_ok: null }), // unknown: no alert
      ph('u-p4', { alarms_ok: true }))
    await call({})
    const rows = h.tables.carer_alerts!.filter((r) => r.kind === 'phone_health')
    expect(rows.map((r) => [r.person_id, r.carer_user_id, r.template, r.ref]).sort()).toEqual([
      ['p1', 'c1', 'phone_health', 'u-p1:2026-10-26'],
      ['p2', 'c1', 'phone_health', 'u-p2:2026-10-26']
    ])
    expect(rows.some((r) => r.carer_user_id === 'c2' || r.carer_user_id === 'u-p1')).toBe(false) // read-only carer and the person themself get nothing
  })
  it('running again the same Manila day adds nothing (duplicate ref ignored); the next day adds one', async () => {
    h.tables.phone_health!.push(ph('u-p1', { alarms_ok: false }))
    await call({}); await call({})
    expect(h.tables.carer_alerts!.filter((r) => r.kind === 'phone_health')).toHaveLength(1)
    vi.setSystemTime(new Date('2026-10-27T10:05:00+08:00'))
    await call({})
    expect(h.tables.carer_alerts!.filter((r) => r.kind === 'phone_health').map((r) => r.ref)).toEqual(['u-p1:2026-10-26', 'u-p1:2026-10-27'])
  })
  it('an archived person is not swept', async () => {
    h.tables.people![0]!.archived_at = '2026-10-01T00:00:00Z'
    h.tables.phone_health!.push(ph('u-p1', { alarms_ok: false }))
    await call({})
    expect(h.tables.carer_alerts).toHaveLength(0)
  })
})

describe('dose_due push (hazard M4)', () => {
  const med = (o: Row = {}) => ({ id: 'm1', person_id: 'p1', name: 'Losartan', med_status: 'active', deleted_at: null, as_needed: false, schedule: { v: 1, times: ['10:00'] }, started_on: null, stopped_on: null, ...o })
  it('at the slot (inside the 15 minute window) the person own browser gets {t:dose_due}', async () => {
    h.tables.medications!.push(med())
    h.tables.push_subscriptions!.push(sub('u-p1'), sub('c1'))
    await call({})
    const due = h.sent.filter((s) => (s.payload as { t: string }).t === 'dose_due')
    expect(due.map((s) => s.endpoint)).toEqual(['https://push.test/u-p1/1'])
    expect(buildNotification(due[0]!.payload)!.cls).toBe('health')
    expect(due[0]!.opts).toMatchObject({ urgency: 'normal' })
  })
  it('not before the slot, not after the window, not when already taken, not for the Android app, and a person with no phone_health row still gets it', async () => {
    h.tables.push_subscriptions!.push(sub('u-p1'))
    h.tables.medications!.push(med({ schedule: { v: 1, times: ['10:10'] } }))
    await call({})
    h.tables.medications![0] = med({ schedule: { v: 1, times: ['09:45'] } }) // 20 min ago
    await call({})
    expect(h.sent).toEqual([])
    h.tables.medications![0] = med()
    h.tables.meds_taken!.push({ person_id: 'p1', medication_id: 'm1', slot: '10:00', taken_at: '2026-10-26T10:01:00+08:00', name: 'Losartan' })
    await call({})
    expect(h.sent).toEqual([])
    h.tables.meds_taken!.length = 0
    h.tables.phone_health!.push({ user_id: 'u-p1', platform: 'android', alarms_ok: true, last_open_at: null })
    await call({})
    expect(h.sent).toEqual([])
    h.tables.phone_health!.length = 0 // no row: platform unknown counts as web
    await call({})
    expect(h.sent).toHaveLength(1)
  })
  it('platform web in phone_health gets it; two medicines at one slot are one push', async () => {
    h.tables.medications!.push(med(), med({ id: 'm2', name: 'Metformin' }))
    h.tables.push_subscriptions!.push(sub('u-p1'))
    h.tables.phone_health!.push({ user_id: 'u-p1', platform: 'web', alarms_ok: null, last_open_at: null })
    await call({})
    expect(h.sent.filter((s) => (s.payload as { t: string }).t === 'dose_due')).toHaveLength(1)
  })
})
