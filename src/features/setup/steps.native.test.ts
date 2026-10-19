import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  native: true,
  perm: 'granted',
  exact: 'denied',
  ignoring: false,
  status: null as null | { notificationsEnabled: boolean; canScheduleExactAlarms: boolean; ignoringBatteryOptimizations: boolean },
  listener: undefined as undefined | ((s: { isActive: boolean }) => void),
  remove: vi.fn(async () => undefined)
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.native, getPlatform: () => (m.native ? 'android' : 'web') }, registerPlugin: () => ({}) }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (_e: string, cb: (s: { isActive: boolean }) => void) => { m.listener = cb; return { remove: m.remove } }) } }))
const LN = vi.hoisted(() => ({
  requestPermissions: vi.fn(), checkPermissions: vi.fn(), checkExactNotificationSetting: vi.fn(), changeExactNotificationSetting: vi.fn(), schedule: vi.fn()
}))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))
const so = vi.hoisted(() => ({ requestBatteryExemption: vi.fn(async () => true), batteryStatus: vi.fn(), nativeStatus: vi.fn(), isNativeAndroid: vi.fn() }))
vi.mock('../safety/settingsOpener', () => so)
const alerts = vi.hoisted(() => ({ enableAlerts: vi.fn(async () => undefined) }))
vi.mock('../notify/alerts', () => alerts)

import { notifyState, onResume, turnOnReminders } from './steps'

beforeEach(() => {
  Object.assign(m, { native: true, perm: 'granted', exact: 'denied', ignoring: false, status: null, listener: undefined })
  LN.requestPermissions.mockImplementation(async () => ({ display: m.perm }))
  LN.checkPermissions.mockImplementation(async () => ({ display: m.perm }))
  LN.checkExactNotificationSetting.mockImplementation(async () => ({ exact_alarm: m.exact }))
  LN.changeExactNotificationSetting.mockResolvedValue(undefined)
  so.isNativeAndroid.mockImplementation(() => m.native)
  so.batteryStatus.mockImplementation(async () => ({ ignoring: m.ignoring }))
  so.nativeStatus.mockImplementation(async () => m.status)
})
afterEach(() => vi.clearAllMocks())

describe('turnOnReminders', () => {
  it('web: only asks for notification permission', async () => {
    m.native = false
    await turnOnReminders()
    expect(alerts.enableAlerts).toHaveBeenCalledTimes(1)
    expect(LN.requestPermissions).not.toHaveBeenCalled()
    expect(so.requestBatteryExemption).not.toHaveBeenCalled()
  })
  it('android: permission, then exact alarms, then the battery prompt', async () => {
    await turnOnReminders()
    expect(LN.requestPermissions).toHaveBeenCalled()
    expect(LN.changeExactNotificationSetting).toHaveBeenCalled()
    expect(so.requestBatteryExemption).toHaveBeenCalled()
  })
  it('android: leaves finished switches alone', async () => {
    m.exact = 'granted'; m.ignoring = true
    await turnOnReminders()
    expect(LN.changeExactNotificationSetting).not.toHaveBeenCalled()
    expect(so.requestBatteryExemption).not.toHaveBeenCalled()
  })
  it('android: a denied permission skips the alarm switch and never rejects', async () => {
    m.perm = 'denied'
    await expect(turnOnReminders()).resolves.toBeUndefined()
    expect(LN.changeExactNotificationSetting).not.toHaveBeenCalled()
    LN.requestPermissions.mockRejectedValue(new Error('boom'))
    await expect(turnOnReminders()).resolves.toBeUndefined()
  })
})

describe('notifyState', () => {
  it('android: uses the native status in one call', async () => {
    m.status = { notificationsEnabled: true, canScheduleExactAlarms: true, ignoringBatteryOptimizations: false }
    expect(await notifyState()).toEqual({ display: true, exact: true, battery: false })
    expect(LN.checkPermissions).not.toHaveBeenCalled()
  })
  it('web: alarm and battery count as on', async () => {
    m.native = false
    expect(await notifyState()).toEqual({ display: true, exact: true, battery: true })
  })
})

describe('onResume', () => {
  it('native: runs once per return, from appStateChange only', async () => {
    const fn = vi.fn()
    const off = onResume(fn)
    await Promise.resolve()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fn).not.toHaveBeenCalled()
    m.listener!({ isActive: false })
    expect(fn).not.toHaveBeenCalled()
    m.listener!({ isActive: true })
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    await Promise.resolve(); await Promise.resolve()
    expect(m.remove).toHaveBeenCalled()
  })
  it('web: visibilitychange only, and stops after cleanup', () => {
    m.native = false
    const fn = vi.fn()
    const off = onResume(fn)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fn).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
