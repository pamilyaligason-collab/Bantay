import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const LN = vi.hoisted(() => ({ schedule: vi.fn(), cancel: vi.fn(), registerActionTypes: vi.fn(), removeDeliveredNotifications: vi.fn(), checkPermissions: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: vi.fn().mockResolvedValue('me') }))
vi.mock('../admin/events', () => ({ track: vi.fn() }))
vi.mock('../auth/client', () => ({ supabase: null }))

import { db } from '../../db'
import { hdb } from '../records/store'
import { handleReminderAction } from '../health/reminderActions'
import { BP_ACTION_TYPE, BP_ID_BASE, BP_REPLY, BP_TEXT, BP_TIMES_KEY, bpAlarms, handleBpAction, setBpTimes, syncBpReminders } from './bpReminder'

const ev = (inputValue: string | undefined, actionId = BP_REPLY, kind = 'bp') => ({ actionId, inputValue, notification: { id: BP_ID_BASE + 1, title: BP_TEXT.title, body: BP_TEXT.body, extra: { kind } } })
const rows = () => hdb.readings.toArray()

beforeEach(async () => {
  vi.clearAllMocks()
  LN.schedule.mockResolvedValue({ notifications: [] }); LN.cancel.mockResolvedValue(undefined); LN.registerActionTypes.mockResolvedValue(undefined)
  LN.removeDeliveredNotifications.mockResolvedValue(undefined); LN.checkPermissions.mockResolvedValue({ display: 'granted' })
  await Promise.all([hdb.readings.clear(), db.kv.clear(), db.outbox.clear()])
})

describe('reply with a reading', () => {
  it('128/82 saves one blood pressure (top and bottom, the same time) for me and says Saved without a number', async () => {
    expect(await handleBpAction(ev('128/82'))).toBe('logged')
    const r = await rows()
    expect(r.map((x) => [x.personId, x.test, x.value, x.unit]).sort()).toEqual([['me', 'bp_diastolic', 82, 'mmHg'], ['me', 'bp_systolic', 128, 'mmHg']])
    expect(r[0]!.takenAt).toBe(r[1]!.takenAt)
    expect(await db.outbox.where('table').equals('readings').count()).toBe(2)
    const said = LN.schedule.mock.calls.flatMap((c) => c[0].notifications)
    expect(said.map((n: { title: string }) => n.title)).toEqual(['Saved'])
    expect(said.map((n: { title: string; body: string }) => n.title + n.body).join(' ')).not.toMatch(/\d/)
  })
  it('128 / 82 pulse 70 also saves the pulse', async () => {
    expect(await handleBpAction(ev('128 / 82 pulse 70'))).toBe('logged')
    expect((await rows()).map((x) => [x.test, x.value]).sort()).toEqual([['bp_diastolic', 82], ['bp_systolic', 128], ['heart_rate', 70]])
  })
  it('bp 128 asks "Over what?" and saves nothing', async () => {
    expect(await handleBpAction(ev('bp 128'))).toBe('ask')
    expect(await rows()).toEqual([])
    const n = LN.schedule.mock.calls[0]![0].notifications[0]
    expect(n.body).toMatch(/^Over what\?/)
    expect(n.actionTypeId).toBe(BP_ACTION_TYPE) // the question can be answered right there
  })
  it('garbage is never saved and opens the app instead', async () => {
    for (const s of ['hello', 'ok na po', '', undefined]) expect(await handleBpAction(ev(s)), String(s)).toBe('open')
    expect(await rows()).toEqual([])
    expect(LN.schedule.mock.calls.every((c) => c[0].notifications[0].title === BP_TEXT.open.title)).toBe(true)
  })
  it('numbers outside top 50 to 300 / bottom 30 to 200, or a top not above the bottom, are not saved: the app opens instead', async () => {
    for (const s of ['40/20', '49/30', '301/100', '120/29', '250/201', '82/128', '120/80 pulse 300', '1200/80']) expect(await handleBpAction(ev(s)), s).toBe('open')
    expect(await rows()).toEqual([])
    expect(await db.outbox.count()).toBe(0)
  })
  it('the edges 50/30 and 300/200 are saved', async () => {
    expect(await handleBpAction(ev('50/30'))).toBe('logged')
    expect(await handleBpAction(ev('300/200'))).toBe('logged')
    expect(await rows()).toHaveLength(4)
  })
  it('a plain tap on the reminder saves nothing; another kind of notification is ignored', async () => {
    expect(await handleBpAction(ev(undefined, 'tap'))).toBe('open')
    expect(await handleBpAction(ev('128/82', BP_REPLY, 'dose'))).toBe('ignored')
    expect(await rows()).toEqual([])
  })
  it('the shared reminder handler routes a bp notification here and leaves dose notifications alone (ML-13)', async () => {
    expect(await handleReminderAction(ev('127/79') as never)).toBe('logged')
    expect(await rows()).toHaveLength(2)
    expect(await handleReminderAction(ev('127/79', 'taken', 'dose') as never)).toBe('nothing-due') // no medicine: the dose path ran, no BP row
    expect(await rows()).toHaveLength(2)
  })
  it('the words in the reminder carry no number and no name (B-7)', () => {
    for (const m of [BP_TEXT, BP_TEXT.ask, BP_TEXT.open, BP_TEXT.saved]) expect(`${'title' in m ? m.title : ''}${'body' in m ? m.body : ''}`).not.toMatch(/\d/)
  })
})

describe('the reminder plan', () => {
  const now = new Date(2026, 2, 15, 8, 0)
  it('today\'s past time is skipped; the next 6 days ring both times; ids never collide', () => {
    const a = bpAlarms(['07:30', '19:00'], now)
    expect(a).toHaveLength(13)
    expect(new Set(a.map((x) => x.id)).size).toBe(13)
    expect(a[0]).toMatchObject({ id: BP_ID_BASE + 1 })
    expect(a[0]!.when.getHours()).toBe(19)
    expect(a.every((x) => x.id >= BP_ID_BASE && x.id < BP_ID_BASE + 90)).toBe(true) // clear of the dose alarms (< 1.8e9) and the snoozes (>= 1.9e9)
  })
  it('with no times and nothing armed before, the plugin is not touched at all', async () => {
    expect(await syncBpReminders(now)).toBe('off')
    expect(LN.cancel).not.toHaveBeenCalled(); expect(LN.schedule).not.toHaveBeenCalled(); expect(LN.registerActionTypes).not.toHaveBeenCalled()
  })
  it('turning it on registers the reply action and schedules a week of one-shot alarms with no number in the text', async () => {
    await db.kv.put({ key: BP_TIMES_KEY, value: ['07:30'] })
    expect(await syncBpReminders(now)).toBe('scheduled')
    expect(LN.registerActionTypes.mock.calls[0]![0].types[0].actions[0]).toMatchObject({ id: BP_REPLY, input: true })
    const sent = LN.schedule.mock.calls[0]![0].notifications
    expect(sent).toHaveLength(6) // today's 07:30 has passed
    expect(sent.every((n: { actionTypeId: string; extra: { kind: string }; body: string }) => n.actionTypeId === BP_ACTION_TYPE && n.extra.kind === 'bp' && !/\d/.test(n.body))).toBe(true)
  })
  it('turning it off cancels the plan; no permission schedules nothing', async () => {
    await db.kv.put({ key: BP_TIMES_KEY, value: ['07:30'] })
    await syncBpReminders(now)
    await db.kv.put({ key: BP_TIMES_KEY, value: [] })
    LN.schedule.mockClear()
    expect(await syncBpReminders(now)).toBe('off')
    expect(LN.cancel).toHaveBeenCalled(); expect(LN.schedule).not.toHaveBeenCalled()
    await db.kv.put({ key: BP_TIMES_KEY, value: ['07:30'] })
    LN.checkPermissions.mockResolvedValue({ display: 'denied' })
    expect(await syncBpReminders(now)).toBe('no-permission')
  })
  it('setBpTimes keeps valid HH:MM, sorted, three at most', async () => {
    await setBpTimes(['19:00', 'x', '07:30', '07:30', '12:00', '21:00'])
    expect((await db.kv.get(BP_TIMES_KEY))?.value).toEqual(['07:30', '12:00', '19:00'])
  })
})
