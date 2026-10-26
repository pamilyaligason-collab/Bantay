import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const LN = vi.hoisted(() => ({ schedule: vi.fn(), cancel: vi.fn(), registerActionTypes: vi.fn(), removeDeliveredNotifications: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: vi.fn().mockResolvedValue('me') }))
vi.mock('../admin/events', () => ({ track: vi.fn() }))

import { db } from '../../db'
import { ldb, type Medication } from '../log/store'
import { DOSE_ACTION_TYPE, handleReminderAction, markDue, REMINDER_ACTIONS, registerReminderActions, SNOOZE_BASE, SNOOZE_TOP } from './reminderActions'

const NOW = new Date(2026, 9, 20, 8, 5)
const add = (o: Partial<Medication> & { name: string }) => ldb.medications.add({ personId: 'me', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId: `s-${o.name}`, ...o })
const SIB = [111111, 222222, 333333]
const ev = (actionId: string, at: number | undefined = 480, people: string[] = ['me'], rep: number | null = 0) => ({ actionId, notification: { id: rep === null ? 123456 : SIB[rep], title: 'Medicine time', body: 'It is 8:00 AM.', extra: { kind: 'dose', at, slot: '08:00', people, ...(rep === null ? {} : { rep, day: '2026-10-20', sib: SIB }) } } })

beforeEach(async () => {
  vi.clearAllMocks()
  LN.schedule.mockResolvedValue({ notifications: [] })
  LN.cancel.mockResolvedValue(undefined)
  LN.registerActionTypes.mockResolvedValue(undefined)
  LN.removeDeliveredNotifications.mockResolvedValue(undefined)
  await Promise.all([ldb.medications.clear(), ldb.meds.clear(), db.kv.clear(), db.outbox.clear()])
})

describe('reminder actions', () => {
  it('registers I took it / In 10 min / Skip today; none of them brings the app forward (a tap on the alarm itself opens it)', async () => {
    await registerReminderActions()
    const t = LN.registerActionTypes.mock.calls[0]![0].types[0]
    expect(t.id).toBe(DOSE_ACTION_TYPE)
    expect(REMINDER_ACTIONS.map((a) => a.title)).toEqual(['I took it', 'In 10 min', 'Skip today'])
    expect(t.actions.filter((a: { foreground?: boolean }) => a.foreground)).toEqual([])
  })
  it('Taken logs every dose due at that time with its slot, without opening the app', async () => {
    await add({ name: 'Losartan' })
    await add({ name: 'Metformin', schedule: { v: 1, times: ['08:00', '20:00'] } })
    await add({ name: 'Evening only', schedule: { v: 1, times: ['20:00'] } })
    await add({ name: 'Paused', medStatus: 'paused' })
    expect(await handleReminderAction(ev('taken'), NOW)).toBe('logged')
    const rows = await ldb.meds.toArray()
    expect(rows.map((r) => [r.name, r.slot, r.medicationId]).sort()).toEqual([['Losartan', '08:00', 's-Losartan'], ['Metformin', '08:00', 's-Metformin']])
    expect(await db.outbox.where('table').equals('meds_taken').count()).toBe(2)
    expect(LN.removeDeliveredNotifications).toHaveBeenCalled()
  })
  it('Taken twice does not log twice; nothing due says so', async () => {
    await add({ name: 'Losartan' })
    expect(await handleReminderAction(ev('taken'), NOW)).toBe('logged')
    expect(await handleReminderAction(ev('taken'), NOW)).toBe('nothing-due')
    expect(await ldb.meds.count()).toBe(1)
    expect(await markDue(13 * 60, ['me'], NOW)).toBe(0)
  })
  it('Taken logs only people this user may write for, and only the slot of that reminder', async () => {
    await db.kv.put({ key: 'carers.writable', value: { userId: 'u1', ids: ['ma'] } })
    await add({ name: 'Losartan' })
    await add({ name: 'Metformin', personId: 'ma' })
    await add({ name: 'Aspirin', personId: 'pa' }) // a read-only carer's person: not in the writable cache
    await add({ name: 'Evening', schedule: { v: 1, times: ['20:00'] } })
    expect(await handleReminderAction(ev('taken', 480, ['me', 'ma', 'pa']), NOW)).toBe('logged')
    expect((await ldb.meds.toArray()).map((r) => `${r.personId}:${r.name}`).sort()).toEqual(['ma:Metformin', 'me:Losartan'])
  })
  it('a reminder without people (an older one) logs nothing', async () => {
    await add({ name: 'Losartan' })
    expect(await handleReminderAction({ actionId: 'taken', notification: { id: 1, extra: { kind: 'dose', at: 480 } } }, NOW)).toBe('nothing-due')
    expect(await ldb.meds.count()).toBe(0)
  })
  it('Taken cancels the remaining repeats of that slot (the ones after the one that rang), only when something was logged', async () => {
    await add({ name: 'Losartan' })
    expect(await handleReminderAction(ev('taken', 480, ['me'], 0), NOW)).toBe('logged')
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 222222 }, { id: 333333 }] })
    LN.cancel.mockClear()
    expect(await handleReminderAction(ev('taken', 480, ['me'], 1), NOW)).toBe('nothing-due') // already logged: nothing to cancel again
    expect(LN.cancel).not.toHaveBeenCalled()
  })
  it('Taken on the +10 repeat cancels only the +20', async () => {
    await add({ name: 'Losartan' })
    await handleReminderAction(ev('taken', 480, ['me'], 1), NOW)
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 333333 }] })
  })
  it('Skip today logs the due doses as skipped, once, and cancels the repeats', async () => {
    await add({ name: 'Losartan' })
    await add({ name: 'Evening only', schedule: { v: 1, times: ['20:00'] } })
    expect(await handleReminderAction(ev('skip', 480, ['me'], 0), NOW)).toBe('skipped')
    const rows = await ldb.meds.toArray()
    expect(rows.map((r) => [r.name, r.slot, r.skipped])).toEqual([['Losartan', '08:00', true]])
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 222222 }, { id: 333333 }] })
    expect(await handleReminderAction(ev('skip', 480, ['me'], 1), NOW)).toBe('nothing-due')
    expect(await ldb.meds.count()).toBe(1)
  })
  it('In 10 min on the first or second alarm schedules nothing: the +10 / +20 repeats are already planned', async () => {
    expect(await handleReminderAction(ev('snooze', 480, ['me'], 0), NOW)).toBe('snoozed')
    expect(await handleReminderAction(ev('snooze', 480, ['me'], 1), NOW)).toBe('snoozed')
    expect(LN.schedule).not.toHaveBeenCalled()
    expect(LN.removeDeliveredNotifications).toHaveBeenCalledTimes(2)
  })
  it('two different slots get different snooze ids, even when their alarm ids differ by a multiple of 1e8, and none reaches the test alarm id', async () => {
    const ids: number[] = []
    for (const at of [480, 481, 720, 1200]) {
      LN.schedule.mockClear()
      const e = ev('snooze', at, ['me'], 2)
      e.notification.id = 1_500_000_000 // the same alarm id: only the slot differs
      e.notification.extra = { ...e.notification.extra, at }
      await handleReminderAction(e, NOW)
      ids.push(LN.schedule.mock.calls[0]![0].notifications[0].id)
    }
    expect(new Set(ids).size).toBe(4)
    for (const id of ids) { expect(id).toBeGreaterThanOrEqual(SNOOZE_BASE); expect(id).toBeLessThan(SNOOZE_TOP) }
  })
  it('In 10 min on the third alarm (or an old alarm without a repeat number) rings once more in 10 minutes, same text, loud channel, buttons kept', async () => {
    for (const rep of [2, null]) {
      LN.schedule.mockClear()
      expect(await handleReminderAction(ev('snooze', 480, ['me'], rep), NOW)).toBe('snoozed')
      const n = LN.schedule.mock.calls[0]![0].notifications[0]
      expect(n.schedule.at.getTime()).toBe(NOW.getTime() + 10 * 60_000)
      expect(n.schedule.allowWhileIdle).toBe(true)
      expect(n).toMatchObject({ title: 'Medicine time', body: 'It is 8:00 AM.', actionTypeId: DOSE_ACTION_TYPE, channelId: 'alarms_v1', extra: { kind: 'dose', at: 480 } })
      expect(n.id).toBeGreaterThanOrEqual(1_900_000_000)
      expect(n.id).toBeLessThan(2_147_483_647)
    }
  })
  it('Open and a plain tap change nothing; other notifications are ignored', async () => {
    await add({ name: 'Losartan' })
    expect(await handleReminderAction(ev('open'), NOW)).toBe('open')
    expect(await handleReminderAction({ notification: { extra: { kind: 'dose' } } }, NOW)).toBe('open')
    expect(await handleReminderAction({ actionId: 'taken', notification: { extra: { kind: 'alert' } } }, NOW)).toBe('ignored')
    expect(await ldb.meds.count()).toBe(0)
    expect(LN.schedule).not.toHaveBeenCalled()
  })
})
