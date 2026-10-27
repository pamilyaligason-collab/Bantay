// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { RESET_COMPLETE_IP_LIMIT, RESET_HANDLE_LIMIT, RESET_IP_LIMIT, resetComplete, resetStart, type ResetPort, type ResetRow } from './login.ts'
import { derivePassword, hashResetSecret, limiterKey } from './pin.ts'

const PEPPER = 'p'.repeat(32)
const USER = '11111111-1111-4111-8111-111111111111'

function fake(over: Partial<ResetPort> = {}) {
  const rows = new Map<string, ResetRow & { approved?: boolean }>()
  const calls = { notified: [] as string[], pins: [] as string[], after: 0, keys: new Map<string, number>(), released: 0 }
  const port: ResetPort = {
    pepper: PEPPER,
    async tryKey(k) { const n = (calls.keys.get(k) ?? 0) + 1; calls.keys.set(k, n); return n },
    async findUser(h) { return h === 'lola' ? { userId: USER, email: 'm-x@members.bantay.invalid', disabled: false }
      : h === 'gone' ? { userId: USER, email: 'm-x@members.bantay.invalid', disabled: true }
      : h === 'goog' ? { userId: USER, email: 'a@gmail.com', disabled: false } : null },
    async createRequest(r) { rows.set(r.id, { id: r.id, userId: r.userId, secretHash: r.secretHash, approvedAt: r.approved ? new Date().toISOString() : null, usedAt: null, expiresAt: new Date(Date.now() + 900_000).toISOString() }) },
    async notifyApprovers(id) { calls.notified.push(id) },
    async verifyGoogle(t) { return t === 'good' ? USER : t === 'other' ? '22222222-2222-4222-8222-222222222222' : null },
    async getRequest(id) { return rows.get(id) ?? null },
    async claim(id) { const r = rows.get(id)!; if (r.usedAt || !r.approvedAt) return false; r.usedAt = 'now'; return true },
    async release(id) { rows.get(id)!.usedAt = null; calls.released++ },
    async setPin(_u, pw) { calls.pins.push(pw); return true },
    async afterReset() { calls.after++ },
    ...over
  }
  return { port, rows, calls }
}
const start = async (p: ResetPort, b: Record<string, unknown>, ip = '1.1.1.1') => (await resetStart({ handle: 'lola', method: 'family', ...b }, ip, p))

describe('reset_start', () => {
  it('returns id, 128-bit secret and a 4-digit code; stores only a hash; family method notifies approvers', async () => {
    const f = fake()
    const r = await start(f.port, {})
    const b = r.body as { id: string; secret: string; code: string }
    expect(r.status).toBe(200)
    expect(b.code).toMatch(/^\d{4}$/)
    expect(b.secret.length).toBe(22) // 16 bytes, base64url
    expect(f.rows.get(b.id)!.secretHash).toBe(await hashResetSecret(PEPPER, b.id, b.secret))
    expect(JSON.stringify([...f.rows.values()])).not.toContain(b.secret)
    expect(f.calls.notified).toEqual([b.id])
  })
  it('gives the same reply shape for unknown, disabled, malformed and Google-only handles, and stores nothing', async () => {
    const f = fake()
    const real = Object.keys((await start(f.port, {})).body).sort()
    for (const handle of ['nobody', 'gone', 'goog', '!!', 5]) {
      const r = await start(f.port, { handle }, '2.2.2.' + String(handle).length)
      expect(r.status).toBe(200)
      expect(Object.keys(r.body).sort()).toEqual(real)
    }
    expect(f.rows.size).toBe(1)
    expect(f.calls.notified.length).toBe(1)
  })
  it('limits 3 per hour per handle (unknown handles too) and 10 per hour per IP, with the same 429', async () => {
    const f = fake()
    for (let i = 0; i < RESET_HANDLE_LIMIT; i++) expect((await start(f.port, {}, `9.9.9.${i}`)).status).toBe(200)
    expect(await start(f.port, {}, '9.9.9.99')).toEqual({ status: 429, body: { ok: false, error: 'rate_limited' } })
    const g = fake()
    for (let i = 0; i < RESET_HANDLE_LIMIT; i++) await start(g.port, { handle: 'nobody' }, `8.8.8.${i}`)
    expect(await start(g.port, { handle: 'nobody' }, '8.8.8.99')).toEqual({ status: 429, body: { ok: false, error: 'rate_limited' } })
    const h = fake()
    for (let i = 0; i < RESET_IP_LIMIT; i++) expect((await start(h.port, { handle: 'h' + i + 'abc' })).status).toBe(200)
    expect((await start(h.port, { handle: 'zzzz' })).status).toBe(429)
  })
  it('counts the limiter before any lookup and keys it apart from login', async () => {
    const f = fake()
    await start(f.port, {})
    expect([...f.calls.keys.keys()]).toContain(await limiterKey(PEPPER, 'ip', 'reset:1.1.1.1'))
    expect([...f.calls.keys.keys()]).not.toContain(await limiterKey(PEPPER, 'ip', '1.1.1.1'))
  })
  it('rejects an unknown method', async () => expect((await start(fake().port, { method: 'admin' })).status).toBe(400))
  it('google method approves only when the token user is the target', async () => {
    const f = fake()
    const ok = (await start(f.port, { method: 'google', google_token: 'good' })).body as { id: string }
    const no = (await start(f.port, { method: 'google', google_token: 'other' }, '3.3.3.3')).body as { id: string }
    const none = (await start(f.port, { method: 'google' }, '4.4.4.4')).body as { id: string }
    expect(f.rows.get(ok.id)!.approvedAt).not.toBeNull()
    expect(f.rows.get(no.id)!.approvedAt).toBeNull()
    expect(f.rows.get(none.id)!.approvedAt).toBeNull()
    expect(f.calls.notified).toEqual([]) // google never alerts the family
  })
})

describe('reset_complete', () => {
  async function approved(f: ReturnType<typeof fake>) {
    const b = (await start(f.port, {})).body as { id: string; secret: string }
    f.rows.get(b.id)!.approvedAt = new Date().toISOString()
    return b
  }
  const done = (p: ResetPort, b: Record<string, unknown>) => resetComplete({ new_pin: '482916', ...b }, '1.1.1.1', p)

  it('sets the derived password, marks it used once, and runs the after-steps', async () => {
    const f = fake(); const b = await approved(f)
    expect(await done(f.port, b)).toEqual({ status: 200, body: { ok: true } })
    expect(f.calls.pins).toEqual([await derivePassword(PEPPER, USER, '482916')])
    expect(f.rows.get(b.id)!.usedAt).not.toBeNull()
    expect(f.calls.after).toBe(1)
    expect((await done(f.port, b)).body).toEqual({ ok: false, error: 'used' })
    expect(f.calls.pins.length).toBe(1)
  })
  it('refuses a wrong secret, an unknown id, and does not reveal which', async () => {
    const f = fake(); const b = await approved(f)
    expect((await done(f.port, { ...b, secret: 'x'.repeat(22) })).body).toEqual({ ok: false, error: 'bad_secret' })
    expect((await done(f.port, { ...b, id: '33333333-3333-4333-8333-333333333333' })).body).toEqual({ ok: false, error: 'bad_secret' })
    expect(f.calls.pins).toEqual([])
  })
  it('refuses an unapproved request', async () => {
    const f = fake(); const b = (await start(f.port, {})).body as { id: string; secret: string }
    expect((await done(f.port, b)).body).toEqual({ ok: false, error: 'not_approved' })
  })
  it('refuses an expired request', async () => {
    const f = fake(); const b = await approved(f)
    f.rows.get(b.id)!.expiresAt = new Date(Date.now() - 1000).toISOString()
    expect(((await done(f.port, b)).body)).toEqual({ ok: false, error: 'expired' })
  })
  it('a burned request (used_at set) is refused as used', async () => {
    const f = fake(); const b = await approved(f)
    f.rows.get(b.id)!.usedAt = 'burned'
    expect((await done(f.port, b)).body).toEqual({ ok: false, error: 'used' })
  })
  it('refuses weak PINs before touching anything, and bad shapes', async () => {
    const f = fake(); const b = await approved(f)
    for (const new_pin of ['123456', '111111', '1234', 'abcdef', 482916]) expect((await done(f.port, { ...b, new_pin })).body).toEqual({ ok: false, error: 'weak_pin' })
    expect((await done(f.port, { id: 'nope', secret: 'x' })).status).toBe(400)
    expect(f.calls.pins).toEqual([])
  })
  it('two parallel completes: one wins', async () => {
    const f = fake(); const b = await approved(f)
    const rs = await Promise.all([done(f.port, b), done(f.port, b)])
    expect(rs.filter((r) => r.status === 200).length).toBe(1)
    expect(f.calls.pins.length).toBe(1)
  })
  it('a failed password write releases the request and reports a server error', async () => {
    const f = fake({ setPin: async () => false }); const b = await approved(f)
    expect((await done(f.port, b)).status).toBe(500)
    expect(f.rows.get(b.id)!.usedAt).toBeNull()
    expect(f.calls.after).toBe(0)
  })
  it('limits tries per request and per IP', async () => {
    const f = fake(); const b = await approved(f)
    let last = 0
    for (let i = 0; i < 12; i++) last = (await done(f.port, { ...b, secret: 'y'.repeat(22) })).status
    expect(last).toBe(429)
  })
  it('reset_complete has its own per-IP bucket of 120 an hour, separate from reset_start', async () => {
    expect(RESET_COMPLETE_IP_LIMIT).toBe(120)
    const f = fake()
    for (let i = 0; i < RESET_IP_LIMIT + 1; i++) await start(f.port, { handle: 'h' + i }) // reset_start's bucket is now exhausted
    expect((await start(f.port, {})).status).toBe(429)
    const other = (n: number) => resetComplete({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, secret: 'x'.repeat(22), new_pin: '482916' }, '1.1.1.1', f.port)
    for (let n = 1; n <= RESET_COMPLETE_IP_LIMIT; n++) expect((await other(n)).status).toBe(403) // unknown ids reach the secret check, none is rate limited
    expect((await other(999)).status).toBe(429) // the 121st from the same IP
  })
})
