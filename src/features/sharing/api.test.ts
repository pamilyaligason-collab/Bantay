import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn(), on: true }))
vi.mock('../auth/client', () => ({ get supabase() { return h.on ? { rpc: h.rpc } : null } }))
import { countViewers, failureOf, personViewers, setShare, SHARE_COPY, shareCandidatesFor, shareCopy, shareCounts } from './api'

const P = 'person-1'
const C = 'carer-1'
beforeEach(() => { h.on = true; h.rpc.mockReset() })

describe('failureOf: RPC errors map to three plain copy strings', () => {
  it('42501 and 22023 are refused, 53400 is the hourly limit, anything else is offline', () => {
    expect(failureOf({ code: '42501' })).toBe('refused')
    expect(failureOf({ code: '22023' })).toBe('refused')
    expect(failureOf({ code: '53400' })).toBe('limit')
    expect(failureOf({ code: '' })).toBe('offline')
    expect(failureOf({ code: 'PGRST301' })).toBe('offline')
    expect(failureOf(null)).toBe('offline')
  })
  it('the three strings are fixed and distinct', () => {
    expect(shareCopy('offline')).toBe('No signal. Try again when you are online.')
    expect(shareCopy('refused')).toBe('You cannot change that.')
    expect(shareCopy('limit')).toBe('You changed sharing a lot. Try again in an hour.')
    expect(new Set(Object.values(SHARE_COPY)).size).toBe(3)
    for (const t of Object.values(SHARE_COPY)) expect(t).not.toMatch(/—|–/) // no em or en dashes in user copy
  })
})

describe('setShare', () => {
  it('calls share_set with the contract argument names and returns the server word', async () => {
    h.rpc.mockResolvedValue({ data: 'added', error: null })
    expect(await setShare(P, C, true)).toBe('added')
    expect(h.rpc).toHaveBeenCalledWith('share_set', { p_person: P, p_carer: C, p_can_write: false, p_on: true })
    h.rpc.mockResolvedValue({ data: 'removed', error: null })
    expect(await setShare(P, C, false)).toBe('removed')
    expect(h.rpc).toHaveBeenLastCalledWith('share_set', { p_person: P, p_carer: C, p_can_write: false, p_on: false })
    h.rpc.mockResolvedValue({ data: 'updated', error: null })
    expect(await setShare(P, C, true, true)).toBe('updated')
    h.rpc.mockResolvedValue({ data: 'unchanged', error: null })
    expect(await setShare(P, C, true, true)).toBe('unchanged')
    expect(h.rpc).toHaveBeenLastCalledWith('share_set', { p_person: P, p_carer: C, p_can_write: true, p_on: true })
  })
  it('maps refusals, the limit, a network error and no client', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not allowed' } })
    expect(await setShare(P, C, true)).toBe('refused')
    h.rpc.mockResolvedValue({ data: null, error: { code: '53400', message: 'too many changes' } })
    expect(await setShare(P, C, true)).toBe('limit')
    h.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    expect(await setShare(P, C, true)).toBe('offline')
    h.rpc.mockRejectedValue(new Error('boom'))
    expect(await setShare(P, C, true)).toBe('offline')
    h.on = false
    expect(await setShare(P, C, true)).toBe('offline')
  })
})

describe('setShare words', () => {
  it('a stale server that still says pending reads as unchanged, never as a state the screens no longer draw', async () => {
    h.rpc.mockResolvedValue({ data: 'pending', error: null })
    expect(await setShare(P, C, true)).toBe('unchanged')
  })
})

describe('personViewers, shareCandidatesFor and shareCounts keep unknown apart from none (ML-05)', () => {
  it('personViewers asks person_viewers for that person and maps rows; null on error', async () => {
    h.rpc.mockResolvedValue({ data: [{ carer_user_id: 'u1', display_name: 'Ate Joy', can_write: false, pending: false, added_by_admin: true, added_at: '2026-10-25T01:00:00Z' }], error: null })
    expect(await personViewers(P)).toEqual([{ carerUserId: 'u1', displayName: 'Ate Joy', canWrite: false, addedByAdmin: true, addedAt: '2026-10-25T01:00:00Z' }])
    expect(h.rpc).toHaveBeenCalledWith('person_viewers', { p_person: P })
    h.rpc.mockResolvedValue({ data: [], error: null })
    expect(await personViewers(P)).toEqual([])
    h.rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    expect(await personViewers(P)).toBeNull()
    h.rpc.mockRejectedValue(new Error('boom'))
    expect(await personViewers(P)).toBeNull()
    h.on = false
    expect(await personViewers(P)).toBeNull()
  })
  it('shareCandidatesFor asks share_candidates for that person and maps rows; null on error', async () => {
    h.rpc.mockResolvedValue({ data: [{ carer_user_id: 'u2', person_id: 'p2', display_name: 'Rhea' }], error: null })
    expect(await shareCandidatesFor(P)).toEqual([{ carerUserId: 'u2', personId: 'p2', displayName: 'Rhea' }])
    expect(h.rpc).toHaveBeenCalledWith('share_candidates', { p_person: P })
    h.rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    expect(await shareCandidatesFor(P)).toBeNull()
  })
  it("a server refusal (42501, 22023) is 'refused', not null; any other error stays null", async () => {
    for (const code of ['42501', '22023']) {
      h.rpc.mockResolvedValue({ data: null, error: { code, message: 'no' } })
      expect(await personViewers(P)).toBe('refused')
      expect(await shareCandidatesFor(P)).toBe('refused')
    }
    h.rpc.mockResolvedValue({ data: null, error: { code: '53400', message: 'slow' } })
    expect(await personViewers(P)).toBeNull()
    expect(await shareCandidatesFor(P)).toBeNull()
  })
  it("countViewers leaves out the owner's own rows, so a person whose only link is the owner reads as none (live-shaped: the owner is the writer carer of several no-login people)", () => {
    const OWNER = 'u-rey'
    const rows = [
      { person_id: 'lola', carer_user_id: OWNER, can_write: true }, { person_id: 'lolo', carer_user_id: OWNER, can_write: true }, { person_id: 'baby', carer_user_id: OWNER, can_write: true },
      { person_id: 'baby', carer_user_id: 'u-joy', can_write: false },
      { person_id: 'ma', carer_user_id: OWNER }, { person_id: 'ma', carer_user_id: 'u-joy' }, { person_id: 'ma', carer_user_id: 'u-ben' },
      { person_id: 'tita', carer_user_id: 'u-joy', pending: true }
    ]
    expect(countViewers(rows, OWNER)).toEqual(new Map([['baby', 1], ['ma', 2]]))
    expect(countViewers(rows, OWNER).get('lola') ?? 0).toBe(0) // rendered as "Only you"
    expect(countViewers(rows, null).get('lola')).toBe(1) // owner unknown: nothing is dropped
  })
  it('shareCounts passes the owner id through to the selector', async () => {
    h.rpc.mockResolvedValue({ data: [{ person_id: 'a', carer_user_id: 'o' }, { person_id: 'a', carer_user_id: 'x' }], error: null })
    expect(await shareCounts('o')).toEqual(new Map([['a', 1]]))
  })
  it('shareCounts counts links per person from admin_share_grid, a leftover pending offer is not a link; null on error', async () => {
    h.rpc.mockResolvedValue({ data: [{ person_id: 'a' }, { person_id: 'a', pending: false }, { person_id: 'b' }, { person_id: 'c', pending: true }], error: null })
    expect(await shareCounts()).toEqual(new Map([['a', 2], ['b', 1]]))
    expect(h.rpc).toHaveBeenCalledWith('admin_share_grid')
    h.rpc.mockResolvedValue({ data: [], error: null })
    expect((await shareCounts())!.size).toBe(0)
    h.rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    expect(await shareCounts()).toBeNull()
  })
})
