import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const LN = vi.hoisted(() => ({ schedule: vi.fn(), registerActionTypes: vi.fn(), removeDeliveredNotifications: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: vi.fn().mockResolvedValue('me') }))
vi.mock('../admin/events', () => ({ track: vi.fn() }))

import { db } from '../../db'
import { ldb, type Medication } from '../log/store'
import { DOSE_ACTION_TYPE, handleReminderAction, markDue, REMINDER_ACTIONS, registerReminderActions } from './reminderActions'

const NOW = new Date(2026, 9, 20, 8, 5)
const add = (o: Partial<Medication> & { name: string }) => ldb.medications.add({ personId: 'me', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId: `s-${o.name}`, ...o })
const ev = (actionId: string, at: number | undefined = 480, people: string[] = ['me']) => ({ actionId, notification: { id: 123456, title: 'Medicine time', body: 'It is 8:00 AM.', extra: { kind: 'dose', at, slot: '08:00', people } } })

beforeEach(async () => {
  vi.clearAllMocks()
  LN.schedule.mockResolvedValue({ notifications: [] })
  LN.registerActionTypes.mockResolvedValue(undefined)
  LN.removeDeliveredNotifications.mockResolvedValue(undefined)
  await Promise.all([ldb.medications.clear(), ldb.meds.clear(), db.kv.clear(), db.outbox.clear()])
})

describe('reminder actions', () => {
  it('registers Taken / Snooze 15 min / Open; only Open brings the app forward', async () => {
    await registerReminderActions()
    const t = LN.registerActionTypes.mock.calls[0]![0].types[0]
    expect(t.id).toBe(DOSE_ACTION_TYPE)
    expect(REMINDER_ACTIONS.map((a) => a.title)).toEqual(['Taken', 'Snooze 15 min', 'Open'])
    expect(t.actions.filter((a: { foreground?: boolean }) => a.foreground).map((a: { id: string }) => a.id)).toEqual(['open'])
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
  it('Snooze schedules one more reminder 15 minutes later with the same text and buttons', async () => {
    expect(await handleReminderAction(ev('snooze'), NOW)).toBe('snoozed')
    const n = LN.schedule.mock.calls[0]![0].notifications[0]
    expect(n.schedule.at.getTime()).toBe(NOW.getTime() + 15 * 60_000)
    expect(n).toMatchObject({ title: 'Medicine time', body: 'It is 8:00 AM.', actionTypeId: DOSE_ACTION_TYPE, extra: { kind: 'dose', at: 480 } })
    expect(n.id).not.toBe(123456)
    expect(n.id).toBeLessThan(2_147_483_647)
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
