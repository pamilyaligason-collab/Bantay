import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ self: 'p1' as string | null, rpc: vi.fn(), moods: [] as string[], checkins: 0 }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => h.self }))
vi.mock('../auth/client', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }))
vi.mock('../admin/events', () => ({ track: async () => undefined }))
vi.mock('../log/store', () => ({ logActivity: async (a: { kind: string }) => { if (a.kind === 'check-in') h.checkins++; else h.moods.push(a.kind) } }))
import { FEELINGS, feelingToast, logFeeling, retryUnsentMood } from './actions'

beforeEach(() => { h.self = 'p1'; h.rpc.mockReset(); h.rpc.mockResolvedValue({ error: null }); h.moods = []; h.checkins = 0 })

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
  it('Unwell with the alert refused or the network down is saved but never reported as told', async () => {
    h.rpc.mockResolvedValue({ error: { code: '42501' } })
    expect(await logFeeling('unwell')).toBe('untold')
    h.rpc.mockRejectedValue(new Error('offline'))
    expect(await logFeeling('unwell')).toBe('untold')
  })
  it('the untold toast says the family has not seen it and to tap again or call; told says the family will see it', () => {
    expect(feelingToast('untold')).toBe('Saved. We will tell them when you are online.')
    expect(feelingToast('told')).toBe('Saved. Your family will see it in Bantay.')
  })
  it('an offline Unwell is kept in kv mood.unsent (not the outbox) and sent once on reconnect: exactly 1 raise_mood_alert call', async () => {
    const { db } = await import('../../db')
    await db.kv.delete('mood.unsent')
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await logFeeling('unwell')).toBe('untold')
    expect(h.rpc).not.toHaveBeenCalled()
    expect((await db.kv.get('mood.unsent'))?.value).toMatchObject({ personId: 'p1' })
    expect(await db.outbox.count()).toBe(0)
    expect(await retryUnsentMood()).toBe('offline') // still offline: kept
    expect(h.rpc).not.toHaveBeenCalled()
    online.mockReturnValue(true)
    expect(await retryUnsentMood()).toBe('sent')
    expect(await retryUnsentMood()).toBe('none') // sent once, cleared
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('raise_mood_alert', { p_person: 'p1' })
    expect(await db.kv.get('mood.unsent')).toBeUndefined()
    online.mockRestore()
  })
  it('a refused retry keeps the unsent Unwell; one older than a day is dropped without a call', async () => {
    const { db } = await import('../../db')
    h.rpc.mockRejectedValueOnce(new Error('offline'))
    await logFeeling('unwell')
    h.rpc.mockClear()
    h.rpc.mockResolvedValueOnce({ error: { code: '42501' } })
    expect(await retryUnsentMood()).toBe('offline')
    expect(await db.kv.get('mood.unsent')).toBeTruthy()
    await db.kv.put({ key: 'mood.unsent', value: { personId: 'p1', at: Date.now() - 25 * 3_600_000 } })
    h.rpc.mockClear()
    expect(await retryUnsentMood()).toBe('none')
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('signed out: nothing is written and no alert is raised', async () => {
    h.self = null
    expect(await logFeeling('unwell')).toBe('signedout')
    expect(h.moods).toEqual([])
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
