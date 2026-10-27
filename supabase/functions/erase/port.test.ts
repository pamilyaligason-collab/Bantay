// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { erasedEmail, runErase } from './logic.ts'
import { makePort, type AdminLike } from './port.ts'

const ID = '00000000-0000-0000-0000-0000000000b1'
/** A mocked service-role client that records every call in order and fails the ones named in `fail`. */
function mock(fail: string[] = [], dueRows: unknown[] = [{ user_id: ID, erased: false }]) {
  const calls: string[] = []
  const attrs: Record<string, unknown>[] = []
  const res = (name: string, data: unknown = null) => { calls.push(name); return Promise.resolve({ data, error: fail.includes(name) ? { message: 'x' } : null }) }
  const admin: AdminLike = {
    rpc: (fn) => res(fn, fn === 'erasure_due' ? dueRows : fn === 'erasure_paths' ? [] : null),
    storage: { from: () => ({ remove: () => res('remove') }) },
    auth: { admin: { updateUserById: (_id, a) => { attrs.push(a); return res('ban_duration' in a ? 'ban' : 'scrub_email') } } }
  }
  return { admin, calls, attrs }
}

describe('erase port with a mocked admin client', () => {
  it('after erase_user_data: revoke sessions, ban, drop identities, then scrub the email to the synthetic value', async () => {
    const m = mock()
    expect(await runErase(makePort(m.admin))).toEqual({ due: 1, erased: 1, failed: 0 })
    expect(m.calls).toEqual(['erasure_due', 'erasure_paths', 'erase_user_data', 'revoke_sessions', 'ban', 'erasure_scrub_identities', 'scrub_email'])
    expect(m.attrs[0]).toEqual({ ban_duration: '876000h' })
    expect(m.attrs[1]).toMatchObject({ email: `erased-${ID}@members.bantay.invalid`, user_metadata: {} })
    expect(erasedEmail(ID)).toBe(`erased-${ID}@members.bantay.invalid`)
  })
  it.each(['revoke_sessions', 'ban', 'erasure_scrub_identities', 'scrub_email'])('a failing %s step is reported as failed and stops the later steps', async (step) => {
    const m = mock([step])
    expect(await runErase(makePort(m.admin))).toEqual({ due: 1, erased: 0, failed: 1 })
    const order = ['revoke_sessions', 'ban', 'erasure_scrub_identities', 'scrub_email']
    expect(m.calls.slice(m.calls.indexOf('revoke_sessions'))).toEqual(order.slice(0, order.indexOf(step) + 1))
  })
  it('a failing erase_user_data never reaches the auth steps', async () => {
    const m = mock(['erase_user_data'])
    expect(await runErase(makePort(m.admin))).toEqual({ due: 1, erased: 0, failed: 1 })
    expect(m.calls).not.toContain('revoke_sessions')
  })
  it('a row marked erased skips the data steps and retries only the auth lock', async () => {
    const m = mock([], [{ user_id: ID, erased: true }])
    expect(await runErase(makePort(m.admin))).toEqual({ due: 1, erased: 1, failed: 0 })
    expect(m.calls).toEqual(['erasure_due', 'revoke_sessions', 'ban', 'erasure_scrub_identities', 'scrub_email'])
  })
})
