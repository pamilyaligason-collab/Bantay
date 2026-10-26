import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ self: 'p1' as string | null, rpc: vi.fn(), moods: [] as string[], checkins: 0 }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => h.self }))
vi.mock('../auth/client', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }))
vi.mock('../admin/events', () => ({ track: async () => undefined }))
vi.mock('../log/store', () => ({ logActivity: async (a: { kind: string }) => { if (a.kind === 'check-in') h.checkins++; else h.moods.push(a.kind) } }))
import { FEELINGS, feelingToast, logFeeling } from './actions'

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
    expect(feelingToast('untold')).toBe('Your family has not seen this. Tap Unwell again when you are online, or call them.')
    expect(feelingToast('told')).toBe('Saved. Your family will see it in Bantay.')
  })
  it('an offline Unwell queues nothing in the outbox (no hidden retry), so the toast must not promise one', async () => {
    h.rpc.mockRejectedValue(new Error('offline'))
    await logFeeling('unwell')
    const { db } = await import('../../db')
    expect(await db.outbox.count()).toBe(0)
  })
  it('signed out: nothing is written and no alert is raised', async () => {
    h.self = null
    expect(await logFeeling('unwell')).toBe('signedout')
    expect(h.moods).toEqual([])
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
