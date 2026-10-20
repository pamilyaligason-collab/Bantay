import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ native: true, perm: 'granted' }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.native } }))
const LN = vi.hoisted(() => ({ checkPermissions: vi.fn(), cancel: vi.fn(), schedule: vi.fn(), addListener: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))

import { db } from '../../db'
import { track } from '../admin/events'
import { ldb, type Medication } from '../log/store'
import { REMIND_FOR, reminderIds, resetReminderTapForTests, syncDoseReminders } from './reminders'

beforeEach(async () => {
  m.native = true
  m.perm = 'granted'
  LN.checkPermissions.mockImplementation(async () => ({ display: m.perm }))
  LN.cancel.mockResolvedValue(undefined)
  LN.schedule.mockResolvedValue({ notifications: [] })
  await db.kv.clear()
  await ldb.medications.clear()
  vi.clearAllMocks()
  LN.checkPermissions.mockImplementation(async () => ({ display: m.perm }))
  LN.addListener.mockResolvedValue({ remove: vi.fn() })
})

const NOW = new Date(2026, 9, 20, 9, 0)
const add = (o: Partial<Medication> & { name: string }) => ldb.medications.add({ personId: 'me', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId: `s-${o.name}`, ...o })
const sched = () => (LN.schedule.mock.calls.at(-1)?.[0].notifications ?? []) as { id: number; body: string; title: string; schedule: { on: { hour: number; minute: number } } }[]

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
    expect(notifications[0]).toMatchObject({ schedule: { on: { hour: 8, minute: 0 }, allowWhileIdle: true } })
    expect(notifications[1]).toMatchObject({ schedule: { on: { hour: 20, minute: 0 } } })
    expect(notifications[0].id).not.toBe(notifications[1].id)
    expect(JSON.stringify(notifications)).not.toMatch(/Losartan|Metformin|Aspirin/)
  })
  it('does nothing when the times did not change, and reschedules after a change', async () => {
    await syncDoseReminders(['Losartan 8:00'])
    expect(await syncDoseReminders(['Losartan 50 mg 8:00'])).toBe('unchanged')
    expect(LN.schedule).toHaveBeenCalledTimes(1)
    expect(await syncDoseReminders(['Losartan 9:00'])).toBe('scheduled')
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: expect.any(Number) }] })
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

describe('reminders from medications', () => {
  it('schedules active, timed medicines of the signed-in person, one reminder per time, with a generic text', async () => {
    await add({ name: 'Drug A', schedule: { v: 1, times: ['08:00', '20:00'] } })
    await add({ name: 'Drug B' })
    expect(await syncDoseReminders(undefined, { selfId: 'me', now: NOW })).toBe('scheduled')
    const n = sched()
    expect(n.map((x) => x.schedule.on.hour)).toEqual([8, 20])
    expect(n[0]!.title).toBe('Medicine time')
    expect(JSON.stringify(n)).not.toMatch(/Drug/)
  })
  it('leaves out paused, stopped, as-needed, no-time and not-yet-timed medicines', async () => {
    await add({ name: 'Paused', medStatus: 'paused' })
    await add({ name: 'Stopped', medStatus: 'stopped' })
    await add({ name: 'Prn', asNeeded: true })
    await add({ name: 'NoTime', schedule: { v: 1, times: [], needs_time: true } })
    await add({ name: 'Live', schedule: { v: 1, times: ['09:30'] } })
    await syncDoseReminders(undefined, { selfId: 'me', now: NOW })
    expect(sched().map((x) => [x.schedule.on.hour, x.schedule.on.minute])).toEqual([[9, 30]])
  })
  it('pauses a medicine whose review is more than 3 days old (D5) and keeps a fresh one', async () => {
    await add({ name: 'Old', schedule: { v: 1, times: ['07:00'], review: true, review_since: '2026-10-01' } })
    await add({ name: 'Fresh', schedule: { v: 1, times: ['12:00'], review: true, review_since: '2026-10-19' } })
    await syncDoseReminders(undefined, { selfId: 'me', now: NOW })
    expect(sched().map((x) => x.schedule.on.hour)).toEqual([12])
  })
  it('includes people listed in remind.for, and nobody else', async () => {
    await add({ name: 'Mine', schedule: { v: 1, times: ['08:00'] } })
    await add({ name: 'Cared', personId: 'ma', schedule: { v: 1, times: ['10:00'] } })
    await add({ name: 'Stranger', personId: 'x', schedule: { v: 1, times: ['11:00'] } })
    await syncDoseReminders(undefined, { selfId: 'me', now: NOW })
    expect(sched().map((x) => x.schedule.on.hour)).toEqual([8])
    await db.kv.put({ key: REMIND_FOR, value: ['ma'] })
    expect(await syncDoseReminders(undefined, { selfId: 'me', now: NOW })).toBe('scheduled')
    expect(sched().map((x) => x.schedule.on.hour)).toEqual([8, 10])
  })
  it('works for a carer with no own medicines', async () => {
    await add({ name: 'Cared', personId: 'ma' })
    await db.kv.put({ key: REMIND_FOR, value: ['ma'] })
    await syncDoseReminders(undefined, { selfId: null, now: NOW })
    expect(sched()).toHaveLength(1)
  })
  it('medications win over the deprecated profile text', async () => {
    await add({ name: 'Drug A', schedule: { v: 1, times: ['06:00'] } })
    await syncDoseReminders(['Losartan 8:00'], { selfId: 'me', now: NOW })
    expect(sched().map((x) => x.schedule.on.hour)).toEqual([6])
  })
  it('ids stay inside the int range and never collide, even for 100 times', async () => {
    const planned = Array.from({ length: 100 }, (_, i) => ({ at: i, key: `m${i}` }))
    const ids = reminderIds(planned)
    expect(new Set(ids).size).toBe(100)
    for (const id of ids) { expect(id).toBeGreaterThanOrEqual(100_000); expect(id).toBeLessThan(2_147_483_647) }
    expect(reminderIds([{ at: 5, key: 'same' }, { at: 5, key: 'same' }])[0]).not.toBe(reminderIds([{ at: 5, key: 'same' }, { at: 5, key: 'same' }])[1])
  })
  it('the tap listener is bound on the unchanged path too (cold start from a tap)', async () => {
    await add({ name: 'Drug A' })
    await syncDoseReminders(undefined, { selfId: 'me', now: NOW })
    resetReminderTapForTests() // a new process: the signature is stored, nothing is scheduled again
    LN.addListener.mockClear()
    expect(await syncDoseReminders(undefined, { selfId: 'me', now: NOW })).toBe('unchanged')
    const handler = LN.addListener.mock.calls.find((c) => c[0] === 'localNotificationActionPerformed')?.[1]
    expect(handler).toBeTypeOf('function')
    handler({ notification: { extra: { kind: 'dose' } } })
    expect(track).toHaveBeenCalledWith('action', 'reminder_opened')
    await syncDoseReminders(undefined, { selfId: 'me', now: NOW })
    expect(LN.addListener).toHaveBeenCalledTimes(1) // idempotent
  })
  it('a tap on a reminder is one reminder_opened event, nothing else', async () => {
    resetReminderTapForTests()
    await add({ name: 'Drug A' })
    await syncDoseReminders(undefined, { selfId: 'me', now: NOW })
    const handler = LN.addListener.mock.calls.find((c) => c[0] === 'localNotificationActionPerformed')?.[1]
    expect(handler).toBeTypeOf('function')
    handler({ notification: { extra: { kind: 'dose' } } })
    handler({ notification: { extra: { kind: 'alert' } } })
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('action', 'reminder_opened')
  })
})
