import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const LN = vi.hoisted(() => ({ schedule: vi.fn(), cancel: vi.fn(), checkPermissions: vi.fn() }))
const cap = vi.hoisted(() => ({ native: true }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => cap.native } }))

import { db } from '../../db'
import type { MiniSlot } from '../today/RainMini'
import { RAIN_COOLDOWN_MS, RAIN_ID, RAIN_KEY, RAIN_TEXT, THRESH_KEY, applyRainReminder, inCooldown, rainAlarm } from './rainRemind'

const NOW = new Date('2026-11-04T11:00:20Z')
/** 8 slots of 15 minutes; `wet` lists the wet slot numbers. */
const slots = (...wet: number[]): MiniSlot[] => Array.from({ length: 8 }, (_, i) => ({ time: `2026-11-04T19:${String((i * 15) % 60).padStart(2, '0')}`, mm: wet.includes(i) ? 0.5 : 0, pct: null, wet: wet.includes(i) }))
const sched = () => LN.schedule.mock.calls.flatMap((c) => c[0].notifications)

beforeEach(async () => {
  vi.clearAllMocks(); cap.native = true
  LN.schedule.mockResolvedValue(undefined); LN.cancel.mockResolvedValue(undefined); LN.checkPermissions.mockResolvedValue({ display: 'granted' })
  await db.kv.clear()
})

describe('rainAlarm (when to ring)', () => {
  it('rain from slot 2 (30 minutes away) rings 15 minutes from now, to the minute', () => {
    expect(rainAlarm(slots(2, 3), NOW)!.toISOString()).toBe('2026-11-04T11:15:00.000Z')
  })
  it('rain from slot 5 (75 minutes away) with a high chance in the hour rings 60 minutes from now; with no chance it rings nothing (outside 45 minutes)', () => {
    expect(rainAlarm(slots(5), NOW, 60, 80)!.toISOString()).toBe('2026-11-04T12:00:00.000Z')
    expect(rainAlarm(slots(5), NOW, 60, 10)).toBeNull()
    expect(rainAlarm(slots(5), NOW)).toBeNull()
  })
  it('rain now (slot 0) or within 15 minutes (slot 1) rings nothing: it is not later than 20 minutes', () => {
    expect(rainAlarm(slots(0, 1), NOW)).toBeNull()
    expect(rainAlarm(slots(1), NOW)).toBeNull()
  })
  it('no rain, or no numbers, rings nothing', () => {
    expect(rainAlarm(slots(), NOW)).toBeNull()
    expect(rainAlarm(null, NOW)).toBeNull()
  })
})

describe('rainAlarm threshold (40, 60, 80) and the 45-minute mm rule', () => {
  const dry = slots()
  it('chance exactly at the threshold counts, one under does not, for each choice', () => {
    for (const t of [40, 60, 80]) {
      expect(rainAlarm(dry, NOW, t, t)).not.toBeNull()
      expect(rainAlarm(dry, NOW, t, t - 1)).toBeNull()
    }
  })
  it('a chance with no wet slot rings 30 minutes from now', () => {
    expect(rainAlarm(dry, NOW, 60, 70)!.toISOString()).toBe('2026-11-04T11:30:00.000Z')
  })
  it('unknown chance (null) is not a reason to ring', () => { expect(rainAlarm(dry, NOW, 40, null)).toBeNull() })
  it('0.1 mm over the first 45 minutes rings even at a low chance; 0.09 mm does not', () => {
    const mm = (v: number) => slots().map((s, i) => (i === 2 ? { ...s, mm: v, wet: v > 0 } : s))
    expect(rainAlarm(mm(0.1), NOW, 80, 5)!.toISOString()).toBe('2026-11-04T11:15:00.000Z')
    expect(rainAlarm(mm(0.09), NOW, 80, 5)).toBeNull()
  })
  it('rain already in slot 0 or 1 rings nothing even when the chance is high', () => { expect(rainAlarm(slots(1), NOW, 40, 100)).toBeNull() })
})

describe('3 hour cooldown', () => {
  it('inCooldown: a past alert under 3 h ago blocks, 3 h or more does not, a future one does not, junk does not', () => {
    const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()
    expect(inCooldown(at(-RAIN_COOLDOWN_MS + 1000), NOW)).toBe(true)
    expect(inCooldown(at(-RAIN_COOLDOWN_MS), NOW)).toBe(false)
    expect(inCooldown(at(60_000), NOW)).toBe(false)
    expect(inCooldown(undefined, NOW)).toBe(false)
  })
  it('after an alert rang, rain 1 hour later schedules nothing; 3 hours later it does', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    expect(await applyRainReminder(slots(2), NOW)).toBe('scheduled') // rings 11:15
    LN.schedule.mockClear()
    expect(await applyRainReminder(slots(2), new Date(NOW.getTime() + 3600_000))).toBe('cancelled')
    expect(LN.schedule).not.toHaveBeenCalled()
    expect(await applyRainReminder(slots(2), new Date(NOW.getTime() + 3 * 3600_000 + 15 * 60_000))).toBe('scheduled')
  })
  it('the saved threshold is read: 80 ignores a 70 chance, 40 acts on it', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    await db.kv.put({ key: THRESH_KEY, value: 80 })
    expect(await applyRainReminder(slots(), NOW, 70)).toBe('cancelled')
    await db.kv.put({ key: THRESH_KEY, value: 40 })
    expect(await applyRainReminder(slots(), NOW, 70)).toBe('scheduled')
  })
})

describe('applyRainReminder', () => {
  it('switch on and rain at slot 2: cancels the fixed id, then schedules one local notification with no name or place in the words', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    expect(await applyRainReminder(slots(2), NOW)).toBe('scheduled')
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: RAIN_ID }] })
    expect(sched()).toEqual([{ id: RAIN_ID, title: RAIN_TEXT.title, body: RAIN_TEXT.body, extra: { kind: 'rain' }, schedule: { at: new Date('2026-11-04T11:15:00.000Z'), allowWhileIdle: true } }])
  })
  it('switch on, a later open shows no rain: the armed reminder is cancelled and nothing is scheduled', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    await applyRainReminder(slots(2), NOW)
    LN.cancel.mockClear(); LN.schedule.mockClear()
    expect(await applyRainReminder(slots(), NOW)).toBe('cancelled')
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: RAIN_ID }] })
    expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('armed for later rain, then rain is 15 minutes away: the armed reminder stays, no cancel, no second one', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    await applyRainReminder(slots(2), NOW)
    LN.cancel.mockClear(); LN.schedule.mockClear()
    expect(await applyRainReminder(slots(1, 2), NOW)).toBe('scheduled')
    expect(LN.cancel).not.toHaveBeenCalled(); expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('rain now and nothing armed: nothing is scheduled', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    expect(await applyRainReminder(slots(0), NOW)).toBe('cancelled')
    expect(LN.cancel).not.toHaveBeenCalled(); expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('switch on, no rain and nothing armed: no plugin call at all', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    expect(await applyRainReminder(slots(), NOW)).toBe('cancelled')
    expect(LN.cancel).not.toHaveBeenCalled()
  })
  it('switch turned off while armed: cancels once; off and not armed: does nothing', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    await applyRainReminder(slots(2), NOW)
    LN.cancel.mockClear()
    await db.kv.put({ key: RAIN_KEY, value: false })
    expect(await applyRainReminder(slots(2), NOW)).toBe('off')
    expect(LN.cancel).toHaveBeenCalledTimes(1)
    expect(await applyRainReminder(slots(2), NOW)).toBe('off')
    expect(LN.cancel).toHaveBeenCalledTimes(1)
    expect(LN.schedule).toHaveBeenCalledTimes(1) // only the first one
  })
  it('a forecast that could not be read (null) leaves the plan alone: unknown is not dry', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    await applyRainReminder(slots(2), NOW)
    LN.cancel.mockClear()
    expect(await applyRainReminder(null, NOW)).toBe('unknown')
    expect(LN.cancel).not.toHaveBeenCalled()
  })
  it('permission not granted: nothing is scheduled', async () => {
    await db.kv.put({ key: RAIN_KEY, value: true })
    LN.checkPermissions.mockResolvedValue({ display: 'denied' })
    expect(await applyRainReminder(slots(2), NOW)).toBe('no-permission')
    expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('web: a no-op, no plugin call', async () => {
    cap.native = false
    await db.kv.put({ key: RAIN_KEY, value: true })
    expect(await applyRainReminder(slots(2), NOW)).toBe('web')
    expect(LN.cancel).not.toHaveBeenCalled(); expect(LN.schedule).not.toHaveBeenCalled()
  })
})
