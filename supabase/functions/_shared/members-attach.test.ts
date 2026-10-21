// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { runAction, type Port } from './members.ts'

const UID = '11111111-1111-4111-8111-111111111111'
const ADMIN = '22222222-2222-4222-8222-222222222222'
const PID = '33333333-3333-4333-8333-333333333333'
const body = { action: 'create', displayName: 'Test Child', pin: '480193', role: 'member', personId: PID }

function port(over: Partial<Port> = {}): Port {
  return {
    pepper: 'pep',
    createAuthUser: vi.fn(async () => UID),
    deleteAuthUser: vi.fn(async () => {}),
    setPassword: vi.fn(async () => true),
    insertRole: vi.fn(async () => 'ok' as const),
    insertPerson: vi.fn(async () => 'new-person'),
    getPersonLogin: vi.fn(async () => ({ authUserId: null, displayName: 'Test Child' })),
    attachPerson: vi.fn(async () => 'ok' as const),
    ...over
  } as unknown as Port
}

describe('admin-members create with personId', () => {
  it('attaches the login to the existing person and makes no new people row', async () => {
    const p = port()
    expect(await runAction(body, p, ADMIN)).toEqual({ ok: true, userId: UID, personId: PID })
    expect(p.attachPerson).toHaveBeenCalledWith(PID, UID)
    expect(p.insertPerson).not.toHaveBeenCalled()
    expect(p.deleteAuthUser).not.toHaveBeenCalled()
  })
  it('a person who already has a login is bad_input and no auth user is made', async () => {
    const p = port({ getPersonLogin: vi.fn(async () => ({ authUserId: ADMIN, displayName: 'x' })) })
    expect(await runAction(body, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
    expect(p.createAuthUser).not.toHaveBeenCalled()
  })
  it('a missing person is not_found and no auth user is made', async () => {
    const p = port({ getPersonLogin: vi.fn(async () => null) })
    expect(await runAction(body, p, ADMIN)).toEqual({ ok: false, error: 'not_found' })
    expect(p.createAuthUser).not.toHaveBeenCalled()
  })
  it('a personId that is not a uuid is bad_input', async () => {
    const p = port()
    expect(await runAction({ ...body, personId: 'nope' }, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
    expect(p.createAuthUser).not.toHaveBeenCalled()
  })
  it('an attach failure deletes the auth user', async () => {
    const p = port({ attachPerson: vi.fn(async () => 'error' as const) })
    expect(await runAction(body, p, ADMIN)).toEqual({ ok: false, error: 'bad_input' })
    expect(p.deleteAuthUser).toHaveBeenCalledWith(UID)
  })
  it('a lost race (person already taken) is not_found and deletes the auth user', async () => {
    const p = port({ attachPerson: vi.fn(async () => 'not_found' as const) })
    expect(await runAction(body, p, ADMIN)).toEqual({ ok: false, error: 'not_found' })
    expect(p.deleteAuthUser).toHaveBeenCalledWith(UID)
  })
  it('without personId the old path runs', async () => {
    const { personId: _p, ...plain } = body
    const p = port()
    expect(await runAction(plain, p, ADMIN)).toEqual({ ok: true, userId: UID, personId: 'new-person' })
    expect(p.getPersonLogin).not.toHaveBeenCalled()
    expect(p.attachPerson).not.toHaveBeenCalled()
  })
})
