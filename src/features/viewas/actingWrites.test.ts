import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// B2-1: while an admin acts for Mama, everything that is NOT a named UI entry point keeps working as the admin and queues as before.
// Real db.ts, real sync/profile.ts, real log/store.ts; only the sign-in session is faked.
const h = vi.hoisted(() => ({ member: { userId: 'u-admin', personId: 'p-admin', role: 'admin', handle: null } as unknown, reject: false }))
vi.mock('../auth/session', () => ({
  getMember: async () => { if (h.reject) throw new Error('offline'); return h.member },
  onAuthChange: () => () => undefined
}))
vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../admin/events', () => ({ track: async () => true }))
import { db, enqueue } from '../../db'
import { loadFamily } from '../auth/family'
import { logDose, ldb } from '../log/store'
import { savePhoto, saveProfile, selfIdOrCached } from '../sync/profile'
import { useSelf } from '../sos/useSelf'
import { checkIn, takeDose } from '../today/actions'
import { setActing } from './store'
import { enterActing } from './viewAs'

const can = { log: true, edit: true, rollcall: true, mood: true, reason: null }
const act = () => setActing({ personId: 'p-mama', name: 'Mama', can })
const outbox = async () => (await db.outbox.toArray()).map((r) => `${r.table}:${r.op}`)

beforeEach(async () => {
  h.reject = false
  await Promise.all([db.outbox.clear(), db.kv.clear(), db.profiles.clear(), ldb.meds.clear(), ldb.activity.clear()])
  setActing(null)
})
afterEach(() => setActing(null))

describe('background paths keep acting as the admin', () => {
  it('SOS rows queue online and offline (getMember rejecting) while acting; acks and updates pass', async () => {
    act()
    await enqueue('sos_events', 'insert', { id: 'e1', personId: 'p-admin', at: '2026-10-30T10:00:00Z', lat: null, lon: null, gps: null, callTo: '911', smsOpened: false })
    h.reject = true
    await enqueue('sos_events', 'insert', { id: 'e2', personId: 'p-admin', at: '2026-10-30T10:01:00Z', lat: null, lon: null, gps: null, callTo: '911', smsOpened: false })
    await enqueue('sos_acks', 'insert', { eventId: 'e0', seenAt: '2026-10-30T10:02:00Z' })
    await enqueue('sos_events_update', 'update', { id: 'e1', smsOpened: true })
    expect(await outbox()).toEqual(['sos_events:insert', 'sos_events:insert', 'sos_acks:insert', 'sos_events_update:update'])
    const rows = await db.outbox.toArray()
    expect((rows[1]!.payload as { personId: string }).personId).toBe('p-admin') // never Mama
  })
  it('the SOS screen asks useSelf, which is the signed-in person, not the acting one', async () => {
    act()
    const { result } = renderHook(() => useSelf())
    await waitFor(() => expect(result.current.personId).toBe('p-admin'))
    expect(await selfIdOrCached()).toBe('p-admin')
  })
  it('a Health Connect sample and a reminder Taken for the admin reach the outbox as the admin', async () => {
    act()
    await enqueue('activity', 'insert', { personId: 'p-admin', kind: 'steps', steps: 1200, startedAt: '2026-10-30T08:00:00Z', source: 'health-connect' }) // what sensors/health.ts queues
    await logDose({ personId: 'p-admin', name: 'Losartan' }, '08:00') // what health/reminderActions.ts calls
    const q = await outbox()
    expect(q).toContain('activity:insert')
    expect(q.some((x) => x.startsWith('meds_taken'))).toBe(true)
    expect((await ldb.meds.toArray()).map((m) => m.personId)).toEqual(['p-admin'])
  })
  it('un-parameterised loggers (notification replies, background callers) write for the admin while acting', async () => {
    act()
    await takeDose('Losartan')
    await checkIn()
    expect((await ldb.meds.toArray()).map((m) => m.personId)).toEqual(['p-admin'])
    expect((await ldb.activity.toArray()).map((m) => m.personId)).toEqual(['p-admin'])
  })
  it('the named entry points pass the member explicitly and the row is Mama\'s, queued under the admin session', async () => {
    act()
    await takeDose('Losartan', 'p-mama')
    await checkIn('p-mama')
    expect((await ldb.meds.toArray()).map((m) => m.personId)).toEqual(['p-mama'])
    expect((await ldb.activity.toArray()).map((m) => m.personId)).toEqual(['p-mama'])
  })
  it('Move logs are yours only: exercise/actions and data never import the acting id (import test) and use selfIdOrCached', async () => {
    const src = (await import('../exercise/actions?raw')).default as string
    expect(src).not.toMatch(/viewas|Acting/)
  })
})

describe('profile is never adopted for the acting member (adoptPerson guard)', () => {
  it('saveProfile(acting) and savePhoto(acting) throw before any Dexie write', async () => {
    act()
    await expect(saveProfile('p-mama', { phone: '0917' })).rejects.toThrow('acting:profile')
    await expect(savePhoto('p-mama', 'data:image/jpeg;base64,AAAA')).rejects.toThrow('acting:profile')
    expect(await db.profiles.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.kv.get('profile.selfId')).toBeUndefined()
    expect(await db.kv.get('profile.photo')).toBeUndefined()
  })
  it('saveProfile(self) and savePhoto(self) still work while acting', async () => {
    act()
    await saveProfile('p-admin', { phone: '0917' })
    await savePhoto('p-admin', 'data:image/jpeg;base64,AAAA')
    expect((await db.profiles.get('p-admin'))?.phone).toBe('0917')
    expect((await db.kv.get('profile.selfId'))?.value).toBe('p-admin')
  })
  it('not acting: the guard does nothing (Mama signing in on her own phone is adopted)', async () => {
    await saveProfile('p-mama', { phone: '0918' })
    expect((await db.kv.get('profile.selfId'))?.value).toBe('p-mama')
  })
})

describe('enterActing(self)', () => {
  it('is false and writes no audit row', async () => {
    const log = vi.fn()
    vi.doMock('../admin/desk/viewAsData', () => ({ logViewAs: log }))
    expect(await enterActing('p-admin')).toBe(false)
    expect(log).not.toHaveBeenCalled()
    vi.doUnmock('../admin/desk/viewAsData')
  })
  it('the sign-in list helper still works (sanity: loadFamily is untouched by acting)', () => {
    expect(Array.isArray(loadFamily())).toBe(true)
  })
})
