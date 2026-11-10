import { afterEach, describe, expect, it } from 'vitest'
import { countDoses } from '../health/doseCount'
import { manilaDay, manilaMinutes, pickSlot } from '../health/meds'
import { slotAgo, showsAsCard } from '../family/CarerCards'
import { dayKey, inQuietHours } from '../notify/push'
import { manilaDaysEnding } from '../today/nextPick'
import type { Medication, MedTaken } from '../log/store'
import { setPersonZones, setSelf, setZone } from './zone'

// S30 L8 (A3/A5): a Texas member's dose day and clock are America/Chicago. Hand-computed: winter 2026-12-01 08:00 Chicago = 14:00Z = 22:00 Manila; summer 2026-07-01 08:00 = 13:00Z = 21:00 Manila.
const CHI = 'America/Chicago'
afterEach(() => { setZone(null); setPersonZones({}, null); setSelf(null) })
const med: Medication = { personId: 'p1', name: 'Losartan', serverId: 'm1', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-11-25' }
const take = (iso: string): MedTaken => ({ personId: 'p1', name: 'Losartan', medicationId: 'm1', slot: '08:00', takenAt: iso })

describe('own dose day follows the phone zone', () => {
  it('Manila zone (the default, and every Philippine phone): unchanged', () => {
    expect(manilaDay(new Date('2026-12-01T14:00:00Z'))).toBe('2026-12-01')
    expect(manilaMinutes(new Date('2026-12-01T14:00:00Z'))).toBe(22 * 60)
  })
  it('Chicago: 14:00Z winter is 08:00 on 2026-12-01; a dose taken at 8 PM Chicago stays on that Chicago day', () => {
    setZone(CHI)
    expect(manilaDay(new Date('2026-12-01T14:00:00Z'))).toBe('2026-12-01')
    expect(manilaMinutes(new Date('2026-12-01T14:00:00Z'))).toBe(8 * 60)
    expect(manilaDay('2026-12-02T02:00:00Z')).toBe('2026-12-01') // 20:00 Chicago = 02:00Z; Manila would call it 12-02
    expect(manilaMinutes(new Date('2026-07-01T13:00:00Z'))).toBe(8 * 60) // summer: CDT
  })
  it('midnight is Chicago midnight: 05:59Z is the day before, 06:00Z the new day (winter)', () => {
    setZone(CHI)
    expect(manilaDay('2026-12-01T05:59:00Z')).toBe('2026-11-30')
    expect(manilaDay('2026-12-01T06:00:00Z')).toBe('2026-12-01')
  })
  it('pickSlot: an 08:10 Chicago take lands on the 08:00 slot of the Chicago day', () => {
    setZone(CHI)
    expect(pickSlot(med, [], new Date('2026-12-01T14:10:00Z'))).toBe('08:00')
  })
  it('countDoses: 08:05 Chicago taken on time counts done, in the Chicago zone; the 7 days end on the Chicago day', () => {
    setZone(CHI)
    setSelf('p1') // own data: this phone's zone
    const now = new Date('2026-12-01T22:00:00Z') // 16:00 Chicago
    const days = manilaDaysEnding(now, 3)
    expect(days).toEqual(['2026-11-29', '2026-11-30', '2026-12-01'])
    const n = countDoses({ meds: [med], takes: [take('2026-12-01T14:05:00Z'), take('2026-11-30T14:05:00Z')], personId: 'p1', now, days })
    expect([n.done, n.want]).toEqual([2, 3]) // 29 Nov missed, 30 Nov and today taken; today's slot counts because it was taken
  })
  it('countDoses for a Manila person seen from a Chicago phone uses THEIR zone', () => {
    setZone(CHI)
    setPersonZones({ p1: 'Asia/Manila' }, 'me')
    const now = new Date('2026-12-01T04:00:00Z') // 12:00 Manila 12-01, 22:00 Chicago 11-30
    const n = countDoses({ meds: [med], takes: [take('2026-12-01T00:05:00Z')], personId: 'p1', now, days: ['2026-12-01'] }) // 08:05 Manila
    expect([n.done, n.want]).toEqual([1, 1])
  })
})

describe('missed-dose card text and day', () => {
  it('slotAgo: 08:00 Chicago 2026-12-01 is 1 h 10 min ago at 15:10Z', () => {
    expect(slotAgo('2026-12-01', '08:00', new Date('2026-12-01T15:10:00Z'), CHI)).toBe('1 h 10 min ago')
    expect(slotAgo('2026-12-01', '08:00', new Date('2026-12-01T15:10:00Z'), 'Asia/Manila')).toBe('15 h 10 min ago') // 08:00 Manila is 00:00Z
  })
  it('showsAsCard: the ref day is the PERSON\'s day', () => {
    const now = new Date('2026-12-01T04:00:00Z') // Manila 12-01 12:00, Chicago 11-30 22:00
    expect(showsAsCard('p1:2026-12-01:08:00', now, 'Asia/Manila')).toBe(true)
    expect(showsAsCard('p1:2026-12-01:08:00', now, CHI)).toBe(false)
    expect(showsAsCard('p1:2026-11-30:20:00', now, CHI)).toBe(true)
  })
})

describe('A2: the push quiet hours and nudge day follow the phone zone', () => {
  it('14:00Z winter: 08:00 Chicago is loud, 22:00 Manila is quiet; 04:00Z is the reverse', () => {
    setZone(CHI)
    expect(inQuietHours(new Date('2026-12-01T14:00:00Z'))).toBe(false)
    expect(inQuietHours(new Date('2026-12-01T04:00:00Z'))).toBe(true)
    setZone('Asia/Manila')
    expect(inQuietHours(new Date('2026-12-01T14:00:00Z'))).toBe(true)
    expect(inQuietHours(new Date('2026-12-01T04:00:00Z'))).toBe(false)
  })
  it('dayKey is the phone zone day', () => {
    setZone(CHI)
    expect(dayKey(new Date('2026-12-02T02:00:00Z'))).toBe('2026-12-01')
  })
})
