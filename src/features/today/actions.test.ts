import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// D-99: the loggers write for an explicit person when a named UI entry point passes one, and for the signed-in person otherwise.
const h = vi.hoisted(() => ({ user: 'u-admin' as string | null, self: 'admin1' as string | null, rpc: vi.fn(), rows: [] as { fn: string; personId: string; kind?: string; test?: string }[] }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => h.self }))
vi.mock('../auth/session', () => ({ getMember: async () => (h.user ? { userId: h.user, personId: 'admin1', role: 'admin', handle: null } : null) }))
vi.mock('../auth/client', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }))
vi.mock('../admin/events', () => ({ track: async () => undefined }))
vi.mock('../log/store', () => ({
  logActivity: async (a: { personId: string; kind: string }) => { h.rows.push({ fn: 'activity', personId: a.personId, kind: a.kind }) },
  logMedTaken: async (a: { personId: string }) => { h.rows.push({ fn: 'dose', personId: a.personId }) },
  logDose: async (a: { personId: string }) => { h.rows.push({ fn: 'dose', personId: a.personId }) },
  logReading: async (a: { personId: string; test: string }) => { h.rows.push({ fn: 'reading', personId: a.personId, test: a.test }) }
}))
import { db } from '../../db'
import { checkIn, clearUnsentMood, feelingToast, logBp, logFeeling, logSugar, logWeight, retryUnsentMood, takeDose, takeMedication } from './actions'

beforeEach(async () => {
  h.user = 'u-admin'; h.self = 'admin1'; h.rows = []; h.rpc.mockReset(); h.rpc.mockResolvedValue({ data: 1, error: null })
  for (const k of await db.kv.toCollection().primaryKeys()) if (String(k).startsWith('mood.')) await db.kv.delete(k)
})
const who = () => [...new Set(h.rows.map((r) => r.personId))]

describe('explicit personId (View as)', () => {
  it('writes for the given person when one is passed', async () => {
    await checkIn('mama'); await takeDose('Losartan', 'mama'); await logBp(120, 80, 'mama'); await logSugar(99, true, 'mama'); await logWeight(55, 'mama')
    await takeMedication({ name: 'Aspirin', schedule: { v: 1, times: [] } } as never, [], 'mama')
    expect(h.rows.length).toBe(7) // checkin 1, dose 1, bp 2, sugar 1, weight 1, medication 1
    expect(who()).toEqual(['mama'])
  })
  it('writes for the signed-in person when none is passed (background callers never act)', async () => {
    await checkIn(); await takeDose('Losartan'); await logBp(120, 80); await logSugar(99, false); await logWeight(55)
    expect(who()).toEqual(['admin1'])
  })
  it('signed out without an explicit id writes nothing', async () => {
    h.self = null
    expect(await takeDose('x')).toBe('signedout')
    expect(h.rows).toEqual([])
  })
  it('logFeeling(f, p) writes the mood and check-in for p and raise_mood_alert names p', async () => {
    expect(await logFeeling('unwell', 'mama')).toBe('told')
    expect(who()).toEqual(['mama'])
    expect(h.rpc).toHaveBeenCalledWith('raise_mood_alert', { p_person: 'mama' })
  })
})

describe('mood.unsent per person (M2-1)', () => {
  it("an offline Unwell for Mama is kept under her key; the admin's own Great does not erase it; retry sends it", async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await logFeeling('unwell', 'mama')).toBe('untold')
    expect((await db.kv.get('mood.unsent.mama'))?.value).toMatchObject({ personId: 'mama' })
    expect(await logFeeling('great')).toBe('told') // my own, not acting
    expect(await db.kv.get('mood.unsent.mama')).toBeTruthy()
    expect(h.rpc).not.toHaveBeenCalled()
    online.mockReturnValue(true)
    expect(await retryUnsentMood()).toBe('none') // the result is about MY queue; Mama's is sent silently
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('raise_mood_alert', { p_person: 'mama' })
    expect(await db.kv.get('mood.unsent.mama')).toBeUndefined()
    online.mockRestore()
  })
  it("Mama's later Great clears only Mama's queued Unwell", async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await logFeeling('unwell', 'mama'); await logFeeling('unwell')
    await logFeeling('ok', 'mama')
    expect(await db.kv.get('mood.unsent.mama')).toBeUndefined()
    expect(await db.kv.get('mood.unsent.admin1')).toBeTruthy()
    online.mockRestore()
  })
})

describe('queued Unwell never leaves the account that queued it (shared phone)', () => {
  it('another user signing in drops the row and sends nothing; the same user still sends it; sign-out clears every row', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await logFeeling('unwell', 'mama')
    expect((await db.kv.get('mood.unsent.mama'))?.value).toMatchObject({ personId: 'mama', by: 'u-admin' })
    online.mockReturnValue(true)
    h.user = 'u-other'
    expect(await retryUnsentMood()).toBe('none')
    expect(h.rpc).not.toHaveBeenCalled()
    expect(await db.kv.get('mood.unsent.mama')).toBeUndefined()
    h.user = 'u-admin'
    online.mockReturnValue(false)
    await logFeeling('unwell', 'mama')
    online.mockReturnValue(true)
    await retryUnsentMood()
    expect(h.rpc).toHaveBeenCalledWith('raise_mood_alert', { p_person: 'mama' })
    online.mockReturnValue(false)
    await logFeeling('unwell', 'mama'); await logFeeling('unwell')
    await clearUnsentMood()
    expect(await db.kv.where('key').startsWith('mood.unsent').count()).toBe(0)
    online.mockRestore()
  })
})

describe('toasts name the actor (m2-6)', () => {
  it('Saved for Mama / Family told. Sent as Lloyd.', () => {
    expect(feelingToast('told', { name: 'Mama', actor: 'Lloyd' })).toBe('Saved for Mama.')
    expect(feelingToast('told', { name: 'Mama', actor: 'Lloyd', unwell: true })).toBe('Family told. Sent as Lloyd.')
    expect(feelingToast('told')).toBe('Saved. Your family will see it in Bantay.')
  })
})
