// @vitest-environment node
// Drives the real index.ts with a faked Deno, supabase client and web-push. Audit S1 major: a hazard broadcast must mark the rows it created as offered (pushed_at), else dose-watch's flush pushes the same alert again.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  updates: [] as { patch: Record<string, unknown>; eq: [string, unknown][]; isNull: string[] }[],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  sent: 0,
  serve: null as null | ((req: Request) => Promise<Response>),
  fcm: [] as { token: string; msg: { notification: { title: string; body: string }; data: { t: string }; android: { notification: { channel_id: string } } } }[],
  fcmStatus: new Map<string, number | null>(),
  tokens: [] as { token: string; user_id: string }[],
  disabled: [] as { user_id: string }[],
  subs: true,
  deleted: [] as { table: string; col: string; vals: unknown[] }[]
}))
vi.mock('../_shared/fcm.ts', async (orig) => ({
  ...(await orig<typeof import('../_shared/fcm.ts')>()),
  parseServiceAccount: (b64?: string) => (b64 ? { client_email: 'sa@x', private_key: 'k', project_id: 'p' } : null),
  sendFcm: async (_sa: unknown, token: string, msg: (typeof h.fcm)[number]['msg']) => { h.fcm.push({ token, msg }); return h.fcmStatus.has(token) ? h.fcmStatus.get(token)! : 200 }
}))

vi.mock('npm:@supabase/supabase-js@2.118.0', () => ({
  createClient: (_u: string, key: string) => {
    if (key === 'anon') return { auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) }, rpc: async () => ({ data: true }) }
    const table = (name: string) => {
      const q = { patch: {} as Record<string, unknown>, eq: [] as [string, unknown][], isNull: [] as string[], op: 'select' }
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.not = () => b
      b.is = (c: string, v: unknown) => { if (v === null) q.isNull.push(c); return b }
      b.eq = (c: string, v: unknown) => { q.eq.push([c, v]); return b }
      let inArg: { col: string; vals: unknown[] } | null = null
      b.in = (c: string, vals: unknown[]) => { inArg = { col: c, vals }; return b }
      b.delete = () => { q.op = 'delete'; return b }
      b.update = (patch: Record<string, unknown>) => { q.op = 'update'; q.patch = patch; return b }
      b.then = (ok: (v: unknown) => unknown) => {
        if (q.op === 'update' && name === 'carer_alerts') h.updates.push({ patch: q.patch, eq: q.eq, isNull: q.isNull })
        if (q.op === 'delete' && inArg) h.deleted.push({ table: name, ...inArg })
        const data = name === 'people' ? [{ id: 'p1' }, { id: 'p2' }] : name === 'push_subscriptions' ? (h.subs ? [{ endpoint: 'https://push.test/1', p256dh: 'k', auth: 'a' }] : []) : name === 'push_tokens' ? h.tokens : name === 'app_roles' ? h.disabled : null
        return Promise.resolve({ data, error: null }).then(ok)
      }
      return b
    }
    return { from: table, rpc: async (fn: string, args: Record<string, unknown>) => { h.rpcs.push({ fn, args }); return { data: 1 } } }
  }
}))
vi.mock('npm:web-push@3.6.7', () => ({ default: { setVapidDetails: () => undefined, sendNotification: async () => { h.sent++ } } }))

const ENV: Record<string, string> = { VAPID_SUBJECT: 'mailto:x@example.com', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', SUPABASE_URL: 'https://x.supabase.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' }
const call = async (body: unknown) => {
  const res = await h.serve!(new Request('https://f.test/broadcast', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body) }))
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

beforeEach(async () => {
  Object.assign(h, { updates: [], rpcs: [], sent: 0, serve: null, fcm: [], tokens: [], disabled: [], subs: true, deleted: [] })
  h.fcmStatus.clear(); delete ENV.FIREBASE_SERVICE_ACCOUNT_B64
  ;(globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => ENV[k] }, serve: (fn: (r: Request) => Promise<Response>) => { h.serve = fn } }
  vi.resetModules()
  await import('./index.ts')
})

describe('broadcast + carer_alerts rows', () => {
  it('a hazard broadcast creates one row per person and marks them offered under the same ref, once', async () => {
    const r = await call({ t: 'storm_warning' })
    expect(r.json).toMatchObject({ ok: true, sent: 1, rows: 2 })
    expect(h.rpcs).toHaveLength(2)
    const ref = h.rpcs[0]!.args.p_ref
    expect(h.rpcs[1]!.args.p_ref).toBe(ref)
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0]!.patch.pushed_at).toBeTypeOf('string')
    expect(h.updates[0]!.eq).toEqual([['kind', 'hazard'], ['ref', ref]])
    expect(h.updates[0]!.isNull).toEqual(['pushed_at'])
  })
  it('a non-hazard broadcast (family_sos) makes no rows and marks nothing', async () => {
    const r = await call({ t: 'family_sos' })
    expect(r.json).toMatchObject({ ok: true, rows: 0 })
    expect(h.updates).toHaveLength(0)
  })
})

describe('broadcast FCM (lane E, D-85)', () => {
  const tk = (user: string, n = 1) => ({ token: `${user}-token-${n}`.padEnd(24, 'x'), user_id: user })
  it('without the Firebase secret there is no FCM and fcmSent is 0', async () => {
    h.tokens.push(tk('u1'))
    const r = await call({ t: 'heat_alert' })
    expect(r.json).toMatchObject({ ok: true, sent: 1, fcmSent: 0 })
    expect(h.fcm).toEqual([])
  })
  it('sends the template (no name) to every token of a non-disabled member, even when there are no web subscriptions; counts fcmSent', async () => {
    ENV.FIREBASE_SERVICE_ACCOUNT_B64 = 'b64'
    h.subs = false
    h.tokens.push(tk('u1', 1), tk('u1', 2), tk('u2'), tk('off'))
    h.disabled.push({ user_id: 'off' })
    const r = await call({ t: 'heat_alert' })
    expect(r.json).toMatchObject({ ok: true, sent: 0, fcmSent: 3, rows: 2 })
    expect(h.fcm.map((f) => f.token)).toEqual([tk('u1', 1).token, tk('u1', 2).token, tk('u2').token])
    expect(h.fcm[0]!.msg).toEqual({
      notification: { title: 'Dangerous heat today', body: 'Open Bantay for ways to stay safe.' },
      data: { t: 'heat_alert' },
      android: { priority: 'high', notification: { channel_id: 'carer_alerts', tag: 'heat_alert' } }
    })
    expect(JSON.stringify(h.fcm)).not.toMatch(/<name>|Lola|Rosa/)
  })
  it('family_sos broadcast is carer_alerts at 3 AM too (urgent, never quiet)', async () => {
    ENV.FIREBASE_SERVICE_ACCOUNT_B64 = 'b64'
    h.tokens.push(tk('u1'))
    const r = await call({ t: 'family_sos' })
    expect(r.json).toMatchObject({ fcmSent: 1 })
    expect(h.fcm[0]!.msg.android.notification.channel_id).toBe('carer_alerts')
  })
  it('an unregistered token (404 or 410) is deleted; a 500 keeps it; neither fails the broadcast', async () => {
    ENV.FIREBASE_SERVICE_ACCOUNT_B64 = 'b64'
    h.tokens.push(tk('u1', 1), tk('u1', 2), tk('u1', 3), tk('u1', 4))
    h.fcmStatus.set(tk('u1', 1).token, 404); h.fcmStatus.set(tk('u1', 2).token, 410); h.fcmStatus.set(tk('u1', 3).token, 500)
    const r = await call({ t: 'storm_warning' })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ ok: true, fcmSent: 1 })
    expect(h.deleted.filter((d) => d.table === 'push_tokens')).toEqual([{ table: 'push_tokens', col: 'token', vals: [tk('u1', 1).token, tk('u1', 2).token] }])
  })
})
