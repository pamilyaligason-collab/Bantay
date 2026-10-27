import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ android: false, plugin: { open: vi.fn(), deviceInfo: vi.fn(), batteryStatus: vi.fn(), openBattery: vi.fn(), requestBatteryExemption: vi.fn(), status: vi.fn() } }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.android, getPlatform: () => (m.android ? 'android' : 'web') }, registerPlugin: () => m.plugin }))

import { batteryStatus, deviceMaker, openFix, openSettings } from './settingsOpener'

beforeEach(() => { m.android = false; vi.clearAllMocks() })

describe('settingsOpener on web', () => {
  it('batteryStatus on web reports ignoring=true so the step is not shown', async () => {
    expect(await batteryStatus()).toEqual({ ignoring: true })
  })
  it('deviceMaker is null on web (unknown, never a guess)', async () => {
    expect(await deviceMaker()).toBeNull()
    expect(m.plugin.deviceInfo).not.toHaveBeenCalled()
  })
})

describe('phone check screens (S3)', () => {
  beforeEach(() => { m.android = true })
  it('deviceMaker returns the lower-case maker; blank or a failure is null', async () => {
    m.plugin.deviceInfo.mockResolvedValueOnce({ manufacturer: ' Xiaomi ', sdk: 34 })
    expect(await deviceMaker()).toBe('xiaomi')
    m.plugin.deviceInfo.mockResolvedValueOnce({ manufacturer: '', sdk: 34 })
    expect(await deviceMaker()).toBeNull()
    m.plugin.deviceInfo.mockRejectedValueOnce(new Error('old shell: method not implemented'))
    expect(await deviceMaker()).toBeNull()
  })
  it('openFix names the screen reached; an old shell that rejects the target gives null, never a throw', async () => {
    m.plugin.open.mockResolvedValueOnce({ opened: 'oem-xiaomi-autostart' })
    expect(await openFix('autostart')).toEqual({ opened: 'oem-xiaomi-autostart' })
    expect(m.plugin.open).toHaveBeenCalledWith({ target: 'autostart' })
    m.plugin.open.mockRejectedValueOnce(new Error('unknown target'))
    expect(await openFix('appdetails')).toEqual({ opened: null })
    m.plugin.open.mockRejectedValueOnce(new Error('no settings screen could be opened'))
    expect(await openFix('notifications')).toEqual({ opened: null })
  })
  it('the existing earthquake and wea targets still work', async () => {
    m.plugin.open.mockResolvedValueOnce({ opened: 'safety-center' })
    expect((await openSettings('earthquake')).ok).toBe(true)
    expect(m.plugin.open).toHaveBeenCalledWith({ target: 'earthquake' })
  })
})
