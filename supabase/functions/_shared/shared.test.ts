// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { corsHeaders } from './http.ts'
import { HANDLE_LIMIT, attemptLogin, type LoginPort } from './login.ts'
import { runAction, type Member, type Port } from './members.ts'
import { derivePassword, limiterKey, normalizeEmail, normalizeHandle, validatePin } from './pin.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const ADMIN = '22222222-2222-4222-8222-222222222222'

describe('validatePin', () => {
  it('accepts a normal 6 digit PIN', () => expect(validatePin('480193')).toBe(true))
  it.each(['12345', '1234567', '12345a', '', '111111', '000000', '123456', ' 48019', 480193, null, undefined])('rejects %s', (p) => expect(validatePin(p)).toBe(false))
})

describe('handles and emails', () => {
  it('normalizes handle', () => expect(normalizeHandle('  Lola_7 ')).toBe('lola_7'))
  it.each(['ab', '7lola', 'lo la', 'a'.repeat(21), '', null, 5])('rejects handle %s', (h) => expect(normalizeHandle(h)).toBeNull())
  it('normalizes email', () => expect(normalizeEmail(' A@B.com ')).toBe('a@b.com'))
  it('refuses a synthetic member address as an invite', () => expect(normalizeEmail('m-x@members.bantay.invalid')).toBeNull())
  it('refuses junk email', () => expect(normalizeEmail('nope')).toBeNull())
})

describe('derivePassword', () => {
  it('equals base64url(HMAC-SHA256(pepper, userId:pin)) (vector made with Node crypto)', async () => {
    expect(await derivePassword('pep', ID, '480193')).toBe('mNYyL-j6OyVFJJUNiaPT0tfLPwYx5dguroNQzJSpjVo')
  })
  it('changes with pepper, user and pin', async () => {
    const a = await derivePassword('pep', ID, '480193')
    expect(new Set([a, await derivePassword('pep2', ID, '480193'), await derivePassword('pep', ADMIN, '480193'), await derivePassword('pep', ID, '480194')]).size).toBe(4)
  })
  it('limiterKey is uuid-shaped, stable and scoped', async () => {
    const k = await limiterKey('pep', 'ip', '1.2.3.4')
    expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(await limiterKey('pep', 'ip', '1.2.3.4')).toBe(k)
    expect(await limiterKey('pep', 'handle', '1.2.3.4')).not.toBe(k)
  })
})

describe('cors', () => {
  it('allows only the configured origin', () => {
    expect(corsHeaders('https://app.test', 'https://app.test')['Access-Control-Allow-Origin']).toBe('https://app.test')
    expect(corsHeaders('https://app.test', 'https://evil.test')['Access-Control-Allow-Origin']).toBeUndefined()
    expect(corsHeaders(undefined, 'https://app.test')['Access-Control-Allow-Origin']).toBeUndefined()
  })
})

function mockPort(over: Partial<Port> = {}): Port & { calls: string[] } {
  const calls: string[] = []
  const rec = <T>(name: string, v: T) => vi.fn(async (..._a: unknown[]) => { calls.push(name); return v })
  return Object.assign({
    pepper: 'pep',
    createAuthUser: rec<string | null>('createAuthUser', ID),
    deleteAuthUser: rec<void>('deleteAuthUser', undefined),
    getAuthEmail: rec<string | null>('getAuthEmail', 'm-abc@members.bantay.invalid'),
    setPassword: rec('setPassword', true),
    setBanned: rec('setBanned', true),
    insertRole: rec<'ok' | 'handle_taken' | 'error'>('insertRole', 'ok'),
    updateRole: rec<'ok' | 'handle_taken' | 'not_found'>('updateRole', 'ok'),
    insertPerson: rec<string | null>('insertPerson', 'person-1'),
    addInvite: rec('addInvite', true),
    removeInvite: rec('removeInvite', true),
    listMembers: rec<Member[]>('listMembers', [{ userId: ID, personId: 'p', displayName: 'Lola', handle: 'lola', role: 'member', disabled: false, lastSignInAt: null, provider: 'email' }]),
    calls
  }, over) as Port & { calls: string[] }
}

describe('admin-members dispatcher', () => {
  const create = { action: 'create', displayName: 'Lola', handle: 'Lola', pin: '480193', role: 'member' }

  it('create makes user, role, password, person in order', async () => {
    const p = mockPort()
    expect(await runAction(create, p, ADMIN)).toEqual({ ok: true, userId: ID, personId: 'person-1' })
    expect(p.calls).toEqual(['createAuthUser', 'insertRole', 'setPassword', 'insertPerson'])
    expect(p.setPassword).toHaveBeenCalledWith(ID, await derivePassword('pep', ID, '480193'))
    expect(p.insertPerson).toHaveBeenCalledWith(ID, 'Lola', ADMIN)
    expect(p.insertRole).toHaveBeenCalledWith(ID, 'member', 'lola')
  })
  it('create rejects weak PIN and bad handle before touching auth', async () => {
    const p = mockPort()
    expect(await runAction({ ...create, pin: '123456' }, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
    expect(await runAction({ ...create, handle: 'x' }, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
    expect(await runAction({ ...create, role: 'root' }, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
    expect(p.calls).toEqual([])
  })
  it('create rolls back the auth user when the handle is taken', async () => {
    const p = mockPort({ insertRole: vi.fn(async () => 'handle_taken' as const) })
    expect(await runAction(create, p, ADMIN)).toEqual({ ok: false, error: 'handle_taken' })
    expect(p.deleteAuthUser).toHaveBeenCalledWith(ID)
  })
  it('create rolls back when the person row fails', async () => {
    const p = mockPort({ insertPerson: vi.fn(async () => null) })
    expect(await runAction(create, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
    expect(p.deleteAuthUser).toHaveBeenCalledWith(ID)
  })
  it('set_pin derives the password for that user', async () => {
    const p = mockPort()
    expect(await runAction({ action: 'set_pin', userId: ID, pin: '908172' }, p, ADMIN)).toEqual({ ok: true })
    expect(p.setPassword).toHaveBeenCalledWith(ID, await derivePassword('pep', ID, '908172'))
  })
  it('set_pin refuses Google members and unknown users', async () => {
    expect(await runAction({ action: 'set_pin', userId: ID, pin: '908172' }, mockPort({ getAuthEmail: vi.fn(async () => 'a@gmail.com') }), ADMIN)).toEqual({ ok: false, error: 'bad_input' })
    expect(await runAction({ action: 'set_pin', userId: ID, pin: '908172' }, mockPort({ getAuthEmail: vi.fn(async () => null) }), ADMIN)).toEqual({ ok: false, error: 'not_found' })
  })
  it('set_handle maps taken and missing', async () => {
    expect(await runAction({ action: 'set_handle', userId: ID, handle: 'Nana' }, mockPort({ updateRole: vi.fn(async () => 'handle_taken' as const) }), ADMIN)).toEqual({ ok: false, error: 'handle_taken' })
    expect(await runAction({ action: 'set_handle', userId: ID, handle: 'nana' }, mockPort({ updateRole: vi.fn(async () => 'not_found' as const) }), ADMIN)).toEqual({ ok: false, error: 'not_found' })
  })
  it('set_role works, but not on yourself', async () => {
    const p = mockPort()
    expect(await runAction({ action: 'set_role', userId: ID, role: 'admin' }, p, ADMIN)).toEqual({ ok: true })
    expect(p.updateRole).toHaveBeenCalledWith(ID, { role: 'admin' })
    expect(await runAction({ action: 'set_role', userId: ADMIN, role: 'member' }, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
  })
  it('disable flips the role flag and the auth ban, but not on yourself', async () => {
    const p = mockPort()
    expect(await runAction({ action: 'disable', userId: ID, disabled: true }, p, ADMIN)).toEqual({ ok: true })
    expect(p.setBanned).toHaveBeenCalledWith(ID, true)
    expect(await runAction({ action: 'disable', userId: ADMIN, disabled: true }, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
  })
  it('invite and uninvite lowercase the email', async () => {
    const p = mockPort()
    expect(await runAction({ action: 'invite', email: ' Kid@Gmail.com ' }, p, ADMIN)).toEqual({ ok: true })
    expect(p.addInvite).toHaveBeenCalledWith('kid@gmail.com', ADMIN)
    expect(await runAction({ action: 'uninvite', email: 'Kid@Gmail.com' }, p, ADMIN)).toEqual({ ok: true })
    expect(p.removeInvite).toHaveBeenCalledWith('kid@gmail.com')
    expect(await runAction({ action: 'invite', email: 'nope' }, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
  })
  it('list returns members', async () => {
    const r = await runAction({ action: 'list' }, mockPort(), ADMIN)
    expect(r.ok && (r.members as Member[])[0].handle).toBe('lola')
  })
  it('unknown action and non-object are bad_input', async () => {
    expect(await runAction({ action: 'drop' }, mockPort(), ADMIN)).toEqual({ ok: false, error: 'bad_input' })
    expect(await runAction('x', mockPort(), ADMIN)).toEqual({ ok: false, error: 'bad_input' })
  })
})

describe('pin-login attemptLogin', () => {
  const session = { access_token: 'a', refresh_token: 'r', expires_in: 3600, token_type: 'bearer' }
  function port(over: Partial<LoginPort> = {}) {
    const counts = new Map<string, number>()
    const signIn = vi.fn(async (_e: string, pw: string) => (pw === good ? session : null))
    return Object.assign({
      pepper: 'pep',
      tryKey: vi.fn(async (k: string) => { counts.set(k, (counts.get(k) ?? 0) + 1); return counts.get(k)! }),
      clearKey: vi.fn(async (k: string) => { counts.delete(k) }),
      findUser: vi.fn(async (h: string) => (h === 'lola' ? { userId: ID, email: 'm-1@members.bantay.invalid', disabled: false } : null)),
      signIn,
      counts
    }, over)
  }
  let good = ''
  const run = async (p: ReturnType<typeof port>, pin: string, handle = 'lola', ip = '1.1.1.1') => {
    good = await derivePassword('pep', ID, '480193')
    return attemptLogin({ handle, pin }, ip, p)
  }

  it('right PIN returns a session', async () => {
    const r = await run(port(), '480193')
    expect(r.status).toBe(200)
    expect(r.body.ok && r.body.session.access_token).toBe('a')
  })
  it('wrong PIN, unknown handle, bad shape and disabled all give the identical body', async () => {
    const bodies = [
      (await run(port(), '000001')).body,
      (await run(port(), '480193', 'ghost')).body,
      (await run(port(), 'abc')).body,
      (await run(port({ findUser: vi.fn(async () => ({ userId: ID, email: 'e', disabled: true })) }), '480193')).body
    ]
    for (const b of bodies) expect(b).toEqual({ ok: false, error: 'bad_credentials', message: 'Handle or PIN is not right' })
  })
  it('locks after 5 wrong PINs even when the 6th is right, and locks unknown handles the same way', async () => {
    const p = port()
    for (let i = 0; i < HANDLE_LIMIT; i++) expect((await run(p, '000001')).status).toBe(401)
    const locked = await run(p, '480193')
    expect(locked.status).toBe(401)
    expect(locked.body.ok).toBe(false)
    expect(p.signIn).toHaveBeenCalledTimes(HANDLE_LIMIT) // the locked attempt never reached sign-in
    const q = port()
    for (let i = 0; i < 8; i++) await run(q, '000001', 'ghost')
    expect(q.signIn).toHaveBeenCalledTimes(HANDLE_LIMIT)
  })
  it('success resets the handle counter', async () => {
    const p = port()
    for (let i = 0; i < 4; i++) await run(p, '000001')
    expect((await run(p, '480193')).status).toBe(200)
    expect(p.clearKey).toHaveBeenCalledWith(ID)
    for (let i = 0; i < 4; i++) expect((await run(p, '000001')).status).toBe(401)
    expect((await run(p, '480193')).status).toBe(200)
  })
  it('per-IP limit stops one address spraying many handles (429, same body)', async () => {
    const p = port()
    let last = await run(p, '000001', 'ghost1')
    for (let i = 2; i <= 31; i++) last = await run(p, '000001', `ghost${i}`)
    expect(last.status).toBe(429)
    expect(last.body).toEqual({ ok: false, error: 'bad_credentials', message: 'Handle or PIN is not right' })
  })
})
