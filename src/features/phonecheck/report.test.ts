import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ android: true, version: '2.3.0' as string | null, user: 'u1' as string | null }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.android, getPlatform: () => 'android', isPluginAvailable: () => false }, registerPlugin: () => ({}) }))
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => { if (m.version == null) throw new Error('x'); return { version: m.version } } } }))
vi.mock('../safety/settingsOpener', () => ({ isNativeAndroid: () => m.android, nativeStatus: async () => null, deviceMaker: async () => null }))
vi.mock('../auth/client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: m.user ? { user: { id: m.user } } : null } }) } } }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

import { db } from '../../db'
import { resetShellVersionForTests } from './appInfo'
import { KEY_ALARM_HEALTH } from './keys'
import type { ProbeResult } from './probe'
import { RESEND_MS, reportPhoneHealth } from './report'

const R: ProbeResult = { notif_ok: true, exact_ok: true, battery_ok: false, alarms_ok: true, call_ok: false, oem: 'xiaomi' }
const T0 = new Date(2026, 9, 20, 9, 0)
const rows = async () => (await db.outbox.where('table').equals('phone_health').toArray())

beforeEach(async () => {
  m.android = true; m.version = '2.3.0'; m.user = 'u1'
  resetShellVersionForTests()
  await db.kv.clear(); await db.outbox.clear()
})

describe('reportPhoneHealth', () => {
  it('queues the full row for a 2.3.0 shell: switches, call_ok, oem, counts, self-check time', async () => {
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: { at: '2026-10-20T00:55:00.000Z', set: 7, rearmed: 1, ok: true } })
    expect(await reportPhoneHealth({ now: T0, result: R })).toBe(true)
    const [row] = await rows()
    expect(row).toMatchObject({ op: 'upsert', table: 'phone_health' })
    expect(row!.payload).toEqual({
      userId: 'u1', platform: 'android', appVersion: '2.3.0', alarmsOk: true, notifOk: true, exactOk: true, batteryOk: false, callOk: false, oem: 'xiaomi',
      alarmsSet: 7, alarmsRearmed: 1, alarmsCheckedAt: '2026-10-20T00:55:00.000Z', lastOpenAt: T0.toISOString(), updatedAt: T0.toISOString()
    })
  })
  it('an old shell sends alarms_ok, set and rearmed as null (unknown, never 0 or false)', async () => {
    m.version = '2.2.0'
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: { at: 'x', set: 5, rearmed: 2, ok: false } })
    await reportPhoneHealth({ now: T0, result: { ...R, alarms_ok: false } })
    expect((await rows())[0]!.payload).toMatchObject({ platform: 'android', appVersion: '2.2.0', alarmsOk: null, alarmsSet: null, alarmsRearmed: null, alarmsCheckedAt: null })
  })
  it('the web sends platform web with every switch null', async () => {
    m.android = false
    await reportPhoneHealth({ now: T0 })
    expect((await rows())[0]!.payload).toMatchObject({ userId: 'u1', platform: 'web', alarmsOk: null, notifOk: null, exactOk: null, batteryOk: null, callOk: null, oem: null, alarmsSet: null, alarmsRearmed: null })
  })
  it('an unchanged phone queues one row per 12 hours (the outbox does not grow on every open)', async () => {
    expect(await reportPhoneHealth({ now: T0, result: R })).toBe(true)
    expect(await reportPhoneHealth({ now: new Date(T0.getTime() + 3_600_000), result: R })).toBe(false)
    expect(await reportPhoneHealth({ now: new Date(T0.getTime() + RESEND_MS - 1), result: R })).toBe(false)
    expect(await rows()).toHaveLength(1)
    expect(await reportPhoneHealth({ now: new Date(T0.getTime() + RESEND_MS), result: R })).toBe(true)
    expect(await rows()).toHaveLength(2)
  })
  it('a change goes out at once', async () => {
    await reportPhoneHealth({ now: T0, result: R })
    expect(await reportPhoneHealth({ now: new Date(T0.getTime() + 60_000), result: { ...R, battery_ok: true } })).toBe(true)
    expect(await rows()).toHaveLength(2)
  })
  it('a phone clock that went back does not block reporting forever', async () => {
    await reportPhoneHealth({ now: T0, result: R })
    expect(await reportPhoneHealth({ now: new Date(T0.getTime() - 3_600_000), result: R })).toBe(true)
  })
  it('signed out: nothing is queued', async () => {
    m.user = null
    expect(await reportPhoneHealth({ now: T0, result: R })).toBe(false)
    expect(await rows()).toHaveLength(0)
  })
})
