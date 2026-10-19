import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ native: true, perm: 'granted' }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.native } }))
const LN = vi.hoisted(() => ({ checkPermissions: vi.fn(), cancel: vi.fn(), schedule: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))

import { db } from '../../db'
import { REMINDER_ID_BASE, syncDoseReminders } from './reminders'

beforeEach(async () => {
  m.native = true
  m.perm = 'granted'
  LN.checkPermissions.mockImplementation(async () => ({ display: m.perm }))
  LN.cancel.mockResolvedValue(undefined)
  LN.schedule.mockResolvedValue({ notifications: [] })
  await db.kv.clear()
  vi.clearAllMocks()
  LN.checkPermissions.mockImplementation(async () => ({ display: m.perm }))
})

describe('syncDoseReminders', () => {
  it('web: schedules nothing', async () => {
    m.native = false
    expect(await syncDoseReminders(['Losartan 8:00'])).toBe('web')
    expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('schedules one daily reminder per distinct time, with no medicine name in the text', async () => {
    expect(await syncDoseReminders(['Losartan 8:00', 'Metformin 8:00,20:00', 'Aspirin'])).toBe('scheduled')
    const { notifications } = LN.schedule.mock.calls[0]![0]
    expect(notifications).toHaveLength(2)
    expect(notifications[0]).toMatchObject({ id: REMINDER_ID_BASE, schedule: { on: { hour: 8, minute: 0 }, allowWhileIdle: true } })
    expect(notifications[1]).toMatchObject({ id: REMINDER_ID_BASE + 1, schedule: { on: { hour: 20, minute: 0 } } })
    expect(JSON.stringify(notifications)).not.toMatch(/Losartan|Metformin|Aspirin/)
  })
  it('does nothing when the times did not change, and reschedules after a change', async () => {
    await syncDoseReminders(['Losartan 8:00'])
    expect(await syncDoseReminders(['Losartan 50 mg 8:00'])).toBe('unchanged')
    expect(LN.schedule).toHaveBeenCalledTimes(1)
    expect(await syncDoseReminders(['Losartan 9:00'])).toBe('scheduled')
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: REMINDER_ID_BASE }] })
    expect(LN.schedule).toHaveBeenCalledTimes(2)
  })
  it('cancels the old ones when the last timed medicine is removed', async () => {
    await syncDoseReminders(['Losartan 8:00'])
    expect(await syncDoseReminders(['Losartan'])).toBe('scheduled')
    expect(LN.cancel).toHaveBeenCalledTimes(1)
    expect(LN.schedule).toHaveBeenCalledTimes(1)
  })
  it('without permission it schedules nothing and says so', async () => {
    m.perm = 'denied'
    expect(await syncDoseReminders(['Losartan 8:00'])).toBe('no-permission')
    expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('a plugin failure does not throw', async () => {
    LN.schedule.mockRejectedValueOnce(new Error('boom'))
    expect(await syncDoseReminders(['Losartan 8:00'])).toBe('failed')
  })
})
