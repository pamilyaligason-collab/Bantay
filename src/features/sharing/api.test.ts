import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), member: vi.fn(), on: true }))
vi.mock('../auth/client', () => ({ get supabase() { return h.on ? { rpc: h.rpc, from: h.from } : null } }))
vi.mock('../auth/session', () => ({ getMember: h.member }))
import { acceptShare, answerShare, failureOf, myViewers, pendingOffers, setShare, SHARE_COPY, shareCandidates, shareCopy } from './api'

const P = 'person-1'
const C = 'carer-1'
beforeEach(() => { h.on = true; h.rpc.mockReset(); h.from.mockReset(); h.member.mockReset().mockResolvedValue({ userId: 'me' }) })

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
    h.rpc.mockResolvedValue({ data: 'pending', error: null })
    expect(await setShare(P, C, true)).toBe('pending')
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

describe('acceptShare', () => {
  it('true only when the server answered an offer', async () => {
    h.rpc.mockResolvedValue({ data: true, error: null })
    expect(await acceptShare(P, true)).toBe(true)
    expect(h.rpc).toHaveBeenCalledWith('share_accept', { p_person: P, p_accept: true })
    h.rpc.mockResolvedValue({ data: false, error: null })
    expect(await acceptShare(P, false)).toBe(false)
    h.rpc.mockResolvedValue({ data: null, error: { code: '53400', message: 'x' } })
    expect(await acceptShare(P, true)).toBe(false)
  })
  it('answerShare tells no offer, a refusal, the limit and no signal apart', async () => {
    h.rpc.mockResolvedValue({ data: true, error: null })
    expect(await answerShare(P, true)).toBe('ok')
    h.rpc.mockResolvedValue({ data: false, error: null })
    expect(await answerShare(P, true)).toBe('none')
    h.rpc.mockResolvedValue({ data: null, error: { code: '53400', message: 'x' } })
    expect(await answerShare(P, true)).toBe('limit')
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'x' } })
    expect(await answerShare(P, true)).toBe('refused')
    h.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    expect(await answerShare(P, true)).toBe('offline')
  })
})

describe('myViewers, shareCandidates and pendingOffers keep unknown apart from none (ML-05)', () => {
  it('myViewers maps rows to the Viewer shape; null on error', async () => {
    h.rpc.mockResolvedValue({ data: [{ carer_user_id: 'u1', display_name: 'Ate Joy', can_write: false, pending: false, added_by_admin: true, added_at: '2026-10-25T01:00:00Z' }], error: null })
    expect(await myViewers()).toEqual([{ carerUserId: 'u1', displayName: 'Ate Joy', canWrite: false, pending: false, addedByAdmin: true, addedAt: '2026-10-25T01:00:00Z' }])
    h.rpc.mockResolvedValue({ data: [], error: null })
    expect(await myViewers()).toEqual([])
    h.rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    expect(await myViewers()).toBeNull()
    h.on = false
    expect(await myViewers()).toBeNull()
  })
  it('shareCandidates maps rows; null on error', async () => {
    h.rpc.mockResolvedValue({ data: [{ carer_user_id: 'u2', person_id: 'p2', display_name: 'Rhea' }], error: null })
    expect(await shareCandidates()).toEqual([{ carerUserId: 'u2', personId: 'p2', displayName: 'Rhea' }])
    h.rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    expect(await shareCandidates()).toBeNull()
  })
  it('pendingOffers reads only my own offers (carer_id = me), newest first', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ person_id: 'p1', can_write: true, added_at: '2026-10-25T01:00:00Z' }], error: null })
    const eq = vi.fn().mockReturnValue({ order })
    h.from.mockReturnValue({ select: () => ({ eq }) })
    expect(await pendingOffers()).toEqual([{ personId: 'p1', canWrite: true, addedAt: '2026-10-25T01:00:00Z' }])
    expect(h.from).toHaveBeenCalledWith('share_offers')
    expect(eq).toHaveBeenCalledWith('carer_id', 'me')
    h.member.mockResolvedValue(null)
    expect(await pendingOffers()).toBeNull()
  })
})
