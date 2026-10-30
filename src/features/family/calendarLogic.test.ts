import { describe, expect, it } from 'vitest'
import { kindsOn, monthCells, rowsOn, weekSun, type CalSource } from './calendarLogic'

// Fri 30 Oct 2026 is the day under test (hand-computed: 25 Oct 2026 is a Sunday).
const FRI = '2026-10-30'
const at = (d: string, h: number, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString()
const src = (o: Partial<CalSource> = {}): CalSource => ({
  events: [], tasks: [], notes: [], appts: [], doses: () => [], nameOf: (id) => ({ m: 'Mama Rosa', j: 'Ate Joy' })[id ?? ''] ?? 'Family', ...o
})

describe('weekSun / monthCells', () => {
  it('week is Sunday 25 to Saturday 31 Oct 2026', () => {
    const w = weekSun(new Date(2026, 9, 30))
    expect(w.map((d) => d.getDate())).toEqual([25, 26, 27, 28, 29, 30, 31])
    expect(w[0]!.getDay()).toBe(0)
  })
  it('Oct 2026 month grid starts Sun 27 Sep, holds 5 whole weeks and flags the month', () => {
    const c = monthCells(new Date(2026, 9, 30))
    expect(c.length).toBe(35)
    expect(c[0]).toEqual({ day: '2026-09-27', num: 27, inMonth: false })
    expect(c.filter((x) => x.inMonth).length).toBe(31)
    expect(c[34]!.day).toBe('2026-10-31')
  })
  it('a month that spills into a sixth week gets 42 cells (Aug 2026 starts Saturday)', () => {
    expect(monthCells(new Date(2026, 7, 15)).length).toBe(42)
  })
})

describe('rowsOn', () => {
  it('lists dose, visit, event, task and a pinned note in time order, each tagged', () => {
    const s = src({
      doses: (d) => (d === FRI ? [{ personId: 'm', name: 'Losartan', dose: '50 mg', slot: '09:00' }] : []),
      appts: [{ personId: 'm', startsAt: at(FRI, 15), facility: 'Clinic', purpose: 'Dr. Santos: blood tests' }],
      events: [{ clientId: 'e', title: 'School program', startsAt: at(FRI, 16, 30), endsAt: null, allDay: false, personId: null }],
      tasks: [{ clientId: 't', title: 'Buy rice', due: FRI, assigneePersonId: 'j', done: false }],
      notes: [{ clientId: 'n', body: 'Bring the lab papers', pinned: true }]
    })
    const r = rowsOn(FRI, s, FRI)
    expect(r.map((x) => x.kind)).toEqual(['dose', 'visit', 'event', 'task', 'note'])
    expect(r[0]).toMatchObject({ title: 'Losartan 50 mg', sub: expect.stringMatching(/^Mama · 9:00/) })
    expect(r[1]!.sub).toMatch(/^Clinic · 3:00/)
    expect(r[3]!.sub).toBe('Ate')
  })
  it('pinned notes show on today only; an open overdue task shows on today only; a cancelled visit never', () => {
    const s = src({
      notes: [{ clientId: 'n', body: 'x', pinned: true }],
      tasks: [{ clientId: 't', title: 'Old', due: '2026-10-28', assigneePersonId: null, done: false }],
      appts: [{ personId: 'm', startsAt: at(FRI, 10), apptStatus: 'cancelled' }]
    })
    expect(rowsOn('2026-10-31', s, FRI)).toEqual([])
    const today = rowsOn(FRI, s, FRI)
    expect(today.map((x) => x.kind)).toEqual(['task', 'note'])
    expect(today[0]!.sub).toBe('Everyone · Overdue')
  })
  it('kindsOn gives each kind once, in fixed order; an empty day gives none', () => {
    const s = src({ tasks: [{ clientId: 'a', title: 'a', due: FRI, assigneePersonId: null, done: false }, { clientId: 'b', title: 'b', due: FRI, assigneePersonId: null, done: true }] })
    expect(kindsOn(FRI, s, FRI)).toEqual(['task'])
    expect(kindsOn('2026-10-29', s, FRI)).toEqual([])
  })
})
