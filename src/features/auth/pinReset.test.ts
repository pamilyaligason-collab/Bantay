import { afterEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ supabase: { rpc }, supabaseUrl: 'https://x.test', supabasePublishableKey: 'sb_publishable_test' }))
import { approveReset, completeReset, failOf, resetStep, startReset, type ResetState, type ResetStart } from './pinReset'

afterEach(() => { vi.unstubAllGlobals(); rpc.mockReset() })
const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => ({ status, json: async () => body })))
const START: ResetStart = { id: 'r1', secret: 's'.repeat(32), code: '4821' }
const waiting: ResetState = { s: 'waiting', start: START, pin: '246810' }

describe('resetStep (the reset client state machine)', () => {
  it('idle -> starting -> waiting, holding the new PIN and the request', () => {
    let st: ResetState = { s: 'idle' }
    st = resetStep(st, { t: 'begin', pin: '246810' })
    expect(st).toEqual({ s: 'starting', pin: '246810' })
    st = resetStep(st, { t: 'started', start: START })
    expect(st).toEqual(waiting)
  })
  it('a start that fails ends in failed with the reason; a retry begins again', () => {
    let st = resetStep(resetStep({ s: 'idle' }, { t: 'begin', pin: '246810' }), { t: 'start_failed', why: 'rate_limited' })
    expect(st).toEqual({ s: 'failed', why: 'rate_limited' })
    st = resetStep(st, { t: 'begin', pin: '135790' })
    expect(st).toEqual({ s: 'starting', pin: '135790' })
  })
  it('not approved yet and no signal keep waiting (same object, so the poll timer re-arms only after an answer)', () => {
    expect(resetStep(waiting, { t: 'poll', result: { ok: false, why: 'not_approved' } })).toBe(waiting)
    expect(resetStep(waiting, { t: 'poll', result: { ok: false, why: 'no_signal' } })).toBe(waiting)
  })
  it('approved ends in done and drops the PIN', () => {
    expect(resetStep(waiting, { t: 'poll', result: { ok: true } })).toEqual({ s: 'done' })
  })
  it.each(['expired', 'used', 'bad_secret', 'bad_pin', 'rate_limited', 'server'] as const)('%s ends the request (a dead request never polls forever)', (why) => {
    expect(resetStep(waiting, { t: 'poll', result: { ok: false, why } })).toEqual({ s: 'failed', why })
  })
  it('cancel returns to idle; a late poll after cancel or done changes nothing', () => {
    expect(resetStep(waiting, { t: 'cancel' })).toEqual({ s: 'idle' })
    expect(resetStep({ s: 'idle' }, { t: 'poll', result: { ok: true } })).toEqual({ s: 'idle' })
    expect(resetStep({ s: 'done' }, { t: 'poll', result: { ok: false, why: 'expired' } })).toEqual({ s: 'done' })
  })
  it('begin while waiting is ignored (one open request per phone)', () => {
    expect(resetStep(waiting, { t: 'begin', pin: '111111' })).toBe(waiting)
  })
})

describe('failOf maps the server codes', () => {
  it.each([
    [429, {}, 'rate_limited'],
    [400, { error: 'not_approved' }, 'not_approved'],
    [400, { error: 'expired' }, 'expired'],
    [400, { error: 'already_used' }, 'used'],
    [400, { error: 'bad_secret' }, 'bad_secret'],
    [400, { error: 'bad_pin' }, 'bad_pin'],
    [500, { error: 'boom' }, 'server']
  ] as const)('%s %j -> %s', (status, body, want) => {
    expect(failOf({ status, body: body as Record<string, unknown> })).toBe(want)
  })
})

describe('startReset', () => {
  it('returns id, secret and the 4-digit code; sends the lower-cased handle and method family', async () => {
    reply(200, { ok: true, id: 'r1', secret: START.secret, code: '4821' })
    expect(await startReset('  Mama ', 'family')).toEqual({ ok: true, start: START })
    const call = vi.mocked(fetch).mock.calls[0]!
    expect(String(call[0])).toBe('https://x.test/functions/v1/pin-login')
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ action: 'reset_start', handle: 'mama', method: 'family' })
  })
  it('a code that is not 4 digits is not accepted', async () => {
    reply(200, { ok: true, id: 'r1', secret: 'x', code: '47' })
    expect(await startReset('mama')).toEqual({ ok: false, why: 'server' })
  })
  it('429 is rate_limited; a network failure is no_signal', async () => {
    reply(429, { ok: false })
    expect(await startReset('mama')).toEqual({ ok: false, why: 'rate_limited' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await startReset('mama')).toEqual({ ok: false, why: 'no_signal' })
  })
})

describe('completeReset', () => {
  it('sends id, secret and new_pin; ok only on ok:true', async () => {
    reply(200, { ok: true })
    expect(await completeReset(START, '246810')).toEqual({ ok: true })
    expect(JSON.parse(String((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body))).toEqual({ action: 'reset_complete', id: 'r1', secret: START.secret, new_pin: '246810' })
    reply(200, { ok: false })
    expect(await completeReset(START, '246810')).toMatchObject({ ok: false })
  })
  it('not approved is its own answer', async () => {
    reply(409, { ok: false, error: 'not_approved' })
    expect(await completeReset(START, '246810')).toEqual({ ok: false, why: 'not_approved' })
  })
})

describe('approveReset', () => {
  it('true is approved; false is refused (wrong code, burned, requester, not family)', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await approveReset('r1', '4821')).toBe('approved')
    expect(rpc).toHaveBeenCalledWith('approve_pin_reset', { p_id: 'r1', p_code: '4821' })
    rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await approveReset('r1', '0000')).toBe('refused')
  })
  it('a code that is not 4 digits never reaches the server', async () => {
    expect(await approveReset('r1', '482')).toBe('refused')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('an error with no code is no signal; one with a code is refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
    expect(await approveReset('r1', '4821')).toBe('no_signal')
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } })
    expect(await approveReset('r1', '4821')).toBe('refused')
  })
})
