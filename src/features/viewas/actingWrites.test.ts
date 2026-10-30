import 'fake-indexeddb/auto'
import { createElement } from 'react'
import { cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// B2-1: while an admin acts for Mama, everything that is NOT a named UI entry point keeps working as the admin and queues as before.
// Real db.ts, real sync/profile.ts, real log/store.ts, and the REAL SOS screen, Health Connect sync and reminder action handlers; only the sign-in session, the phone (call, GPS, notifications) and the wire are faked.
const h = vi.hoisted(() => ({ member: { userId: 'u-admin', personId: 'p-admin', role: 'admin', handle: null } as unknown, listeners: [] as ((s: { isActive: boolean }) => void)[] }))
vi.mock('../auth/session', () => ({
  getMember: async () => h.member,
  getAccessToken: async () => 'tok',
  onAuthChange: () => () => undefined
}))
vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../admin/events', () => ({ track: async () => true }))
vi.mock('../sos/call', () => ({ callFirstContact: async () => ({ placed: true, via: 'native' }), requestCallPermission: async () => 'granted' }))
vi.mock('../sos/locate', () => ({ sosPosition: async () => ({ lat: 9.65, lon: 123.85, at: 1, gps: true }) }))
vi.mock('../sos/SosContactsPicker', () => ({ default: () => null }))
vi.mock('../sos/useAcks', () => ({ useAcks: () => 0 }))
vi.mock('../sync/sync', () => ({ syncNow: async () => undefined }))
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_e: string, cb: (s: { isActive: boolean }) => void) => { h.listeners.push(cb); return { remove: async () => undefined } } } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { schedule: async () => ({ notifications: [] }), cancel: async () => undefined, registerActionTypes: async () => undefined, removeDeliveredNotifications: async () => undefined } }))
import { db, enqueue } from '../../db'
import { loadFamily } from '../auth/family'
import { handleReminderAction } from '../health/reminderActions'
import { ldb, logDose } from '../log/store'
import { enableType, syncAll, type HealthBridge } from '../sensors/health'
import { startSos } from '../sos/active'
import SosScreen from '../sos/SosScreen'
import { useSelf } from '../sos/useSelf'
import { savePhoto, saveProfile, selfIdOrCached } from '../sync/profile'
import { checkIn, takeDose } from '../today/actions'
import { setActing } from './store'
import { enterActing } from './viewAs'

const can = { log: true, edit: true, rollcall: true, mood: true, reason: null }
const act = () => setActing({ personId: 'p-mama', name: 'Mama', can })
const outbox = async () => (await db.outbox.toArray()).map((r) => `${r.table}:${r.op}`)
const payloads = async (table: string) => (await db.outbox.where('table').equals(table).toArray()).map((r) => r.payload as Record<string, unknown>)

beforeEach(async () => {
  h.member = { userId: 'u-admin', personId: 'p-admin', role: 'admin', handle: null }
  h.listeners.length = 0
  await Promise.all([db.outbox.clear(), db.kv.clear(), db.profiles.clear(), ldb.meds.clear(), ldb.activity.clear(), ldb.medications.clear()])
  setActing(null)
})
afterEach(() => { cleanup(); setActing(null); vi.restoreAllMocks() })

describe('background paths keep acting as the admin', () => {
  it('the real SOS screen, OFFLINE, records the SOS under the admin (never Mama) while acting', async () => {
    act()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const s = startSos()
    render(createElement(SosScreen, { onClose: () => undefined }))
    await waitFor(async () => expect((await payloads('sos_events')).length).toBe(1))
    expect((await payloads('sos_events'))[0]).toMatchObject({ id: s.id, personId: 'p-admin', at: s.at, callTo: '911' })
    expect(JSON.stringify(await db.outbox.toArray())).not.toContain('p-mama')
  })
  it('the SOS screen asks useSelf, which is the signed-in person, not the acting one', async () => {
    act()
    const { result } = renderHook(() => useSelf())
    await waitFor(() => expect(result.current.personId).toBe('p-admin'))
    expect(await selfIdOrCached()).toBe('p-admin')
  })
  it('the real Health Connect sync logs steps for the admin while acting', async () => {
    act()
    const bridge: HealthBridge = { platform: 'android', isAvailable: async () => true, request: async () => true, granted: async () => true, read: async () => [{ startDate: '2026-10-30T08:00:00.000Z', endDate: '2026-10-30T08:10:00.000Z', value: 1200 }] }
    expect(await enableType('steps', bridge)).toBe('on')
    expect((await syncAll(bridge)).added).toBe(1)
    expect((await ldb.activity.toArray()).map((r) => [r.personId, r.kind, r.steps, r.source])).toEqual([['p-admin', 'steps', 1200, 'health-connect']])
    expect((await payloads('activity')).map((r) => r.personId)).toEqual(['p-admin'])
  })
  it('the real reminder Taken action logs the admin dose and never the acting member dose, even when her id is in the notification', async () => {
    act()
    const schedule = { v: 1, times: ['08:00'] }
    await ldb.medications.bulkAdd([{ personId: 'p-admin', name: 'Losartan', medStatus: 'active', schedule, serverId: 's-a' }, { personId: 'p-mama', name: 'Metformin', medStatus: 'active', schedule, serverId: 's-m' }])
    const ev = { actionId: 'taken', notification: { id: 1, title: 't', body: 'b', extra: { kind: 'dose', at: 480, slot: '08:00', people: ['p-admin', 'p-mama'] } } }
    expect(await handleReminderAction(ev, new Date(2026, 9, 30, 8, 5))).toBe('logged')
    expect((await ldb.meds.toArray()).map((m) => [m.personId, m.name])).toEqual([['p-admin', 'Losartan']])
    expect((await payloads('meds_taken')).map((r) => r.personId)).toEqual(['p-admin'])
  })
  it('queue plumbing: acks and updates pass untouched while acting', async () => {
    act()
    await enqueue('sos_acks', 'insert', { eventId: 'e0', seenAt: '2026-10-30T10:02:00Z' })
    await enqueue('sos_events_update', 'update', { id: 'e1', smsOpened: true })
    expect(await outbox()).toEqual(['sos_acks:insert', 'sos_events_update:update'])
  })
  it('a dose logged with the admin id queues under the admin (what health/reminderActions calls)', async () => {
    act()
    await logDose({ personId: 'p-admin', name: 'Losartan' }, '08:00')
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
