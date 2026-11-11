// @vitest-environment node
// S30 L8 Texas: a person's dose day and slot instant are read on THEIR zone (people.tz). Hand-computed values:
// America/Chicago winter 2026-12-01 08:00 = 14:00Z = 22:00 Manila; summer 2026-07-01 08:00 = 13:00Z = 21:00 Manila;
// clock changes 2026-03-08 (CST to CDT) and 2026-11-01 (CDT to CST).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dayIn, hourIn, offsetMs, safeZone, slotInstant } from '../_shared/tz.ts'
import { channelFor, inQuietHours } from '../_shared/fcm.ts'
import { dayIn as clientDayIn, minutesIn, offsetMs as clientOffset, wallToMs } from '../../../src/features/time/zone'
import { dueSlots, isUndefinedColumn, openToday, type MedRow, type TakenRow } from './logic.ts'

const CHI = 'America/Chicago'
const med = (tz: string | undefined, over: Partial<MedRow> = {}): MedRow => ({ id: 'm1', person_id: 'p1', med_status: 'active', deleted_at: null, as_needed: false, schedule: { v: 1, times: ['08:00'] }, people: { archived_at: null, ...(tz ? { tz } : {}) }, ...over })
const at = (s: string) => Date.parse(s)

describe('server tz helper', () => {
  it('slot instants', () => {
    expect(new Date(slotInstant(CHI, '2026-12-01', '08:00')).toISOString()).toBe('2026-12-01T14:00:00.000Z')
    expect(new Date(slotInstant(CHI, '2026-07-01', '08:00')).toISOString()).toBe('2026-07-01T13:00:00.000Z')
    expect(new Date(slotInstant(CHI, '2026-03-07', '08:00')).toISOString()).toBe('2026-03-07T14:00:00.000Z')
    expect(new Date(slotInstant(CHI, '2026-03-08', '08:00')).toISOString()).toBe('2026-03-08T13:00:00.000Z')
    expect(new Date(slotInstant(CHI, '2026-10-31', '08:00')).toISOString()).toBe('2026-10-31T13:00:00.000Z')
    expect(new Date(slotInstant(CHI, '2026-11-01', '08:00')).toISOString()).toBe('2026-11-01T14:00:00.000Z')
    expect(new Date(slotInstant('Asia/Manila', '2026-12-01', '08:00')).toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })
  it('equals the client twin (src/features/time/zone.ts) on sample instants', () => {
    for (const z of [CHI, 'Asia/Manila', 'America/Los_Angeles']) for (const s of ['2026-03-08T07:59:00Z', '2026-03-08T08:00:00Z', '2026-11-01T06:30:00Z', '2026-11-01T07:30:00Z', '2026-12-01T14:00:00Z']) {
      expect(offsetMs(z, at(s))).toBe(clientOffset(z, at(s)))
      expect(dayIn(z, at(s))).toBe(clientDayIn(z, at(s)))
      expect(hourIn(z, at(s)) * 60).toBe(minutesIn(z, at(s)) - (minutesIn(z, at(s)) % 60))
    }
    expect(slotInstant(CHI, '2026-03-08', '08:00')).toBe(wallToMs(CHI, '2026-03-08', '08:00'))
  })
  it('a bad zone name never reaches Intl', () => {
    expect(safeZone('Mars/Olympus')).toBe('Asia/Manila')
    expect(safeZone(null)).toBe('Asia/Manila')
    expect(safeZone(CHI)).toBe(CHI)
  })
})

describe('A1: dose-watch judges a Texas dose on the Texas clock', () => {
  it('08:00 Chicago is NOT late at 08:30 Manila (18:30 the evening before in Texas); a Manila person with the same time is', () => {
    const now = at('2026-12-01T00:30:00Z') // 08:30 Manila = 18:30 on 2026-11-30 in Chicago
    expect(dueSlots([med(CHI)], [], now)).toEqual([])
    expect(dueSlots([med(undefined)], [], now)).toEqual([{ personId: 'p1', day: '2026-12-01', slot: '08:00' }])
    expect(dueSlots([med('Asia/Manila')], [], now)).toHaveLength(1)
  })
  it('it is late at 08:30 Chicago (14:30Z winter, 13:30Z summer) and the day is the Chicago day', () => {
    expect(dueSlots([med(CHI)], [], at('2026-12-01T14:29:00Z'))).toEqual([])
    expect(dueSlots([med(CHI)], [], at('2026-12-01T14:30:00Z'))).toEqual([{ personId: 'p1', day: '2026-12-01', slot: '08:00' }])
    expect(dueSlots([med(CHI)], [], at('2026-07-01T13:29:00Z'))).toEqual([])
    expect(dueSlots([med(CHI)], [], at('2026-07-01T13:30:00Z'))).toEqual([{ personId: 'p1', day: '2026-07-01', slot: '08:00' }])
  })
  it('a dose taken at 8 PM Chicago the evening before lands on the Chicago day, so the next morning is still open, and a 08:10 take closes it', () => {
    const lastNight = '2026-12-02T02:00:00Z' // 20:00 on 2026-12-01 Chicago = 10:00 on 2026-12-02 Manila
    const night: TakenRow = { person_id: 'p1', medication_id: 'm1', slot: '20:00', taken_at: lastNight }
    const m = med(CHI, { schedule: { v: 1, times: ['20:00'] } })
    expect(dueSlots([m], [night], at('2026-12-02T03:00:00Z'))).toEqual([]) // 21:00 Chicago, taken at 20:00 the same Chicago day: not a false "missed"
    const morning: TakenRow = { person_id: 'p1', medication_id: 'm1', slot: '08:00', taken_at: '2026-12-01T14:10:00Z' }
    expect(dueSlots([med(CHI)], [morning], at('2026-12-01T15:00:00Z'))).toEqual([])
  })
  it('G3: on the clock-change days the slot follows the wall clock, not a fixed 6 h', () => {
    // 2026-03-08: CDT from 03:00, so 08:00 is 13:00Z; a fixed -6 would say 14:00Z and be an hour late
    expect(dueSlots([med(CHI)], [], at('2026-03-08T13:29:00Z'))).toEqual([])
    expect(dueSlots([med(CHI)], [], at('2026-03-08T13:30:00Z'))).toHaveLength(1)
    // 2026-11-01: CST again after 02:00 CDT, so 08:00 is 14:00Z; a fixed -5 would say 13:00Z and be an hour early
    expect(dueSlots([med(CHI)], [], at('2026-11-01T14:29:00Z'))).toEqual([])
    expect(dueSlots([med(CHI)], [], at('2026-11-01T14:30:00Z'))).toHaveLength(1)
  })
  it('two people with different zones are judged each on their own clock in one run', () => {
    const meds = [med(CHI), med('Asia/Manila', { id: 'm2', person_id: 'p2' })]
    const now = at('2026-12-01T00:30:00Z')
    expect(dueSlots(meds, [], now).map((d) => d.personId)).toEqual(['p2'])
  })
  it('openToday uses the person\'s today', () => {
    // 08:30 Manila 2026-12-01 = 18:30 Chicago 2026-11-30: the Chicago person has no open 08:00 today (their 08:00 of the 30th is long past and taken or not, the 30th is their today and it IS open)
    const now = at('2026-12-01T00:30:00Z')
    expect(openToday([med('Asia/Manila')], [], now)).toEqual(['p1'])
    expect(openToday([med(CHI, { schedule: { v: 1, times: ['19:00'] } })], [], now)).toEqual([]) // 19:00 Chicago has not come yet
    expect(openToday([med(CHI, { schedule: { v: 1, times: ['18:00'] } })], [], now)).toEqual(['p1'])
  })
})

describe('A2: quiet hours follow the recipient\'s zone', () => {
  it('14:00Z winter is 08:00 Chicago (loud) and 22:00 Manila (quiet)', () => {
    const d = new Date('2026-12-01T14:00:00Z')
    expect(inQuietHours(d, CHI)).toBe(false)
    expect(inQuietHours(d, 'Asia/Manila')).toBe(true)
    expect(inQuietHours(d)).toBe(true) // unknown = Manila, as before
    const o = { kind: 'digest', template: 'digest', tone: 'normal' as const }
    expect(channelFor(o, d, CHI)).toBe('carer_alerts')
    expect(channelFor(o, d)).toBe('carer_quiet')
    // 04:00Z is 22:00 Chicago (quiet) and 12:00 Manila (loud)
    expect(channelFor(o, new Date('2026-12-01T04:00:00Z'), CHI)).toBe('carer_quiet')
    expect(channelFor(o, new Date('2026-12-01T04:00:00Z'))).toBe('carer_alerts')
    // a missed dose is always loud, whatever the hour or zone
    expect(channelFor({ kind: 'dose_missed', template: 'dose_missed', tone: 'normal' }, new Date('2026-12-01T04:00:00Z'), CHI)).toBe('carer_alerts')
  })
})

// ML-30: the Deno entry cannot run under vitest, so its wiring is guarded by reading the source.
const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
describe('index.ts wiring guard', () => {
  it('reads the person zone with a fallback for a database without 0065', () => {
    expect(src).toContain("try { return await read('people!inner(archived_at,tz)') } catch (e) { if (!isUndefinedColumn((e as { cause?: unknown }).cause)) throw e; return await read('people!inner(archived_at)') }")
  })
  it('the dose-due ping and the push quiet hours are zone aware, and no fixed +08:00 is left in the entry', () => {
    expect(src).toContain('slotInstant(tz, day, t)')
    expect(src).toContain('fcmMessageFor(r, now, zoneByUser.get(r.carer_user_id))')
    expect(src).not.toContain('+08:00')
  })
})

describe('isUndefinedColumn: only the missing people.tz column (migration 0065 not applied) may fall back', () => {
  it('true for Postgres 42703 and for the PostgREST message naming column tz', () => {
    expect(isUndefinedColumn({ code: '42703', message: 'anything' })).toBe(true)
    expect(isUndefinedColumn({ message: 'column people_1.tz does not exist' })).toBe(true)
  })
  it('false for a timeout, a policy error, a dropped link, null and a message about another column', () => {
    expect(isUndefinedColumn({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isUndefinedColumn({ code: '42501', message: 'permission denied for table people' })).toBe(false)
    expect(isUndefinedColumn({ message: 'TypeError: fetch failed' })).toBe(false)
    expect(isUndefinedColumn({ message: 'column people_1.nickname does not exist' })).toBe(false)
    expect(isUndefinedColumn(null)).toBe(false)
  })
})
