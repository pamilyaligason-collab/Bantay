import { describe, expect, it } from 'vitest'
import { groupPlan, pickDay, repeatDays, dayLabel } from './planList'
import type { FamilyEvent, FamilyNote, FamilyTask } from './store'

// Wed 21 Oct 2026, 10:00 on the phone's clock (Manila for this family). Its week ends Sun 25 Oct.
const NOW = new Date(2026, 9, 21, 10, 0, 0)
const task = (clientId: string, due: string | null, done = false): FamilyTask => ({ clientId, title: clientId, due, assigneePersonId: null, done })
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()
const event = (clientId: string, startsAt: string, allDay = false): FamilyEvent => ({ clientId, title: clientId, startsAt, endsAt: null, allDay, personId: null })
const note = (clientId: string, pinned: boolean, id: number): FamilyNote => ({ id, clientId, body: clientId, pinned })
const keys = (rows: { key: string }[]) => rows.map((r) => r.key)

describe('groupPlan', () => {
  it('splits by the local day: today (with overdue), rest of the week, later, done', () => {
    const g = groupPlan(
      [task('overdue', '2026-10-19'), task('today', '2026-10-21'), task('sun', '2026-10-25'), task('mon', '2026-10-26'), task('someday', null), task('ticked', '2026-10-21', true)],
      [event('dinner', at(21, 18, 30)), event('fri', at(23, 9)), event('next', at(30, 9)), event('past', at(20, 9))],
      [],
      NOW
    )
    expect(keys(g.today)).toEqual(['overdue', 'dinner', 'today'])
    expect(keys(g.week)).toEqual(['fri', 'sun'])
    expect(keys(g.later)).toEqual(['mon', 'next', 'someday'])
    expect(keys(g.done)).toEqual(['ticked', 'past'])
    expect(g.today[0]).toMatchObject({ overdue: true })
  })

  it('orders a day by time and puts all-day first', () => {
    const g = groupPlan([], [event('late', at(21, 20)), event('early', at(21, 8)), event('allday', at(21, 0), true)], [], NOW)
    expect(keys(g.today)).toEqual(['allday', 'early', 'late'])
  })

  it('uses the local day at the edges: 23:30 is still today, 00:10 is tomorrow', () => {
    const g = groupPlan([], [event('night', at(21, 23, 30)), event('after', at(22, 0, 10))], [], NOW)
    expect(keys(g.today)).toEqual(['night'])
    expect(keys(g.week)).toEqual(['after'])
  })

  it('puts pinned notes at the top of Today and loose notes in Later', () => {
    const g = groupPlan([task('t', '2026-10-21')], [], [note('gate', true, 1), note('wifi', false, 2)], NOW)
    expect(keys(g.today)).toEqual(['gate', 't'])
    expect(keys(g.later)).toEqual(['wifi'])
  })

  it('on a Sunday the week is that day, so tomorrow is Later', () => {
    const sun = new Date(2026, 9, 25, 9, 0)
    const g = groupPlan([task('mon', '2026-10-26')], [], [], sun)
    expect(keys(g.later)).toEqual(['mon'])
    expect(g.week).toEqual([])
  })
})

describe('quick picks and repeat', () => {
  it('resolves today, tomorrow and the coming Saturday; none for date and none', () => {
    expect(pickDay('today', NOW)).toBe('2026-10-21')
    expect(pickDay('tomorrow', NOW)).toBe('2026-10-22')
    expect(pickDay('weekend', NOW)).toBe('2026-10-24')
    expect(pickDay('weekend', new Date(2026, 9, 25))).toBe('2026-10-25')
    expect(pickDay('date', NOW)).toBeNull()
    expect(pickDay('none', NOW)).toBeNull()
  })
  it('expands a repeat across month ends', () => {
    expect(repeatDays('2026-10-21', 'none')).toEqual(['2026-10-21'])
    const d = repeatDays('2026-10-28', 'daily')
    expect(d).toHaveLength(14)
    expect(d[4]).toBe('2026-11-01')
    const w = repeatDays('2026-10-21', 'weekly')
    expect(w).toHaveLength(8)
    expect(w[2]).toBe('2026-11-04')
  })
  it('labels the day', () => {
    expect(dayLabel('2026-10-21', NOW)).toBe('Today')
    expect(dayLabel('2026-10-22', NOW)).toBe('Tomorrow')
  })
})
