import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ native: true, perm: 'granted', version: '2.3.0' as string | null }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.native, getPlatform: () => (m.native ? 'android' : 'web'), isPluginAvailable: () => false }, registerPlugin: () => ({}) }))
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => { if (m.version == null) throw new Error('no app'); return { version: m.version } }, addListener: vi.fn(async () => ({ remove: vi.fn() })) } }))
vi.mock('../phonecheck/report', () => ({ reportPhoneHealth: vi.fn(async () => true) }))
const LN = vi.hoisted(() => ({ checkPermissions: vi.fn(), cancel: vi.fn(), schedule: vi.fn(), addListener: vi.fn(), getPending: vi.fn(), createChannel: vi.fn(), registerActionTypes: vi.fn() }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))

import { db } from '../../db'
import { track } from '../admin/events'
import { ldb, type Medication } from '../log/store'
import { resetShellVersionForTests } from '../phonecheck/appInfo'
import { resetAlarmChannelForTests } from '../phonecheck/channel'
import { KEY_ALARM_HEALTH, type AlarmHealth } from '../phonecheck/keys'
import { hdb } from '../records/store'
import { REMIND_FOR, alarmText, buildAlarms, horizonDays, idFor, reminderIds, resetReminderTapForTests, syncDoseReminders } from './reminders'

type Sched = { id: number; body: string; title: string; channelId: string; actionTypeId: string; schedule: { at: Date; allowWhileIdle: boolean; on?: unknown }; extra: { rep: number; day: string; sib: number[]; at: number; slot: string } }
const store = new Map<number, Sched>() // what Android holds as pending
const NOW = new Date(2026, 9, 20, 9, 0)

beforeEach(async () => {
  m.native = true
  m.perm = 'granted'
  m.version = '2.3.0'
  resetShellVersionForTests()
  resetAlarmChannelForTests()
  store.clear()
  await db.kv.clear()
  await ldb.medications.clear()
  await ldb.meds.clear()
  await hdb.people.clear()
  vi.clearAllMocks()
  LN.checkPermissions.mockImplementation(async () => ({ display: m.perm }))
  LN.cancel.mockImplementation(async ({ notifications }: { notifications: { id: number }[] }) => { for (const n of notifications) store.delete(n.id) })
  LN.schedule.mockImplementation(async ({ notifications }: { notifications: Sched[] }) => { for (const n of notifications) store.set(n.id, n); return { notifications: [] } })
  LN.getPending.mockImplementation(async () => ({ notifications: [...store.values()].map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: n.schedule, extra: n.extra })) }))
  LN.createChannel.mockResolvedValue(undefined)
  LN.registerActionTypes.mockResolvedValue(undefined)
  LN.addListener.mockResolvedValue({ remove: vi.fn() })
})

const add = (o: Partial<Medication> & { name: string }) => ldb.medications.add({ personId: 'me', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId: `s-${o.name}`, ...o })
const lastSched = () => (LN.schedule.mock.calls.at(-1)?.[0].notifications ?? []) as Sched[]
const health = async () => (await db.kv.get(KEY_ALARM_HEALTH))?.value as AlarmHealth
const evening = () => add({ name: 'Drug E', schedule: { v: 1, times: ['20:00'] } })
const sync = (now = NOW) => syncDoseReminders(undefined, { selfId: 'me', now })

describe('syncDoseReminders', () => {
  it('web: schedules nothing', async () => {
    m.native = false
    expect(await syncDoseReminders(['Losartan 8:00'])).toBe('web')
    expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('schedules one-shot alarms with allowWhileIdle for 7 days, three repeats (+0, +10, +20) per slot, on the alarms_v1 channel, never a repeating schedule', async () => {
    await evening()
    expect(await sync()).toBe('scheduled')
    const n = lastSched()
    expect(n).toHaveLength(21) // 7 days x 3 repeats, hand count: today 20:00 20:10 20:20 still ahead at 9:00, then 6 more days
    expect(new Set(n.map((x) => x.id)).size).toBe(21)
    expect(n.map((x) => x.schedule.at.getTime())).toEqual(
      [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [0, 10, 20].map((min) => new Date(2026, 9, 20 + d, 20, min).getTime()))
    )
    for (const x of n) {
      expect(x.schedule.allowWhileIdle).toBe(true)
      expect(x.schedule.on).toBeUndefined()
      expect(x.channelId).toBe('alarms_v1')
      expect(x.actionTypeId).toBe('DOSE_REMINDER')
    }
    expect(n.slice(0, 3).map((x) => x.extra.rep)).toEqual([0, 1, 2])
    expect(n[0]!.extra.sib).toEqual(n.slice(0, 3).map((x) => x.id))
    expect(JSON.stringify(n)).not.toMatch(/Drug/)
  })
  it('only the repeats still ahead are scheduled for today', async () => {
    await evening()
    await sync(new Date(2026, 9, 20, 20, 5)) // +0 has rung
    const n = lastSched()
    expect(n).toHaveLength(20)
    expect(n[0]!.schedule.at.getTime()).toBe(new Date(2026, 9, 20, 20, 10).getTime())
  })
  it('creates the alarms_v1 channel once (importance 5, vibration), however often it syncs', async () => {
    await evening()
    await sync(); await sync(); await sync(new Date(2026, 9, 21, 9, 0))
    expect(LN.createChannel).toHaveBeenCalledTimes(1)
    expect(LN.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'alarms_v1', importance: 5, vibration: true }))
    expect(JSON.stringify(LN.createChannel.mock.calls)).not.toMatch(/silent/i)
  })
  it('uses the specified copy: the +20 text names the family and the :30 time, nothing says "even on silent"', () => {
    expect(alarmText(1200, 0, 'en')).toEqual({ title: 'Medicine time', body: 'It is 8:00 PM. Open Bantay to see what is due.' })
    expect(alarmText(1200, 2, 'en')).toEqual({ title: 'Third reminder', body: 'Third reminder; your family will see this in Bantay at 8:30 PM.' })
    expect(alarmText(1425, 2, 'en').body).toBe('Third reminder; your family will see this in Bantay at 12:15 AM.') // 23:45 + 30 min wraps past midnight
    for (const r of [0, 1, 2] as const) for (const l of ['en', 'fil'] as const) expect(JSON.stringify(alarmText(540, r, l))).not.toMatch(/silent|will be (told|notified)|lock screen/i)
  })
  it('every open arms the whole plan again, so an alarm Android dropped (invisible to getPending) rings again', async () => {
    await evening()
    await sync()
    const all = lastSched()
    expect(all).toHaveLength(21)
    // Android drops alarms from AlarmManager; the plugin's saved list (getPending) still shows them, so detection is impossible and every open re-arms
    LN.schedule.mockClear(); LN.cancel.mockClear()
    expect(await sync()).toBe('scheduled')
    expect(lastSched().map((x) => x.id).sort()).toEqual(all.map((x) => x.id).sort()) // every id scheduled again, the same ids
    expect(LN.cancel.mock.calls[0]![0].notifications.map((x: { id: number }) => x.id).sort()).toEqual(all.map((x) => x.id).sort()) // cancelled first: idempotent
    expect(await health()).toMatchObject({ ok: true, rearmed: 7, set: 7, days: 7 }) // 7 slot-days were armed and are armed again
    expect(store.size).toBe(21)
  })
  it('the first plan re-arms nothing; a plan after a failed one is marked recovered', async () => {
    await evening()
    await sync()
    expect((await health()).rearmed).toBe(0)
    expect((await health()).recovered).toBeUndefined()
    m.perm = 'denied'
    await sync()
    expect((await health()).ok).toBe(false)
    m.perm = 'granted'
    await sync()
    expect(await health()).toMatchObject({ ok: true, recovered: true })
    await sync()
    expect((await health()).recovered).toBeUndefined()
  })
  it('two syncs at once run one after the other (no interleaved cancel and schedule)', async () => {
    await evening()
    await Promise.all([sync(), sync()])
    expect(store.size).toBe(21)
    expect((await health()).rearmed).toBe(7)
  })
  it('a slot with a dose for a person this user may not log keeps its repeats once the user logs their own', async () => {
    await add({ name: 'Mine', schedule: { v: 1, times: ['20:00'] } })
    await hdb.people.add({ id: 'ma' } as never)
    await db.kv.put({ key: REMIND_FOR, value: ['ma'] })
    await add({ name: 'Hers', personId: 'ma', schedule: { v: 1, times: ['20:00'] } })
    await ldb.meds.add({ personId: 'me', name: 'Mine', takenAt: new Date(2026, 9, 20, 20, 6).toISOString(), medicationId: 's-Mine', slot: '20:00' })
    await sync(new Date(2026, 9, 20, 20, 7))
    expect(store.size).toBe(18) // today's slot is answered by the user (Hers is not theirs to log); the six later days stay
  })
  it('a dose logged cancels the remaining +10 and +20 of that slot (and only those)', async () => {
    await evening()
    await sync(new Date(2026, 9, 20, 20, 5))
    const first = lastSched()
    const todays = first.slice(0, 2).map((x) => x.id) // +10 and +20 of today
    LN.cancel.mockClear()
    await ldb.meds.add({ personId: 'me', name: 'Drug E', takenAt: new Date(2026, 9, 20, 20, 6).toISOString(), medicationId: 's-Drug E', slot: '20:00' })
    expect(await sync(new Date(2026, 9, 20, 20, 7))).toBe('scheduled')
    expect(LN.cancel).toHaveBeenCalledTimes(1)
    const cancelled = LN.cancel.mock.calls[0]![0].notifications.map((x: { id: number }) => x.id)
    for (const id of todays) { expect(cancelled).toContain(id); expect(store.has(id)).toBe(false) } // today's +10 and +20 are cancelled and not armed again
    expect(store.size).toBe(18) // the six later days stay
    expect((await health()).rearmed).toBe(6) // the six later days were armed before and are armed again; today's cancelled repeats are not
  })
  it('a skipped dose counts as answered too', async () => {
    await evening()
    await ldb.meds.add({ personId: 'me', name: 'Drug E', takenAt: new Date(2026, 9, 20, 8, 0).toISOString(), medicationId: 's-Drug E', slot: '20:00', skipped: true })
    await sync()
    expect(lastSched()).toHaveLength(18)
  })
  it('a dose logged for a different slot does not cancel this one', async () => {
    await add({ name: 'Drug A', schedule: { v: 1, times: ['08:00', '20:00'] } })
    await ldb.meds.add({ personId: 'me', name: 'Drug A', takenAt: new Date(2026, 9, 20, 8, 1).toISOString(), medicationId: 's-Drug A', slot: '08:00' })
    await sync()
    expect(lastSched().filter((x) => x.schedule.at.getDate() === 20)).toHaveLength(3) // today: only 20:00 x3
  })
  it('a new app version re-plans everything (old alarms cancelled, all armed again)', async () => {
    await evening()
    await sync()
    const ids = [...store.keys()]
    m.version = '2.3.1'
    resetShellVersionForTests()
    LN.cancel.mockClear()
    expect(await sync()).toBe('scheduled')
    expect(LN.cancel.mock.calls[0]![0].notifications.map((x: { id: number }) => x.id).sort()).toEqual(ids.sort())
    expect(store.size).toBe(21)
  })
  it('a new Manila day re-plans (the 7-day window moves)', async () => {
    await evening()
    await sync()
    expect(await sync(new Date(2026, 9, 21, 9, 0))).toBe('scheduled')
  })
  it('the old repeating alarms (ids 31000..31099) are cancelled on upgrade', async () => {
    await evening()
    store.set(31005, { id: 31005 } as Sched)
    await sync()
    expect(store.has(31005)).toBe(false)
  })
  it('a pending list that cannot be read still plans everything', async () => {
    await evening()
    await sync()
    LN.getPending.mockRejectedValueOnce(new Error('boom'))
    expect(await sync()).toBe('scheduled')
    expect(store.size).toBe(21)
  })
  it('does not touch notifications it did not arm (other ids stay)', async () => {
    await evening()
    store.set(1_999_999_999, { id: 1_999_999_999 } as Sched) // the test alarm
    store.set(5000, { id: 5000 } as Sched)
    await sync(); await sync(new Date(2026, 9, 21, 9, 0))
    expect(store.has(1_999_999_999) && store.has(5000)).toBe(true)
  })
  it('no medicines: nothing scheduled and nothing cancelled; health says ok with 0 set', async () => {
    expect(await syncDoseReminders(undefined, { selfId: 'me', now: NOW })).toBe('unchanged')
    expect(await health()).toMatchObject({ ok: true, set: 0, rearmed: 0 })
  })
  it('the last timed medicine removed cancels the old alarms', async () => {
    const id = await evening()
    await sync()
    await ldb.medications.delete(id)
    expect(await sync()).toBe('scheduled')
    expect(store.size).toBe(0)
  })
  it('without permission it schedules nothing, says so, and records that alarms are not ok', async () => {
    m.perm = 'denied'
    await evening()
    expect(await sync()).toBe('no-permission')
    expect(LN.schedule).not.toHaveBeenCalled()
    expect((await health()).ok).toBe(false)
  })
  it('a plugin failure does not throw and records that alarms are not ok', async () => {
    await evening()
    LN.schedule.mockRejectedValueOnce(new Error('boom'))
    expect(await sync()).toBe('failed')
    expect((await health()).ok).toBe(false)
    expect(await sync()).toBe('scheduled') // the next try works
    expect((await health()).ok).toBe(true)
  })
})

describe('pending cap', () => {
  it('7 days while 21 alarms per slot-day set fits 450, then 3 days, then 1', () => {
    expect(horizonDays(1)).toBe(7)
    expect(horizonDays(21)).toBe(7) // 21 x 3 x 7 = 441
    expect(horizonDays(22)).toBe(3) // 462 > 450; 22 x 3 x 3 = 198
    expect(horizonDays(50)).toBe(3) // 450
    expect(horizonDays(51)).toBe(1) // 459 > 450
    expect(horizonDays(100)).toBe(1)
  })
  it('a phone with 30 slots gets 3 days, 270 alarms, below the cap', () => {
    const planned = Array.from({ length: 30 }, (_, i) => ({ at: i * 40, key: `m${i}`, people: [], due: [] }))
    const out = buildAlarms(planned, new Date(2026, 9, 20, 0, 0))
    expect(out.length).toBeLessThanOrEqual(450)
    expect(new Set(out.map((a) => a.day)).size).toBe(3)
  })
})

describe('reminders from medications', () => {
  it('schedules active, timed medicines of the signed-in person with a generic text', async () => {
    await add({ name: 'Drug A', schedule: { v: 1, times: ['08:00', '20:00'] } })
    await add({ name: 'Drug B' })
    await add({ name: 'NoTime', schedule: { v: 1, times: [], needs_time: true } })
    expect(await sync()).toBe('scheduled')
    const n = lastSched()
    expect(new Set(n.map((x) => x.extra.slot))).toEqual(new Set(['08:00', '20:00']))
    expect(n[0]!.title).toBe('Medicine time')
    expect(JSON.stringify(n)).not.toMatch(/Drug/)
  })
  it('leaves out paused, stopped and as-needed medicines', async () => {
    await add({ name: 'Paused', medStatus: 'paused' })
    await add({ name: 'Stopped', medStatus: 'stopped' })
    await add({ name: 'Prn', asNeeded: true })
    await add({ name: 'Live', schedule: { v: 1, times: ['09:30'] } })
    await sync()
    expect([...new Set(lastSched().map((x) => x.extra.slot))]).toEqual(['09:30'])
  })
  it('pauses a medicine whose review is more than 3 days old (D5) and keeps a fresh one', async () => {
    await add({ name: 'Old', schedule: { v: 1, times: ['07:00'], review: true, review_since: '2026-10-01' } })
    await add({ name: 'Fresh', schedule: { v: 1, times: ['12:00'], review: true, review_since: '2026-10-19' } })
    await sync()
    expect([...new Set(lastSched().map((x) => x.extra.slot))]).toEqual(['12:00'])
  })
  it('includes people listed in remind.for, and nobody else', async () => {
    await add({ name: 'Mine', schedule: { v: 1, times: ['08:00'] } })
    await add({ name: 'Cared', personId: 'ma', schedule: { v: 1, times: ['10:00'] } })
    await add({ name: 'Stranger', personId: 'x', schedule: { v: 1, times: ['11:00'] } })
    await sync()
    expect([...new Set(lastSched().map((x) => x.extra.slot))]).toEqual(['08:00'])
    await hdb.people.put({ id: 'ma', name: 'Test Child' })
    await db.kv.put({ key: REMIND_FOR, value: ['ma'] })
    expect(await sync()).toBe('scheduled')
    expect([...new Set(Array.from(store.values()).map((x) => x.extra.slot))].sort()).toEqual(['08:00', '10:00'])
  })
  it('no alarm for a person this phone no longer knows (archived)', async () => {
    await add({ name: 'Cared', personId: 'ma' })
    await db.kv.put({ key: REMIND_FOR, value: ['ma'] })
    await syncDoseReminders(undefined, { selfId: null, now: NOW })
    expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('medications win over the deprecated profile text', async () => {
    await add({ name: 'Drug A', schedule: { v: 1, times: ['06:00'] } })
    await syncDoseReminders(['Losartan 8:00'], { selfId: 'me', now: NOW })
    expect([...new Set(lastSched().map((x) => x.extra.slot))]).toEqual(['06:00'])
  })
  it('the deprecated profile text still plans alarms while no medications have been pulled', async () => {
    await syncDoseReminders(['Losartan 8:00'], { selfId: 'me', now: NOW })
    expect([...new Set(lastSched().map((x) => x.extra.slot))]).toEqual(['08:00'])
  })
  it('ids stay inside [100000, 1.8e9) and never collide, even for 100 times', () => {
    const planned = Array.from({ length: 100 }, (_, i) => ({ at: i, key: `m${i}` }))
    const ids = reminderIds(planned)
    expect(new Set(ids).size).toBe(100)
    for (const id of ids) { expect(id).toBeGreaterThanOrEqual(100_000); expect(id).toBeLessThan(1_800_000_000) }
    const used = new Set<number>()
    expect(idFor(used, 'same', 't')).not.toBe(idFor(used, 'same', 't'))
  })
  it('the tap listener is bound on the unchanged path too (cold start from a tap)', async () => {
    await add({ name: 'Drug A' })
    await sync()
    resetReminderTapForTests() // a new process
    LN.addListener.mockClear()
    expect(await sync()).toBe('scheduled') // every open re-arms
    const handler = LN.addListener.mock.calls.find((c) => c[0] === 'localNotificationActionPerformed')?.[1]
    expect(handler).toBeTypeOf('function')
    handler({ notification: { extra: { kind: 'dose' } } })
    expect(track).toHaveBeenCalledWith('action', 'reminder_opened')
    await sync()
    expect(LN.addListener).toHaveBeenCalledTimes(1) // idempotent
  })
  it('a tap on a reminder is one reminder_opened event, nothing else', async () => {
    resetReminderTapForTests()
    await add({ name: 'Drug A' })
    await sync()
    const handler = LN.addListener.mock.calls.find((c) => c[0] === 'localNotificationActionPerformed')?.[1]
    handler({ notification: { extra: { kind: 'dose' } } })
    handler({ notification: { extra: { kind: 'alert' } } })
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('action', 'reminder_opened')
  })
})

describe('reminder language (M7b)', () => {
  it('uses the saved language for the text, with no medicine name, and re-plans when the language changes', async () => {
    await add({ name: 'Drug A', schedule: { v: 1, times: ['20:00'] } })
    expect(await sync()).toBe('scheduled')
    expect(lastSched()[0]).toMatchObject({ title: 'Medicine time', body: 'It is 8:00 PM. Open Bantay to see what is due.' })
    await db.kv.put({ key: 'lang', value: 'fil' })
    expect(await sync()).toBe('scheduled')
    expect(lastSched()[0]).toMatchObject({ title: 'Oras na ng gamot', body: '8:00 PM na. Pakibuksan ang Bantay para makita ang dapat inumin.' })
    expect(JSON.stringify(lastSched())).not.toMatch(/Drug/)
    expect(await sync()).toBe('scheduled') // every open re-arms
    await db.kv.put({ key: 'lang', value: 'en' })
    expect(await sync()).toBe('scheduled')
  })
})
