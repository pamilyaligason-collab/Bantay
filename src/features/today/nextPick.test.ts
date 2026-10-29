import { describe, expect, it } from 'vitest'
import type { MedTaken, Medication } from '../log/store'
import type { HeroCard } from './heroCards'
import { joinNames, nextDoses, pickNext, whenLine } from './nextPick'

const at = (h: number, m = 0) => new Date(2026, 9, 19, h, m)
const med = (o: Partial<Medication> & { personId: string; name: string; times: string[] }): Medication => ({ serverId: `${o.personId}-${o.name}`, medStatus: 'active', schedule: { v: 1, times: o.times }, ...o })
const me = { personId: 'me', name: 'Lloyd', isMe: true }
const ma = { personId: 'ma', name: 'Ma', isMe: false }
const meds = [med({ personId: 'me', name: 'Losartan', times: ['08:00'] }), med({ personId: 'ma', name: 'Aspirin', times: ['10:00'] }), med({ personId: 'ma', name: 'Hydroxurea', times: ['10:00'] })]
const plan: HeroCard = { key: 'plan:1', kind: 'plan', kicker: 'Plan · today', title: 'Next: Pay bills', body: 'Due today', actions: [] }
const none = { due: [], plan: null, storm: null }

describe('nextDoses', () => {
  it('a dose due within 3 hours is next; later ones are not', () => {
    expect(nextDoses([me], meds, [], at(5, 30))[0]).toMatchObject({ personId: 'me', at: 480, status: 'upcoming' })
    expect(nextDoses([me], meds, [], at(4, 59))).toEqual([])
  })
  it('a dose missed within the last 2 hours stays; older ones drop off', () => {
    expect(nextDoses([me], meds, [], at(9, 30))[0]).toMatchObject({ status: 'missed' })
    expect(nextDoses([me], meds, [], at(10, 1))).toEqual([])
  })
  it('taken or skipped doses are not next', () => {
    const t = (o: Partial<MedTaken>): MedTaken => ({ personId: 'me', name: 'Losartan', takenAt: at(8, 5).toISOString(), medicationId: 'me-Losartan', slot: '08:00', ...o })
    expect(nextDoses([me], meds, [t({})], at(8, 30))).toEqual([])
    expect(nextDoses([me], meds, [t({ skipped: true })], at(8, 30))).toEqual([])
  })
  it('covers the people I care for, groups medicines at one time, earliest first', () => {
    const d = nextDoses([me, ma], meds, [], at(9, 30))
    expect(d.map((x) => x.personId)).toEqual(['me', 'ma'])
    expect(d[1]!.slots.map((s) => s.name).sort()).toEqual(['Aspirin', 'Hydroxurea'])
  })
  it('paused medicines and people not passed in give nothing', () => {
    expect(nextDoses([me], [med({ personId: 'me', name: 'X', times: ['08:00'], medStatus: 'paused' })], [], at(8))).toEqual([])
    expect(nextDoses([], meds, [], at(8))).toEqual([])
  })
})

describe('nextDoses across midnight', () => {
  const sleeper = med({ personId: 'me', name: 'Sleeper', times: ['23:00'] })
  const early = med({ personId: 'me', name: 'Early', times: ['00:30'] })
  const on = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m)
  it('a 23:00 dose stays open until 01:00 the next morning', () => {
    expect(nextDoses([me], [sleeper], [], on(20, 0, 30))[0]).toMatchObject({ status: 'missed', at: 1380 })
    expect(nextDoses([me], [sleeper], [], on(20, 1, 1))).toEqual([])
  })
  it('a 00:30 dose shows from 21:30 the evening before', () => {
    expect(nextDoses([me], [early], [], on(19, 21, 30))[0]).toMatchObject({ status: 'upcoming', at: 30 })
    expect(nextDoses([me], [early], [], on(19, 21, 29))).toEqual([])
  })
  it("yesterday's take clears yesterday's slot", () => {
    const t: MedTaken = { personId: 'me', name: 'Sleeper', takenAt: on(19, 23, 5).toISOString(), medicationId: 'me-Sleeper', slot: '23:00' }
    expect(nextDoses([me], [sleeper], [t], on(20, 0, 30))).toEqual([])
  })
})

describe('pickNext', () => {
  const due = nextDoses([ma], meds, [], at(9, 30))
  it('a dose beats the plan, a storm and everything else; weather is never picked', () => {
    const storm = { title: 'Pepito is near', body: 'about 400 km east of you' }
    expect(pickNext({ due, plan, storm }).kind).toBe('dose')
    expect(pickNext({ ...none, plan, storm }).kind).toBe('plan')
    expect(pickNext({ ...none, storm }).kind).toBe('storm') // a storm within 500 km (the caller filters by distance)
    expect(pickNext(none).kind).toBe('calm')
    expect(pickNext({ ...none, weather: { temp: 40, rainPct: 99 } } as never).kind).toBe('calm')
  })
  it('names who and what for a family member, just the medicine for me', () => {
    expect(pickNext({ ...none, due }, at(9, 30)).title).toBe('Ma: Aspirin and Hydroxurea')
    expect(pickNext({ ...none, due: nextDoses([me], meds, [], at(8)) }, at(8)).title).toBe('Losartan')
  })
  it('the card kicker says Next up (the heading is visually hidden), the calm pick is only a signal', () => {
    expect(pickNext({ ...none, due }, at(9, 30)).kicker).toBe('Next up · medicine')
    expect(pickNext({ ...none, due: nextDoses([ma], meds, [], at(10, 30)) }, at(10, 30)).kicker).toBe('Late · not taken yet')
    const late = pickNext({ ...none, due: nextDoses([ma], meds, [], at(10, 30)) }, at(10, 30))
    expect(late.late).toBe(true)
    expect(late.note).toBe('On time until 12:00 PM.') // slot 10:00 + the 2 h of doseCount's ON_TIME_MIN
    expect(pickNext({ ...none, due }, at(9, 30)).late).toBe(false)
    expect(pickNext(none).kind).toBe('calm')
  })
  it('when line: time, minutes away, dose text; parts that are missing are left out', () => {
    const withDose = nextDoses([me], [med({ personId: 'me', name: 'Losartan', times: ['20:00'], dose: '1 tablet' })], [], at(19, 20))
    expect(whenLine(withDose[0]!, at(19, 20))).toBe('8:00 PM · in 40 min · 1 tablet')
    expect(whenLine(withDose[0]!, at(20, 25))).toBe('8:00 PM · 25 min ago · 1 tablet')
    const bare = nextDoses([me], [med({ personId: 'me', name: 'Losartan', times: ['20:00'] })], [], at(17, 55))
    expect(whenLine(bare[0]!, at(17, 55))).toBe('8:00 PM · in 2 h 5 min')
  })
  it('names who is also waiting in a note', () => {
    expect(pickNext({ ...none, due: nextDoses([me, ma], meds, [], at(9, 30)) }, at(9, 30)).note).toContain('Also waiting: Ma.')
  })
  it('joinNames', () => { expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C') })
})
