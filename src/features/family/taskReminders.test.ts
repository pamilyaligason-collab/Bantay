import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// once() is private: it runs through syncTaskReminders with the phone's plugins mocked.
const h = vi.hoisted(() => ({
  native: true, remind: ['me'] as string[], granted: 'granted',
  schedule: vi.fn(async (_o: unknown) => undefined), cancel: vi.fn(async (_o: unknown) => undefined), channel: vi.fn(async () => undefined)
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { schedule: h.schedule, cancel: h.cancel, checkPermissions: async () => ({ display: h.granted }) } }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => 'me' }))
vi.mock('../health/reminders', () => ({ remindPeople: async () => h.remind }))
vi.mock('../phonecheck/channel', () => ({ ensureAlarmChannel: h.channel }))

import { db } from '../../db'
import { ALARM_CHANNEL, KEY_ALARM_HEALTH } from '../phonecheck/keys'
import type { FamilyTask } from './store'
import { syncTaskReminders, TASK_ID_BASE, TASK_ID_SPAN } from './taskReminders'

const now = new Date(2026, 9, 30, 8, 0)
const task = (o: Partial<FamilyTask> = {}): FamilyTask => ({ clientId: 't1', title: 'Pay the secret bill', due: '2026-10-30', assigneePersonId: null, done: false, remindAt: '09:30', ...o })
const setHealth = (ok: boolean) => db.kv.put({ key: KEY_ALARM_HEALTH, value: { ok } as never })
const saved = async () => (await db.kv.get('family.taskRingIds'))?.value

beforeEach(async () => {
  vi.clearAllMocks()
  h.native = true; h.remind = ['me']; h.granted = 'granted'
  await db.kv.clear()
  await setHealth(true)
})

describe('taskReminders.once (through syncTaskReminders)', () => {
  it('schedules one ring on the alarm channel for the viewer when remindPeople has them and the alarm plan is healthy; the text names nothing', async () => {
    await syncTaskReminders([task()], now)
    expect(h.schedule).toHaveBeenCalledTimes(1)
    const n = (h.schedule.mock.calls[0]![0] as { notifications: { id: number; title: string; body: string; channelId: string; schedule: { at: Date; allowWhileIdle: boolean } }[] }).notifications
    expect(n).toHaveLength(1)
    expect(n[0]!.channelId).toBe(ALARM_CHANNEL)
    expect(n[0]!.schedule.at.getTime()).toBe(new Date(2026, 9, 30, 9, 30).getTime())
    expect(n[0]!.schedule.allowWhileIdle).toBe(true)
    expect(n[0]!.id).toBeGreaterThanOrEqual(TASK_ID_BASE)
    expect(n[0]!.id).toBeLessThan(TASK_ID_BASE + TASK_ID_SPAN)
    expect(JSON.stringify(n)).not.toMatch(/secret|bill/i) // B-7: a task title can be anything
    expect(h.channel).toHaveBeenCalledTimes(1)
    expect(await saved()).toEqual([n[0]!.id]) // remembered so the next run can cancel it
  })

  it('the phone does not ring when the person is not in remindPeople: nothing scheduled, nothing remembered', async () => {
    h.remind = ['someone-else']
    await syncTaskReminders([task()], now)
    expect(h.schedule).not.toHaveBeenCalled()
    expect(await saved()).toEqual([])
    h.remind = ['me'] // "Everyone" counts as the signed-in person, but an assignee outside the list does not ring
    await syncTaskReminders([task({ assigneePersonId: 'ma' })], now)
    expect(h.schedule).not.toHaveBeenCalled()
  })

  it('the phone does not ring when the last alarm plan was not healthy (or never ran)', async () => {
    await setHealth(false)
    await syncTaskReminders([task()], now)
    expect(h.schedule).not.toHaveBeenCalled()
    await db.kv.delete(KEY_ALARM_HEALTH)
    await syncTaskReminders([task()], now)
    expect(h.schedule).not.toHaveBeenCalled()
    expect(await saved()).toEqual([])
  })

  it('cancels the rings it armed before, then schedules the new plan; a plan that became empty only cancels', async () => {
    await syncTaskReminders([task()], now)
    const first = await saved() as number[]
    h.cancel.mockClear(); h.schedule.mockClear()
    await syncTaskReminders([task({ remindAt: '10:00' })], now)
    expect(h.cancel).toHaveBeenCalledWith({ notifications: first.map((id) => ({ id })) })
    expect(h.schedule).toHaveBeenCalledTimes(1)
    const second = await saved() as number[]
    h.cancel.mockClear(); h.schedule.mockClear()
    await syncTaskReminders([task({ done: true })], now)
    expect(h.cancel).toHaveBeenCalledWith({ notifications: second.map((id) => ({ id })) })
    expect(h.schedule).not.toHaveBeenCalled()
    expect(await saved()).toEqual([])
  })

  it('without notification permission nothing is scheduled; on the web nothing runs at all', async () => {
    h.granted = 'denied'
    await syncTaskReminders([task()], now)
    expect(h.schedule).not.toHaveBeenCalled()
    expect(await saved()).toEqual([])
    h.native = false
    h.cancel.mockClear()
    await syncTaskReminders([task()], now)
    expect(h.cancel).not.toHaveBeenCalled()
    expect(h.channel).not.toHaveBeenCalled()
  })

  it('never throws: a failing plugin resolves quietly and a later call still runs', async () => {
    h.schedule.mockRejectedValueOnce(new Error('boom'))
    await expect(syncTaskReminders([task()], now)).resolves.toBeUndefined()
    await syncTaskReminders([task()], now)
    expect(h.schedule).toHaveBeenCalledTimes(2)
  })
})
