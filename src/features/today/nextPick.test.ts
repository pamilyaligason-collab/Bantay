import { describe, expect, it } from 'vitest'
import type { HeroCard, Wx } from './heroCards'
import { dueMeds, joinNames, pickNext } from './nextPick'

const at = (h: number, m = 0) => new Date(2026, 9, 19, h, m)
const ma = { personId: 'ma', name: 'Ma', isMe: false, entries: ['Hydroxurea 8:00', 'Aspirin 8:00', 'Calcium 20:00'] }
const me = { personId: 'me', name: 'Lloyd', isMe: true, entries: ['Losartan 7:00'] }
const plan: HeroCard = { key: 'plan:1', kind: 'plan', kicker: 'Plan · today', title: 'Next: Pay bills', body: 'Due today', actions: [] }
const wx = (o: Partial<Wx>): Wx => ({ temp: 28, rainPct: 10, words: 'clear', at: '2026-10-19T00:00:00Z', ...o })
const none = { due: [], plan: null, storm: null, weather: null, placeName: 'Dampas', now: at(9) }

describe('dueMeds', () => {
  it('lists timed medicines whose time has passed, not later ones or ones with no time', () => {
    const d = dueMeds([ma, { ...me, entries: ['Vitamin C'] }], [], [], at(9))
    expect(d).toEqual([{ personId: 'ma', name: 'Ma', isMe: false, meds: ['Hydroxurea', 'Aspirin'], at: 480, skipKeys: ['Hydroxurea@480', 'Aspirin@480'] }])
    expect(dueMeds([ma], [], [], at(7, 59))).toEqual([])
  })
  it('a take today clears that medicine; me comes first', () => {
    const taken = [{ personId: 'ma', name: 'aspirin', takenAt: at(8, 5).toISOString() }]
    expect(dueMeds([ma], taken, [], at(9))[0]!.meds).toEqual(['Hydroxurea'])
    expect(dueMeds([ma, me], [], [], at(9)).map((x) => x.personId)).toEqual(['me', 'ma'])
  })
  it('skipping the 8:00 dose leaves my 20:00 dose due', () => {
    const m = { ...me, entries: ['Metformin 8:00,20:00'] }
    const d = dueMeds([m], [], ['Metformin@480'], at(20, 30))
    expect(d[0]!.at).toBe(1200)
    expect(d[0]!.skipKeys).toEqual(['Metformin@1200'])
  })
  it('skip counts for me only', () => {
    expect(dueMeds([me], [], ['Losartan'], at(9))).toEqual([])
    expect(dueMeds([ma], [], ['Aspirin', 'Hydroxurea'], at(9))).toHaveLength(1) // still on the list for Ma
  })
})

describe('pickNext', () => {
  const due = dueMeds([ma], [], [], at(9))
  it('ranks medicine, plan, storm, weather, then all clear', () => {
    const storm = { title: 'Pepito is near', body: 'about 400 km east of you' }
    const rain = wx({ rainPct: 80 })
    expect(pickNext({ ...none, due, plan, storm, weather: rain }).kind).toBe('dose')
    expect(pickNext({ ...none, plan, storm, weather: rain }).kind).toBe('plan')
    expect(pickNext({ ...none, storm, weather: rain }).kind).toBe('storm')
    expect(pickNext({ ...none, weather: rain }).kind).toBe('weather')
    expect(pickNext(none).kind).toBe('calm')
  })
  it('names who and what for a family member, plain "Time for" for me', () => {
    expect(pickNext({ ...none, due }).title).toBe('Ma: Hydroxurea and Aspirin')
    expect(pickNext({ ...none, due: dueMeds([me], [], [], at(9)) }).title).toBe('Time for Losartan')
  })
  it('weather only from 60% rain or 33 C; unknown temperature is not weather', () => {
    expect(pickNext({ ...none, weather: wx({ rainPct: 59 }) }).kind).toBe('calm')
    expect(pickNext({ ...none, weather: wx({ temp: 34 }) }).kind).toBe('weather')
    expect(pickNext({ ...none, weather: wx({ temp: null, rainPct: 90 }) }).kind).toBe('calm')
  })
  it('joinNames', () => { expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C') })
})
