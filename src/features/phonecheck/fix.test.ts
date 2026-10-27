import { beforeEach, describe, expect, it, vi } from 'vitest'

const so = vi.hoisted(() => ({ openFix: vi.fn(), requestBatteryExemption: vi.fn() }))
vi.mock('../safety/settingsOpener', () => so)
const LN = vi.hoisted(() => ({ requestPermissions: vi.fn(), changeExactNotificationSetting: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))

import { applyFix, fixCopy, hasAutostart, openAutostart, oemName } from './fix'

beforeEach(() => {
  vi.clearAllMocks()
  so.openFix.mockResolvedValue({ opened: 'app-settings' })
  so.requestBatteryExemption.mockResolvedValue(true)
  LN.requestPermissions.mockResolvedValue({ display: 'granted' })
  LN.changeExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
})

describe('fix copy (mockup start-done-fix)', () => {
  it('Xiaomi battery saver: the three plain steps and the reason from the mockup', () => {
    const c = fixCopy('battery', 'xiaomi')
    expect(c.title).toBe('One thing to fix: battery saver')
    expect(c.why).toBe('Xiaomi stops Bantay when the screen is off, so a medicine alarm could be late.')
    expect(c.steps).toEqual(['Tap Fix it now', 'Battery saver, then No restrictions', 'Autostart: turn on'])
    expect(c.button).toBe('Fix it now (1 minute)')
  })
  it('Redmi and Poco are Xiaomi; Samsung has no autostart step; an unknown maker gets the generic text, never a guess', () => {
    expect(oemName('redmi')).toBe('Xiaomi')
    expect(oemName('poco')).toBe('Xiaomi')
    expect(hasAutostart('xiaomi')).toBe(true)
    expect(hasAutostart('samsung')).toBe(false)
    expect(hasAutostart(null)).toBe(false)
    expect(fixCopy('battery', 'samsung').steps).toEqual(['Tap Fix it now', 'Battery, then Bantay, then Unrestricted'])
    const g = fixCopy('battery', null)
    expect(g.why).toBe('Your phone stops Bantay when the screen is off, so a medicine alarm could be late.')
    expect(g.steps).toEqual(['Tap Fix it now', 'Allow Bantay to run in the background'])
    expect(fixCopy('battery', 'unknownmaker').why.startsWith('Your phone')).toBe(true)
  })
  it('the Hold for help problem says what Android did and where to fix it', () => {
    const c = fixCopy('call', null)
    expect(c.why).toContain('Hold for help can no longer call for you')
    expect(c.steps).toContain('Permissions, then Phone')
  })
  it('no copy promises a push, a lock screen alert or "even on silent"', () => {
    for (const p of ['battery', 'notif', 'exact', 'alarms', 'call'] as const) expect(JSON.stringify(fixCopy(p, 'xiaomi'))).not.toMatch(/silent|will be (told|notified)|lock screen|push/i)
  })
})

describe('applyFix', () => {
  it('battery: asks Android to let Bantay run in the background', async () => {
    expect(await applyFix('battery')).toBe('prompted')
    expect(so.requestBatteryExemption).toHaveBeenCalledTimes(1)
  })
  it('notifications: asks first; when that is not granted it opens the notification settings', async () => {
    expect(await applyFix('notif')).toBe('prompted')
    expect(so.openFix).not.toHaveBeenCalled()
    LN.requestPermissions.mockResolvedValueOnce({ display: 'denied' })
    expect(await applyFix('notif')).toBe('opened')
    expect(so.openFix).toHaveBeenCalledWith('notifications')
  })
  it('exact alarms: opens the alarms-and-reminders screen; falls back to the app settings page', async () => {
    expect(await applyFix('exact')).toBe('opened')
    expect(LN.changeExactNotificationSetting).toHaveBeenCalledTimes(1)
    LN.changeExactNotificationSetting.mockRejectedValueOnce(new Error('old'))
    expect(await applyFix('exact')).toBe('opened')
    expect(so.openFix).toHaveBeenCalledWith('appdetails')
  })
  it('call and alarms: the app settings page; never prompts for the phone permission here', async () => {
    expect(await applyFix('call')).toBe('opened')
    expect(await applyFix('alarms')).toBe('opened')
    expect(so.openFix).toHaveBeenCalledWith('appdetails')
  })
  it('nothing opens: failed, never a throw', async () => {
    so.openFix.mockResolvedValue({ opened: null })
    expect(await applyFix('call')).toBe('failed')
    so.requestBatteryExemption.mockRejectedValueOnce(new Error('x'))
    expect(await applyFix('battery')).toBe('failed')
  })
  it('openAutostart reports whether a screen opened', async () => {
    expect(await openAutostart()).toBe(true)
    expect(so.openFix).toHaveBeenCalledWith('autostart')
    so.openFix.mockResolvedValueOnce({ opened: null })
    expect(await openAutostart()).toBe(false)
  })
})
