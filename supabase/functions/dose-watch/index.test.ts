// @vitest-environment node
// Drives the real index.ts handler with a faked Deno, a faked supabase client (in-memory tables) and a faked web-push. Fixed clock: 2026-10-26 10:05 Asia/Manila.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNotification, renderTemplate, TEMPLATES } from '../../../src/features/notify/templates'

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  claimed: new Set<string>(),
  sent: [] as { endpoint: string; payload: Record<string, unknown>; opts: Record<string, unknown> }[],
  failWith: new Map<string, number | undefined>(), // endpoint -> status code (undefined = network error)
  heartbeat: vi.fn(),
  rpcs: [] as string[],
  failUpdate: new Set<string>(), // tables whose update answers an error
  failSelect: new Set<string>(), // tables whose read answers an error
  afterSend: null as null | (() => void),
  serve: null as null | ((req: Request) => Promise<Response>),
  fcm: [] as { token: string; msg: { notification: { title: string; body: string }; data: { t: string }; android: { priority: string; notification: { channel_id: string; tag: string } } } }[],
  fcmStatus: new Map<string, number | null>(), // token -> status (null = no answer); default 200
  afterFcm: null as null | (() => void),
  port: null as null | { digestOff(ids: string[]): Promise<Set<string>> }
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
      if (op === 'select' && h.failSelect.has(name)) return { data: null, error: { message: 'read failed' } }
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
// FCM: the real message builders run; only the service account parse and the network send are faked (the JWT and HTTP are tested in _shared/fcm.test.ts).
vi.mock('../_shared/fcm.ts', async (orig) => ({
  ...(await orig<typeof import('../_shared/fcm.ts')>()),
  parseServiceAccount: (b64?: string) => (b64 ? { client_email: 'sa@x', private_key: 'k', project_id: 'p' } : null),
  sendFcm: async (_sa: unknown, token: string, msg: (typeof h.fcm)[number]['msg']) => { h.fcm.push({ token, msg }); h.afterFcm?.(); return h.fcmStatus.has(token) ? h.fcmStatus.get(token)! : 200 }
}))
// capture the port runDoseWatch receives, so the index.ts adapter (digestOff) is exercised through the real wiring
vi.mock('./logic.ts', async (orig) => {
  const real = await orig<typeof import('./logic.ts')>()
  return { ...real, runDoseWatch: (port: never, ...a: never[]) => { h.port = port; return (real.runDoseWatch as (...x: unknown[]) => unknown)(port, ...a) } }
})

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
  h.failWith.clear(); h.failUpdate.clear(); h.failSelect.clear(); h.afterSend = null; h.heartbeat.mockReset()
  h.fcm = []; h.fcmStatus.clear(); h.afterFcm = null; h.port = null; delete ENV.FIREBASE_SERVICE_ACCOUNT_B64
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
  it('a carer missed-dose row pushes the carer-class dose_watch, never the user-class dose_missed and never a name (B-7); an unknown template is not pushed but is marked', async () => {
    h.tables.carer_alerts!.push(alert('d1', 'c1', 'dose_missed', { kind: 'dose_missed' }), alert('x1', 'c1', 'from_the_future'))
    h.tables.push_subscriptions!.push(sub('c1'))
    await call({ mode: 'flush' })
    expect(h.sent.map((s) => s.payload)).toEqual([{ t: 'dose_watch' }])
    expect(h.sent[0]!.opts).toMatchObject({ urgency: 'high' })
    expect(JSON.stringify(h.sent)).not.toContain('Lola')
    expect(buildNotification(h.sent[0]!.payload)).toMatchObject({ cls: 'carer', tag: 'dose_watch' })
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

describe('FCM to the Android app (lane E, D-85)', () => {
  const tok = (user: string, n = 1, o: Row = {}) => ({ token: `${user}-token-${n}`.padEnd(24, 'x'), user_id: user, failed: 0, last_ok_at: null, ...o })
  const on = () => { ENV.FIREBASE_SERVICE_ACCOUNT_B64 = 'b64' }
  beforeEach(() => { h.tables.push_tokens = [] })

  it('without the Firebase secret nothing is sent to FCM and the run is web push only, as before', async () => {
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_tokens!.push(tok('c1'))
    const r = await call({ mode: 'flush' })
    expect(h.fcm).toEqual([])
    expect(r.json).toMatchObject({ ok: true, pushed: 0, webPushed: 0, fcmPushed: 0 })
    expect(h.tables.carer_alerts![0]!.pushed_at).toBe(NOW.toISOString())
  })
  it('sends the template title and body to each of the carer own tokens and to nobody else; counts them, stamps last_ok_at, marks the row once', async () => {
    on()
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_tokens!.push(tok('c1', 1), tok('c1', 2), tok('c2'))
    h.tables.push_subscriptions!.push(sub('c1'))
    const r = await call({ mode: 'flush' })
    expect(r.json).toMatchObject({ ok: true, webPushed: 1, fcmPushed: 2, pushed: 1 })
    expect(h.fcm.map((f) => f.token)).toEqual([tok('c1', 1).token, tok('c1', 2).token])
    expect(h.fcm[0]!.msg).toEqual({
      notification: { title: renderTemplate('family_sos').title, body: renderTemplate('family_sos').body },
      data: { t: 'family_sos' },
      android: { priority: 'high', notification: { channel_id: 'carer_alerts', tag: 'family_sos' } }
    })
    expect(h.tables.push_tokens!.filter((t) => t.last_ok_at).map((t) => t.token)).toEqual([tok('c1', 1).token, tok('c1', 2).token])
    expect(h.tables.carer_alerts![0]!.pushed_at).toBe(NOW.toISOString())
    await call({ mode: 'flush' })
    expect(h.fcm).toHaveLength(2) // a marked row is never sent again
  })
  it('never carries a name: every template, with the person and carers named in the database (B-7)', async () => {
    on()
    h.tables.push_tokens!.push(tok('c1'))
    let i = 0
    for (const id of Object.keys(TEMPLATES)) h.tables.carer_alerts!.push(alert(`t${i++}`, 'c1', id, { kind: id === 'dose_missed' ? 'dose_missed' : 'system', ref: `r${i}` }))
    await call({ mode: 'flush' })
    expect(h.fcm.length).toBeGreaterThan(20)
    const all = JSON.stringify(h.fcm)
    for (const n of ['Lola', 'Rosa', 'Cruz', 'u-p1']) expect(all).not.toContain(n)
    expect(all).not.toMatch(/<name>/)
    for (const f of h.fcm) {
      const t = f.msg.data.t
      const expected = t === 'dose_watch' ? buildNotification({ t })! : renderTemplate(t)
      expect([f.msg.notification.title, f.msg.notification.body]).toEqual([expected.title, expected.body])
    }
  })
  it('a carer missed-dose row sends the carer-class dose_watch message', async () => {
    on()
    h.tables.carer_alerts!.push(alert('d1', 'c1', 'dose_missed', { kind: 'dose_missed' }))
    h.tables.push_tokens!.push(tok('c1'))
    await call({ mode: 'flush' })
    expect(h.fcm.map((f) => f.msg)).toEqual([{
      notification: { title: 'A medicine was missed', body: 'A medicine was missed by someone you look after.' },
      data: { t: 'dose_watch' },
      android: { priority: 'high', notification: { channel_id: 'carer_alerts', tag: 'dose_watch' } }
    }])
  })
  it('quiet hours: a tone-normal alert at 23:00 Manila uses carer_quiet; SOS at 23:00 stays carer_alerts', async () => {
    on()
    vi.setSystemTime(new Date('2026-10-26T23:00:00+08:00'))
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'digest', { kind: 'digest', created_at: '2026-10-26T22:55:00+08:00' }), alert('a2', 'c1', 'family_sos', { created_at: '2026-10-26T22:56:00+08:00' }))
    h.tables.push_tokens!.push(tok('c1'))
    await call({ mode: 'flush' })
    expect(Object.fromEntries(h.fcm.map((f) => [f.msg.data.t, f.msg.android.notification.channel_id]))).toEqual({ digest: 'carer_quiet', family_sos: 'carer_alerts' })
  })
  it('404 and 410 (unregistered) delete the token row; other tokens of that carer still get the message', async () => {
    on()
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_tokens!.push(tok('c1', 1), tok('c1', 2), tok('c1', 3))
    h.fcmStatus.set(tok('c1', 1).token, 404); h.fcmStatus.set(tok('c1', 2).token, 410)
    const r = await call({ mode: 'flush' })
    expect(h.tables.push_tokens!.map((t) => t.token)).toEqual([tok('c1', 3).token])
    expect(r.json.fcmPushed).toBe(1)
    expect(h.tables.carer_alerts![0]!.pushed_at).toBe(NOW.toISOString())
  })
  it('a 500 keeps the token and leaves the row unmarked for the next run; a 400 counts a failure and the row is marked', async () => {
    on()
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'), alert('a2', 'c2', 'family_sos'))
    h.tables.push_tokens!.push(tok('c1'), tok('c2', 1, { failed: 4 }))
    h.fcmStatus.set(tok('c1').token, 500)
    h.fcmStatus.set(tok('c2', 1).token, 400)
    await call({ mode: 'flush' })
    expect(h.tables.push_tokens!.map((t) => [t.user_id, t.failed])).toEqual([['c1', 0], ['c2', 5]])
    expect(Object.fromEntries(h.tables.carer_alerts!.map((r) => [r.id, r.pushed_at]))).toEqual({ a1: null, a2: NOW.toISOString() })
    h.fcmStatus.set(tok('c1').token, 200)
    await call({ mode: 'flush' }) // next run: the unmarked row goes out and is marked
    expect(h.tables.carer_alerts!.find((r) => r.id === 'a1')!.pushed_at).toBe(NOW.toISOString())
  })
  it('no answer at all (null) also leaves the row unmarked', async () => {
    on()
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_tokens!.push(tok('c1'))
    h.fcmStatus.set(tok('c1').token, null)
    await call({ mode: 'flush' })
    expect(h.tables.carer_alerts![0]!.pushed_at).toBeNull()
  })
  it('a disabled carer gets no FCM (ML-33), an enabled one does', async () => {
    on()
    h.tables.app_roles = [{ user_id: 'c2', disabled: true }]
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'), alert('a2', 'c2', 'family_sos'))
    h.tables.push_tokens!.push(tok('c1'), tok('c2'))
    await call({ mode: 'flush' })
    expect(h.fcm.map((f) => f.token)).toEqual([tok('c1').token])
  })
  it('the 100 s budget stops FCM too: after it no send starts and the unfinished row stays unmarked', async () => {
    on()
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_tokens!.push(tok('c1', 1), tok('c1', 2))
    h.afterFcm = () => { vi.setSystemTime(new Date(NOW.getTime() + 101_000)) }
    await call({ mode: 'flush' })
    expect(h.fcm).toHaveLength(1)
    expect(h.tables.carer_alerts![0]!.pushed_at).toBeNull()
  })
  it('a missing push_tokens table (before 0040) is no tokens, not a failure', async () => {
    on()
    delete h.tables.push_tokens
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    const r = await call({ mode: 'flush' })
    expect(r.status).toBe(200)
    expect(h.tables.carer_alerts![0]!.pushed_at).toBe(NOW.toISOString())
  })
  it('an unreadable push_tokens table does not block web push: web push still goes out and the row is left to try again', async () => {
    on()
    h.failSelect.add('push_tokens')
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_subscriptions!.push(sub('c1'))
    const r = await call({ mode: 'flush' })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ ok: true, webPushed: 1, fcmPushed: 0, fcmRetried: 1 })
    expect(h.tables.carer_alerts![0]!.pushed_at).toBeNull() // the FCM leg was not tried: offered again next run
  })
  it('every FCM send needs a retry (auth broken): the heartbeat turns red with fcmRetried, so a dead FCM path is visible', async () => {
    on()
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_tokens!.push(tok('c1'))
    h.fcmStatus.set(tok('c1').token, null)
    await call({})
    const [, , ok, summary] = h.heartbeat.mock.calls[0]!
    expect(ok).toBe(false)
    expect((summary as Record<string, unknown>).fcmRetried).toBe(1)
  })
  it('a normal run puts fcmPushed in the heartbeat summary (counts only)', async () => {
    on()
    h.tables.carer_alerts!.push(alert('a1', 'c1', 'family_sos'))
    h.tables.push_tokens!.push(tok('c1'))
    await call({})
    const [, job, ok, summary] = h.heartbeat.mock.calls[0]!
    expect([job, ok]).toEqual(['dose-watch', true])
    expect((summary as Record<string, unknown>).fcmPushed).toBe(1)
    expect(JSON.stringify(summary)).not.toContain('token')
  })
  it('port.digestOff: the user ids with digest_on = false; a missing carer_prefs table (before 0039) is nobody', async () => {
    await call({})
    h.tables.carer_prefs = [{ user_id: 'c1', digest_on: false }, { user_id: 'c2', digest_on: true }]
    expect([...(await h.port!.digestOff(['c1', 'c2', 'c3']))]).toEqual(['c1'])
    expect([...(await h.port!.digestOff([]))]).toEqual([])
    delete h.tables.carer_prefs
    expect([...(await h.port!.digestOff(['c1']))]).toEqual([])
  })
})
