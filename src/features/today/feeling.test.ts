import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ self: 'p1' as string | null, rpc: vi.fn(), moods: [] as string[], checkins: 0 }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => h.self }))
vi.mock('../auth/client', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }))
vi.mock('../admin/events', () => ({ track: async () => undefined }))
vi.mock('../log/store', () => ({ logActivity: async (a: { kind: string }) => { if (a.kind === 'check-in') h.checkins++; else h.moods.push(a.kind) } }))
import { FEELINGS, feelingToast, logFeeling, retryToast, retryUnsentMood } from './actions'

beforeEach(() => { h.self = 'p1'; h.rpc.mockReset(); h.rpc.mockResolvedValue({ data: 1, error: null }); h.moods = []; h.checkins = 0 })

describe('logFeeling (How are you?)', () => {
  it('has the four faces in the mockup order', () => expect(FEELINGS.map(([, l]) => l)).toEqual(['Great', 'OK', 'Not great', 'Unwell']))
  it('Great, OK and Not great log the mood and the check-in and raise no alert', async () => {
    for (const f of ['great', 'ok', 'notgreat'] as const) expect(await logFeeling(f)).toBe('told')
    expect(h.moods).toEqual(['mood-good', 'mood-ok', 'mood-low'])
    expect(h.checkins).toBe(3)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('Unwell logs the lowest mood, checks in and calls raise_mood_alert for my person', async () => {
    expect(await logFeeling('unwell')).toBe('told')
    expect(h.moods).toEqual(['mood-low'])
    expect(h.checkins).toBe(1)
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('raise_mood_alert', { p_person: 'p1' })
  })
  it('Unwell with the network down is saved and queued (untold); a refusal is not queued and says call them', async () => {
    const { db } = await import('../../db')
    await db.kv.delete('mood.unsent.p1')
    h.rpc.mockResolvedValue({ error: { code: '42501', message: 'denied' } })
    expect(await logFeeling('unwell')).toBe('refused')
    expect(await db.kv.get('mood.unsent.p1')).toBeUndefined()
    h.rpc.mockResolvedValue({ error: { code: '', message: 'TypeError: Failed to fetch' } })
    expect(await logFeeling('unwell')).toBe('untold')
    h.rpc.mockRejectedValue(new Error('offline'))
    expect(await logFeeling('unwell')).toBe('untold')
    expect(feelingToast('refused')).toBe('Your family was not told. Call them.')
  })
  it('DS-1: the RPC reaching 0 carers is nobody (never "family told"); 1 is sent; a second Unwell the same day with 0 new rows is still sent', async () => {
    const { db } = await import('../../db')
    await db.kv.delete('mood.unsent.p1')
    for (const k of await db.kv.toCollection().primaryKeys()) if (String(k).startsWith('mood.told.')) await db.kv.delete(k)
    h.rpc.mockResolvedValue({ data: 0, error: null })
    expect(await logFeeling('unwell')).toBe('nobody')
    expect(await db.kv.get('mood.unsent.p1')).toBeUndefined() // nothing to retry
    expect(feelingToast('nobody')).toBe('Saved. No one gets your alerts yet. Call your family.')
    expect(retryToast('nobody')).toBe('Saved. No one gets your alerts yet. Call your family.')
    h.rpc.mockResolvedValue({ data: 1, error: null })
    expect(await logFeeling('unwell')).toBe('told')
    h.rpc.mockResolvedValue({ data: 0, error: null }) // server dedupes: already told today
    expect(await logFeeling('unwell')).toBe('told')
  })
  it('a later Great or OK clears a queued Unwell', async () => {
    const { db } = await import('../../db')
    h.rpc.mockRejectedValue(new Error('offline'))
    await logFeeling('unwell')
    expect(await db.kv.get('mood.unsent.p1')).toBeTruthy()
    await logFeeling('ok')
    expect(await db.kv.get('mood.unsent.p1')).toBeUndefined()
  })
  it('two retries at once make one call', async () => {
    const { db } = await import('../../db')
    await db.kv.put({ key: 'mood.unsent', value: { personId: 'p1', at: Date.now() } })
    h.rpc.mockResolvedValue({ data: 1, error: null })
    const [a, b] = await Promise.all([retryUnsentMood(), retryUnsentMood()])
    expect([a, b]).toEqual(['sent', 'sent'])
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })
  it('the untold toast says the family has not seen it and to tap again or call; told says the family will see it', () => {
    expect(feelingToast('untold')).toBe('Saved. We will tell them when you are online.')
    expect(feelingToast('told')).toBe('Saved. Your family will see it in Bantay.')
  })
  it('an offline Unwell is kept in kv mood.unsent.<personId> (not the outbox) and sent once on reconnect: exactly 1 raise_mood_alert call', async () => {
    const { db } = await import('../../db')
    await db.kv.delete('mood.unsent.p1')
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await logFeeling('unwell')).toBe('untold')
    expect(h.rpc).not.toHaveBeenCalled()
    expect((await db.kv.get('mood.unsent.p1'))?.value).toMatchObject({ personId: 'p1' })
    expect(await db.outbox.count()).toBe(0)
    expect(await retryUnsentMood()).toBe('offline') // still offline: kept
    expect(h.rpc).not.toHaveBeenCalled()
    online.mockReturnValue(true)
    expect(await retryUnsentMood()).toBe('sent')
    expect(await retryUnsentMood()).toBe('none') // sent once, cleared
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('raise_mood_alert', { p_person: 'p1' })
    expect(await db.kv.get('mood.unsent.p1')).toBeUndefined()
    online.mockRestore()
  })
  it('a refused retry drops the unsent Unwell and says call them; one older than a day is dropped with a day line and no call', async () => {
    const { db } = await import('../../db')
    h.rpc.mockRejectedValueOnce(new Error('offline'))
    await logFeeling('unwell')
    h.rpc.mockClear()
    h.rpc.mockResolvedValueOnce({ error: { code: '42501', message: 'denied' } })
    expect(await retryUnsentMood()).toBe('refused')
    expect(await db.kv.get('mood.unsent.p1')).toBeUndefined()
    expect(retryToast('refused')).toBe('Your family was not told. Call them.')
    await db.kv.put({ key: 'mood.unsent', value: { personId: 'p1', at: new Date(2026, 9, 26, 9).getTime() } })
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 27, 18) }) // 33 h later
    h.rpc.mockClear()
    const r = await retryUnsentMood()
    vi.useRealTimers()
    expect(r).toEqual({ expired: 'Monday' })
    expect(retryToast(r)).toBe('Your Unwell from Monday did not reach your family. Call them.')
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('signed out: nothing is written and no alert is raised', async () => {
    h.self = null
    expect(await logFeeling('unwell')).toBe('signedout')
    expect(h.moods).toEqual([])
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
