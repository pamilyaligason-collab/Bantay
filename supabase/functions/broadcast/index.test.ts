// @vitest-environment node
// Drives the real index.ts with a faked Deno, supabase client and web-push. Audit S1 major: a hazard broadcast must mark the rows it created as offered (pushed_at), else dose-watch's flush pushes the same alert again.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  updates: [] as { patch: Record<string, unknown>; eq: [string, unknown][]; isNull: string[] }[],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  sent: 0,
  serve: null as null | ((req: Request) => Promise<Response>)
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
      b.update = (patch: Record<string, unknown>) => { q.op = 'update'; q.patch = patch; return b }
      b.then = (ok: (v: unknown) => unknown) => {
        if (q.op === 'update' && name === 'carer_alerts') h.updates.push({ patch: q.patch, eq: q.eq, isNull: q.isNull })
        const data = name === 'people' ? [{ id: 'p1' }, { id: 'p2' }] : name === 'push_subscriptions' ? [{ endpoint: 'https://push.test/1', p256dh: 'k', auth: 'a' }] : null
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
  Object.assign(h, { updates: [], rpcs: [], sent: 0, serve: null })
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
