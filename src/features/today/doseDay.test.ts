import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { MedTaken, Medication } from '../log/store'
import { adherence } from '../family/reportLogic'
import { doseSeries, dayKeys } from '../family/weekSeries'
import { pillbox } from '../nudge/pillboxLogic'
import { addManilaDays, doseDay, manilaDaysEnding, nextDoses } from './nextPick'

// The dose day is Manila's whatever this phone says (D-148, ML-38). The instants below are fixed UTC, so the file proves it when run with the phone elsewhere:
//   TZ=America/Los_Angeles npx vitest run src/features/today/doseDay.test.ts   (the 7th in Los Angeles at 00:30 Manila)

const med: Medication = { personId: 'me', name: 'Sleeper', serverId: 'm1', schedule: { v: 1, times: ['23:45'] }, startedOn: '2026-11-01', medStatus: 'active' }
const me = { personId: 'me', name: 'Rey', isMe: true }
const N2330 = new Date('2026-11-07T15:30:00Z') // 23:30 Sat 7 Nov Manila, 07:30 Sat in Los Angeles
const N0030 = new Date('2026-11-07T16:30:00Z') // 00:30 Sun 8 Nov Manila, 08:30 Sat in Los Angeles
const take = (iso: string): MedTaken => ({ personId: 'me', name: 'Sleeper', medicationId: 'm1', slot: '23:45', takenAt: iso })

describe('dose day is Manila on a phone in another zone', () => {
  it('day helpers shift Manila days as plain dates', () => {
    expect(addManilaDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(manilaDaysEnding(N0030, 3)).toEqual(['2026-11-06', '2026-11-07', '2026-11-08'])
    expect(dayKeys(N0030)[6]).toBe('2026-11-08')
  })
  it('23:30: the 23:45 dose is next and upcoming, its day is the 7th', () => {
    const d = nextDoses([me], [med], [], N2330)[0]!
    expect(d).toMatchObject({ at: 1425, rel: 1425, status: 'upcoming' })
    expect(doseDay(d, N2330)).toBe('2026-11-07')
  })
  it('00:30 next day: the same dose is missed, it belongs to yesterday (the 7th)', () => {
    const d = nextDoses([me], [med], [], N0030)[0]!
    expect(d).toMatchObject({ at: 1425, rel: -15, status: 'missed' })
    expect(doseDay(d, N0030)).toBe('2026-11-07')
  })
  it('00:30: a take at 23:50 Manila settles last night\'s dose, none is next', () => {
    expect(nextDoses([me], [med], [take('2026-11-07T15:50:00Z')], N0030)).toEqual([])
  })
  it('pillbox and adherence: today is the 8th at 00:30, the 7th shows its missed dose', () => {
    const w = pillbox({ personId: 'me', meds: [med], takes: [], now: N0030 })
    expect(w[6]).toMatchObject({ day: '2026-11-08', today: true })
    expect(w[5]!.pm.state).toBe('missed')
    expect(w[6]!.pm.state).toBe('open')
    const a = adherence([med], [], 'me', N0030)
    expect(a.cells[6]!.day).toBe('2026-11-08')
    expect(a.cells[6]!.label).toBe('Sun')
    expect(a.cells[5]!.label).toBe('Sat')
  })
  it('doseSeries counts a 23:50 Manila take on the 7th, not the 8th', () => {
    const p = doseSeries([med], [take('2026-11-07T15:50:00Z')], ['me'], N0030)[0]!.points
    expect(p[5]).toBe(100)
    expect(p[6]).toBe(0)
  })
})
