// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { INVITE_PEEK_LIMIT, JOIN_IP_LIMIT, inviteNames, joinClaim, tokenHash, type InviteState, type JoinPort, type PeekPort } from './join.ts'
import { derivePassword, limiterKey } from '../_shared/pin.ts'

const PEPPER = 'p'.repeat(32)
const USER = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'A'.repeat(43)
const PIN = '135790'

type Link = { userId: string; usedAt: boolean; attempts: number; ended: boolean }
function fake(over: Partial<JoinPort> = {}, signedIn = false) {
  const links = new Map<string, Link>()
  const c = { keys: new Map<string, number>(), pins: [] as string[], after: 0, released: 0, uses: 0 }
  const port: JoinPort = {
    pepper: PEPPER,
    async tryKey(k) { const n = (c.keys.get(k) ?? 0) + 1; c.keys.set(k, n); return n },
    async check(h) { const l = links.get(h); if (!l || l.usedAt || l.ended || l.attempts >= 5) return null; l.attempts++; return { userId: l.userId, handle: 'nene' } },
    async hasSignedIn() { return signedIn },
    async use(h) { c.uses++; const l = links.get(h); if (!l || l.usedAt || l.ended) return false; l.usedAt = true; return true },
    async release(h) { links.get(h)!.usedAt = false; c.released++ },
    async setPin(_u, pw) { c.pins.push(pw); return true },
    async afterJoin() { c.after++ },
    ...over
  }
  return { port, links, c }
}
const open = async (f: ReturnType<typeof fake>, token = TOKEN) => { const h = await tokenHash(token); f.links.set(h, { userId: USER, usedAt: false, attempts: 0, ended: false }); return h }
const claim = (p: JoinPort, b: Record<string, unknown> = {}, ip = '1.1.1.1') => joinClaim({ token: TOKEN, pin: PIN, ...b }, ip, p)
const BAD = { status: 400, body: { ok: false, why: 'bad_invite' } }

describe('tokenHash', () => {
  it('is the hex SHA-256 of the token (hand value for "abc")', async () => {
    expect(await tokenHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('join_claim', () => {
  it('a good link and PIN sets the derived password, burns the link once, audits, and replies ok', async () => {
    const f = fake(); const h = await open(f)
    expect(await claim(f.port)).toEqual({ status: 200, body: { ok: true } })
    expect(f.c.pins).toEqual([await derivePassword(PEPPER, USER, PIN)])
    expect(f.links.get(h)!.usedAt).toBe(true)
    expect(f.c.after).toBe(1)
  })

  it('the same reply for an unknown, used, ended and exhausted link, and for a malformed token', async () => {
    const f = fake()
    expect(await claim(f.port, { token: 'B'.repeat(43) })).toEqual(BAD) // unknown
    const h = await open(f)
    f.links.get(h)!.usedAt = true
    expect(await claim(f.port)).toEqual(BAD) // used
    f.links.get(h)!.usedAt = false; f.links.get(h)!.ended = true
    expect(await claim(f.port)).toEqual(BAD) // ended
    f.links.get(h)!.ended = false; f.links.get(h)!.attempts = 5
    expect(await claim(f.port)).toEqual(BAD) // five tries used
    expect(await claim(f.port, { token: 'short' })).toEqual(BAD)
    expect(await claim(f.port, { token: 42 })).toEqual(BAD)
    expect(await joinClaim(null, '1.1.1.1', f.port)).toEqual(BAD)
    expect(f.c.pins).toEqual([])
  })

  it('a member who already has a PIN gets taken, the link is not burned and no PIN is written', async () => {
    const f = fake({}, true); const h = await open(f)
    expect(await claim(f.port)).toEqual({ status: 409, body: { ok: false, why: 'taken' } })
    expect(f.links.get(h)!.usedAt).toBe(false)
    expect(f.c.pins).toEqual([])
  })

  it('a weak PIN is refused before the link is counted', async () => {
    const f = fake(); const h = await open(f)
    for (const pin of ['123456', '111111', '12345', 'abcdef', 135790, undefined]) expect((await claim(f.port, { pin })).body).toEqual({ ok: false, why: 'bad_pin' })
    expect(f.links.get(h)!.attempts).toBe(0)
  })

  it('the 6th claim try on one link is refused even with the right PIN, then nothing changes', async () => {
    const f = fake({ async hasSignedIn() { return false } }); const h = await open(f)
    f.port.setPin = async () => { f.c.pins.push('x'); return false } // every claim fails at the PIN write, so the link comes back each time
    for (let i = 0; i < 5; i++) expect((await claim(f.port)).status).toBe(500)
    expect(f.links.get(h)!.attempts).toBe(5)
    expect(await claim(f.port)).toEqual(BAD)
  })

  it('two claims racing for one link: the loser of use() gets bad_invite and writes no PIN', async () => {
    const f = fake({ async use() { return false } }); await open(f)
    expect(await claim(f.port)).toEqual(BAD)
    expect(f.c.pins).toEqual([])
  })

  it('a failed PIN write gives the link back and says try again', async () => {
    const f = fake({ async setPin() { return false } }); const h = await open(f)
    const r = await claim(f.port)
    expect(r.status).toBe(500)
    expect(r.body).toMatchObject({ ok: false, why: 'no_signal' })
    expect(f.links.get(h)!.usedAt).toBe(false)
    expect(f.c.released).toBe(1)
    expect(f.c.after).toBe(0)
  })

  it('10 calls an hour per address work, the 11th is 429 and touches nothing', async () => {
    const f = fake(); const h = await open(f)
    for (let i = 0; i < JOIN_IP_LIMIT; i++) await claim(f.port, { token: 'B'.repeat(43) })
    const r = await claim(f.port)
    expect(r.status).toBe(429)
    expect(f.links.get(h)!.attempts).toBe(0)
    expect(f.c.pins).toEqual([])
    expect((await claim(f.port, {}, '2.2.2.2')).status).toBe(200) // another address is not limited
  })

  it('counts under a join-scoped key, apart from login and names', async () => {
    const f = fake(); await open(f); await claim(f.port, {}, '9.9.9.9')
    expect([...f.c.keys.keys()]).toEqual([await limiterKey(PEPPER, 'ip', 'join:9.9.9.9')])
    expect([...f.c.keys.keys()][0]).not.toBe(await limiterKey(PEPPER, 'ip', 'names:9.9.9.9'))
  })

  it('the reply never carries the token, the handle, the user id or the password', async () => {
    const f = fake(); await open(f)
    const s = JSON.stringify(await claim(f.port))
    for (const secret of [TOKEN, 'nene', USER, await derivePassword(PEPPER, USER, PIN)]) expect(s).not.toContain(secret)
  })
})

function peekFake(rows: Record<string, { state: InviteState; handle: string | null; displayName: string | null }>, over: Partial<PeekPort> = {}) {
  const keys: string[] = []
  const port: PeekPort = { pepper: PEPPER, async tryKey(k) { keys.push(k); return 1 }, async peek(h) { return rows[h] ?? null }, ...over }
  return { port, keys }
}

describe('family-names ?invite=', () => {
  it('an open link returns an ARRAY of the one name (first name, initial, handle), nothing else', async () => {
    const f = peekFake({ [await tokenHash(TOKEN)]: { state: 'open', handle: 'nene', displayName: 'Nene Cruz' } })
    const r = await inviteNames(TOKEN, '1.1.1.1', f.port)
    expect(r).toEqual({ status: 200, body: [{ first_name: 'Nene', initial: 'C', handle: 'nene' }] })
    expect(Array.isArray(r.body)).toBe(true)
  })

  it('used, ended and tries are 404 with the reason; unknown and malformed are 404 bad', async () => {
    const rows = Object.fromEntries(await Promise.all((['used', 'ended', 'tries'] as const).map(async (s, i) => [await tokenHash(String(i).repeat(43)), { state: s, handle: null, displayName: null }] as const)))
    const f = peekFake(rows)
    expect(await inviteNames('0'.repeat(43), '1.1.1.1', f.port)).toEqual({ status: 404, body: { ok: false, why: 'used' } })
    expect(await inviteNames('1'.repeat(43), '1.1.1.1', f.port)).toEqual({ status: 404, body: { ok: false, why: 'ended' } })
    expect(await inviteNames('2'.repeat(43), '1.1.1.1', f.port)).toEqual({ status: 404, body: { ok: false, why: 'tries' } })
    expect(await inviteNames('9'.repeat(43), '1.1.1.1', f.port)).toEqual({ status: 404, body: { ok: false, why: 'bad' } })
    expect(await inviteNames('no', '1.1.1.1', f.port)).toEqual({ status: 404, body: { ok: false, why: 'bad' } })
  })

  it('an open row with no name is 404, never an empty name', async () => {
    const f = peekFake({ [await tokenHash(TOKEN)]: { state: 'open', handle: 'nene', displayName: '  ' } })
    expect((await inviteNames(TOKEN, '1.1.1.1', f.port)).status).toBe(404)
  })

  it('is limited per address under the invite key and a limited call never reads the link', async () => {
    let read = false
    const f = peekFake({}, { tryKey: async () => INVITE_PEEK_LIMIT + 1, async peek() { read = true; return null } })
    expect((await inviteNames(TOKEN, '1.1.1.1', f.port)).status).toBe(429)
    expect(read).toBe(false)
    const g = peekFake({}); await inviteNames(TOKEN, '7.7.7.7', g.port)
    expect(g.keys).toEqual([await limiterKey(PEPPER, 'ip', 'invite:7.7.7.7')])
  })
})

describe('index.ts wiring (source guard, ML-30)', () => {
  const pin = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  const names = readFileSync(new URL('../family-names/index.ts', import.meta.url), 'utf8')
  it('pin-login dispatches join_claim to joinClaim with the check/use rpc names, and nothing chains .catch on a builder', () => {
    expect(pin).toMatch(/action === 'join_claim'[\s\S]{0,120}joinClaim\(body, ip, join\)/)
    expect(pin).toContain("rpc('join_claim_check', { p_hash: hash })")
    expect(pin).toContain("rpc('join_claim_use', { p_hash: hash })")
    expect(pin).not.toMatch(/\.rpc\([^)]*\)[^;\n]*\.(catch|finally)\(/)
  })
  it('family-names reads join_claim_peek and no longer knows the static invite secret', () => {
    expect(names).toContain("rpc('join_claim_peek', { p_hash: hash })")
    expect(names).not.toContain('FAMILY_INVITE_TOKEN')
    expect(names).not.toContain('safeEqual')
  })
})
