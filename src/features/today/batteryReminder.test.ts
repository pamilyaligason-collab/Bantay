import { beforeEach, describe, expect, it, vi } from 'vitest'

const LN = vi.hoisted(() => ({ schedule: vi.fn(), cancel: vi.fn(), checkPermissions: vi.fn() }))
const cap = vi.hoisted(() => ({ native: true }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => cap.native } }))
import { BAT_ID, batteryAlarm, syncBatteryReminder } from './batteryReminder'

const at = (h: number, m = 0) => new Date(2026, 10, 6, h, m)
const low = { level: 0.22, charging: false }
beforeEach(() => {
  vi.clearAllMocks(); cap.native = true
  LN.schedule.mockResolvedValue({ notifications: [] }); LN.cancel.mockResolvedValue(undefined); LN.checkPermissions.mockResolvedValue({ display: 'granted' })
})

describe('batteryAlarm (pure)', () => {
  it('low, uncharged, before 19:00: today 19:00', () => expect(batteryAlarm(low, at(14))).toEqual(at(19)))
  it('18:59 still plans; 19:00 does not', () => {
    expect(batteryAlarm(low, at(18, 59))).toEqual(at(19))
    expect(batteryAlarm(low, at(19))).toBeNull()
  })
  it('0.29 plans, 0.30 does not; charging does not; unknown does not', () => {
    expect(batteryAlarm({ level: 0.29, charging: false }, at(9))).toEqual(at(19))
    expect(batteryAlarm({ level: 0.3, charging: false }, at(9))).toBeNull()
    expect(batteryAlarm({ level: 0.1, charging: true }, at(9))).toBeNull()
    expect(batteryAlarm(null, at(9))).toBeNull()
  })
})

describe('syncBatteryReminder', () => {
  it('low and before 7 PM: cancels the old one, then schedules one one-shot at 19:00 with the exact words', async () => {
    expect(await syncBatteryReminder(at(10), async () => low)).toBe('scheduled')
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1_830_000_000 }] })
    expect(BAT_ID).toBe(1_830_000_000)
    expect(LN.schedule).toHaveBeenCalledTimes(1)
    expect(LN.schedule.mock.calls[0]![0].notifications).toEqual([{ id: 1_830_000_000, title: 'Battery low', body: 'Your phone is under 30%. Charge it tonight so alarms and SOS work.', extra: { kind: 'battery' }, schedule: { at: at(19), allowWhileIdle: true } }])
  })
  it('charging, 30 % and over, after 19:00 or unknown: only cancels', async () => {
    for (const [b, now] of [[{ level: 0.1, charging: true }, at(10)], [{ level: 0.3, charging: false }, at(10)], [low, at(19)], [null, at(10)]] as const) {
      LN.schedule.mockClear(); LN.cancel.mockClear()
      expect(await syncBatteryReminder(now, async () => b)).toBe('cancelled')
      expect(LN.cancel).toHaveBeenCalledTimes(1)
      expect(LN.schedule).not.toHaveBeenCalled()
    }
  })
  it('no notification permission: cancels, does not schedule, and says so', async () => {
    LN.checkPermissions.mockResolvedValue({ display: 'denied' })
    expect(await syncBatteryReminder(at(10), async () => low)).toBe('no-permission')
    expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('web: no-op, plugin untouched', async () => {
    cap.native = false
    expect(await syncBatteryReminder(at(10), async () => low)).toBe('web')
    expect(LN.cancel).not.toHaveBeenCalled()
    expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('a plugin failure is reported, not thrown', async () => {
    LN.schedule.mockRejectedValue(new Error('x'))
    expect(await syncBatteryReminder(at(10), async () => low)).toBe('failed')
  })
})
