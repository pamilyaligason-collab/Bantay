import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  android: true, version: '2.3.0' as string | null,
  status: null as null | { notificationsEnabled: boolean; canScheduleExactAlarms: boolean; ignoringBatteryOptimizations: boolean },
  maker: null as string | null, call: null as boolean | null, perm: 'granted'
}))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.android, getPlatform: () => (m.android ? 'android' : 'web'), isPluginAvailable: () => false }, registerPlugin: () => ({}) }))
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => { if (m.version == null) throw new Error('x'); return { version: m.version } } } }))
vi.mock('../safety/settingsOpener', () => ({ isNativeAndroid: () => m.android, nativeStatus: async () => m.status, deviceMaker: async () => m.maker }))
vi.mock('./callState', () => ({ callOk: async () => m.call }))
const LN = vi.hoisted(() => ({ checkPermissions: vi.fn(), schedule: vi.fn(), createChannel: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))

import { db } from '../../db'
import { track } from '../admin/events'
import { resetShellVersionForTests } from './appInfo'
import { resetAlarmChannelForTests } from './channel'
import { KEY_ALARM_HEALTH, KEY_PHONE_CHECK } from './keys'
import { probe, probeProblems, resetProbeVerdictForTests, scheduleTestAlarm } from './probe'

beforeEach(async () => {
  m.android = true; m.version = '2.3.0'; m.status = { notificationsEnabled: true, canScheduleExactAlarms: true, ignoringBatteryOptimizations: true }; m.maker = 'xiaomi'; m.call = true; m.perm = 'granted'
  resetShellVersionForTests(); resetAlarmChannelForTests(); resetProbeVerdictForTests()
  await db.kv.clear()
  vi.clearAllMocks()
  LN.checkPermissions.mockImplementation(async () => ({ display: m.perm }))
  LN.schedule.mockResolvedValue({ notifications: [] })
  LN.createChannel.mockResolvedValue(undefined)
})

describe('probe', () => {
  it('web: everything is unknown (null), nothing is a problem, and the answer is stored', async () => {
    m.android = false
    const r = await probe()
    expect(r).toEqual({ notif_ok: null, exact_ok: null, battery_ok: null, alarms_ok: null, call_ok: null, oem: null })
    expect(probeProblems(r)).toEqual([])
    expect((await db.kv.get(KEY_PHONE_CHECK))?.value).toMatchObject({ notif_ok: null, alarms_ok: null, oem: null, at: expect.any(String) })
  })
  it('a Xiaomi with battery saver on and the phone permission taken back reports exactly that', async () => {
    m.status = { notificationsEnabled: true, canScheduleExactAlarms: true, ignoringBatteryOptimizations: false }
    m.call = false
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: { at: '2026-10-20T01:00:00.000Z', set: 7, rearmed: 0, ok: true } })
    const r = await probe()
    expect(r).toEqual({ notif_ok: true, exact_ok: true, battery_ok: false, alarms_ok: true, call_ok: false, oem: 'xiaomi' })
    expect(probeProblems(r)).toEqual(['battery', 'call'])
    expect((await db.kv.get(KEY_PHONE_CHECK))?.value).toMatchObject({ battery_ok: false, call_ok: false, oem: 'xiaomi' })
    expect(track).toHaveBeenCalledWith('action', 'phone_check_fail')
  })
  it('all good: no problems and a pass event', async () => {
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: { at: 'x', set: 3, rearmed: 0, ok: true } })
    const r = await probe()
    expect(r).toMatchObject({ notif_ok: true, exact_ok: true, battery_ok: true, alarms_ok: true, call_ok: true })
    expect(probeProblems(r)).toEqual([])
    expect(track).toHaveBeenCalledWith('action', 'phone_check_pass')
    await probe(); await probe()
    expect(track).toHaveBeenCalledTimes(1) // an unchanged answer is not another usage event on every open
    m.status = { notificationsEnabled: false, canScheduleExactAlarms: true, ignoringBatteryOptimizations: true }
    await probe()
    expect(track).toHaveBeenLastCalledWith('action', 'phone_check_fail')
  })
  it('an old shell (below 2.3.0) never says alarms_ok, even when a health record says false: it is null, not false', async () => {
    m.version = '2.2.0'; m.call = null; m.maker = null
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: { at: 'x', set: 0, rearmed: 0, ok: false } })
    const r = await probe()
    expect(r.alarms_ok).toBeNull()
    expect(r.call_ok).toBeNull()
    expect(r.oem).toBeNull()
    expect(probeProblems(r)).toEqual([])
  })
  it('a shell whose version cannot be read counts as old: alarms_ok null', async () => {
    m.version = null
    expect((await probe()).alarms_ok).toBeNull()
  })
  it('a plugin that cannot answer leaves the switches null, falling back to the notification permission only for notif', async () => {
    m.status = null
    const r = await probe()
    expect(r).toMatchObject({ notif_ok: true, exact_ok: null, battery_ok: null })
    m.perm = 'denied'
    expect((await probe()).notif_ok).toBe(false)
  })
  it('notifications off or exact alarms off makes alarms_ok false on a new shell, and names the specific problem, not "alarms"', async () => {
    m.status = { notificationsEnabled: false, canScheduleExactAlarms: false, ignoringBatteryOptimizations: true }
    const r = await probe()
    expect(r.alarms_ok).toBe(false)
    expect(probeProblems(r)).toEqual(['notif', 'exact'])
  })
  it('alarms that could not be set with every switch on is reported as the alarms problem', async () => {
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: { at: 'x', set: 0, rearmed: 0, ok: false } })
    const r = await probe()
    expect(r.alarms_ok).toBe(false)
    expect(probeProblems(r)).toEqual(['alarms'])
  })
  it('probeProblems lists only an explicit false, most important first', () => {
    expect(probeProblems({ notif_ok: null, exact_ok: null, battery_ok: null, alarms_ok: null, call_ok: null, oem: null })).toEqual([])
    expect(probeProblems({ notif_ok: true, exact_ok: false, battery_ok: false, alarms_ok: false, call_ok: false, oem: null })).toEqual(['exact', 'battery', 'call'])
  })
})

describe('scheduleTestAlarm', () => {
  it('rings in 5 seconds on the alarm channel', async () => {
    const now = new Date(2026, 9, 20, 9, 0, 0)
    expect(await scheduleTestAlarm(5, now)).toBe('scheduled')
    expect(LN.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'alarms_v1', importance: 5 }))
    const n = LN.schedule.mock.calls[0]![0].notifications[0]
    expect(n).toMatchObject({ channelId: 'alarms_v1', schedule: { allowWhileIdle: true } })
    expect(n.schedule.at.getTime()).toBe(now.getTime() + 5000)
  })
  it('says so without permission, does nothing on the web, and never throws', async () => {
    m.perm = 'denied'
    expect(await scheduleTestAlarm()).toBe('no-permission')
    m.perm = 'granted'
    LN.schedule.mockRejectedValueOnce(new Error('boom'))
    expect(await scheduleTestAlarm()).toBe('failed')
    m.android = false
    expect(await scheduleTestAlarm()).toBe('web')
  })
})
