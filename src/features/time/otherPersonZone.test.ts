import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adherence } from '../family/reportLogic'
import { manilaDay, pickSlot } from '../health/meds'
import { weekStrip } from '../health/medDetailLogic'
import { pendingDoses } from '../inbox/build'
import type { MedTaken, Medication } from '../log/store'
import { pillbox } from '../nudge/pillboxLogic'
import { doseDay, manilaDaysEnding, nextDoses, whenLine } from '../today/nextPick'
import { setPersonZones, setSelf, setZone } from './zone'

// S30 L8 round 2: another person's doses are built and matched on THAT person's zone, never the viewer's phone zone.
// Hand values: Manila 2026-12-01 10:00 = 02:00Z = Chicago 2026-11-30 20:00 (winter, UTC-6). Chicago 2026-12-01 08:00 = 14:00Z = Manila 22:00.
const CHI = 'America/Chicago'
const MNL = 'Asia/Manila'
const med = (personId: string, times: string[]): Medication => ({ personId, name: 'Losartan', serverId: `m-${personId}`, medStatus: 'active', schedule: { v: 1, times }, startedOn: '2026-11-25' })
const take = (personId: string, slot: string, iso: string): MedTaken => ({ personId, name: 'Losartan', medicationId: `m-${personId}`, slot, takenAt: iso })
afterEach(() => { setZone(null); setPersonZones({}, null); setSelf(null) })

describe('a viewer in Chicago looking at a Manila person (p1)', () => {
  const NOW = new Date('2026-12-01T02:00:00Z') // 10:00 on 12-01 in Manila, 20:00 on 11-30 in Chicago
  beforeEach(() => { setZone(CHI); setSelf('me'); setPersonZones({ p1: MNL }) })
  it('the 08:00 slot is 2 hours late on the MANILA clock (a Chicago clock would see no dose near it)', () => {
    const d = nextDoses([{ personId: 'p1', name: 'Mama', isMe: false }], [med('p1', ['08:00'])], [], NOW)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ at: 480, rel: 480, status: 'missed' })
    expect(doseDay(d[0]!, NOW)).toBe('2026-12-01')
    expect(whenLine(d[0]!, NOW)).toBe('8:00 AM · 2 hours ago')
  })
  it('a take at 08:05 Manila (00:05Z, 18:05 the day before in Chicago) settles today\'s slot', () => {
    expect(nextDoses([{ personId: 'p1', name: 'Mama', isMe: false }], [med('p1', ['08:00'])], [take('p1', '08:00', '2026-12-01T00:05:00Z')], NOW)).toEqual([])
  })
  it('a take from the evening of the PREVIOUS Manila day (21:00 on 11-30 = 13:00Z = 07:00 Chicago 11-30) does not settle today', () => {
    const d = nextDoses([{ personId: 'p1', name: 'Mama', isMe: false }], [med('p1', ['08:00'])], [take('p1', '08:00', '2026-11-30T13:00:00Z')], NOW)
    expect(d).toHaveLength(1)
  })
  it('the same person as ME is read on this phone\'s Chicago clock: 20:00 on 11-30, the 08:00 slot is far away', () => {
    setSelf('p1')
    expect(nextDoses([{ personId: 'p1', name: 'Me', isMe: true }], [med('p1', ['08:00'])], [], NOW)).toEqual([])
  })
  it('pickSlot for her: a mark at 12:30Z is 20:30 Manila, the 20:00 slot (a Chicago clock would say 06:30 and pick 08:00)', () => {
    expect(pickSlot(med('p1', ['08:00', '20:00']), [], new Date('2026-12-01T12:30:00Z'))).toBe('20:00')
  })
  it('the inbox\'s pending doses use her day and clock: 08:00 is due (at 480), the Chicago-day take does not hide it', () => {
    const rows = pendingDoses({ now: NOW, profile: null as never, taken: [take('p1', '08:00', '2026-11-30T13:00:00Z')], skipped: [], medications: [med('p1', ['08:00'])], personId: 'p1' })
    expect(rows).toEqual([{ name: 'Losartan', at: 480, missed: true }]) // 10:00 Manila is exactly 120 min after 08:00: the window has closed
  })
  it('seven days end on HER day: 12-01, not 11-30; the pillbox and the adherence strip agree', () => {
    expect(manilaDaysEnding(NOW, 3, MNL)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01'])
    expect(manilaDaysEnding(NOW, 3, CHI)).toEqual(['2026-11-28', '2026-11-29', '2026-11-30'])
    expect(manilaDay(NOW, MNL)).toBe('2026-12-01')
    expect(pillbox({ personId: 'p1', meds: [med('p1', ['08:00'])], takes: [], now: NOW })[6]).toMatchObject({ day: '2026-12-01', today: true })
    const a = adherence([med('p1', ['08:00'])], [], 'p1', NOW)
    expect(a.cells[6]).toMatchObject({ day: '2026-12-01', state: 'pending' })
    expect(weekStrip(med('p1', ['08:00']), [], NOW).cells[6]!.day).toBe('2026-12-01')
  })
})

describe('a viewer in Manila looking at a Chicago person (p2)', () => {
  const NOW = new Date('2026-12-01T14:00:00Z') // 08:00 on 12-01 in Chicago, 22:00 on 12-01 in Manila
  beforeEach(() => { setZone(MNL); setSelf('me'); setPersonZones({ p2: CHI }) })
  it('the 08:00 slot is due NOW on her clock (upcoming, rel 480); a Manila clock at 22:00 would see nothing', () => {
    const d = nextDoses([{ personId: 'p2', name: 'Ate', isMe: false }], [med('p2', ['08:00'])], [], NOW)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ at: 480, rel: 480, status: 'upcoming' })
    expect(whenLine(d[0]!, NOW)).toBe('8:00 AM · now')
  })
  it('a take at 08:05 Chicago (14:05Z) settles it; a take at 20:00 Chicago the day before (02:00Z 12-01, Manila 10:00 12-01) does not', () => {
    expect(nextDoses([{ personId: 'p2', name: 'Ate', isMe: false }], [med('p2', ['08:00'])], [take('p2', '08:00', '2026-12-01T14:05:00Z')], NOW)).toEqual([])
    expect(nextDoses([{ personId: 'p2', name: 'Ate', isMe: false }], [med('p2', ['08:00'])], [take('p2', '08:00', '2026-12-01T02:00:00Z')], NOW)).toHaveLength(1)
  })
  it('two people on two clocks sort by minutes from now: Chicago 08:00 (now) before Manila 22:30 (30 min away)', () => {
    setPersonZones({ p2: CHI, p3: MNL })
    const d = nextDoses([{ personId: 'p3', name: 'Lola', isMe: false }, { personId: 'p2', name: 'Ate', isMe: false }], [med('p2', ['08:00']), med('p3', ['22:30'])], [], NOW)
    expect(d.map((x) => x.personId)).toEqual(['p2', 'p3'])
  })
})
