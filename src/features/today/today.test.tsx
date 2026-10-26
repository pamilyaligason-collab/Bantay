import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FamilyEvent, FamilyTask } from '../family/store'
import type { Wx } from './heroCards'
import { todayRows } from './PlanToday'
import { weatherLine } from './weather'
import { activeDays } from './WeekLine'

const roster = vi.hoisted(() => ({ last: {} as Record<string, string> }))
vi.mock('../family/roster', () => ({
  useFamilyPeople: () => ({ selfId: 'me', people: [{ id: 'me', name: 'Lloyd' }, { id: 'ma', name: 'Ma' }, { id: 'pa', name: 'Pa' }] }),
  useCheckIns: () => roster.last,
  rollCall: (people: { id: string }[], last: Record<string, string>) => ({ ok: people.filter((p) => last[p.id]).length, total: people.length })
}))
import GreetingBand from './GreetingBand'

afterEach(cleanup)
const wx: Wx = { temp: 27.4, rainPct: 20, words: 'partly cloudy', at: '2026-10-19T00:00:00Z' }

describe('weatherLine', () => {
  it('one sentence with a rounded temperature', () => {
    expect(weatherLine(wx, new Date(2026, 9, 19, 9))).toBe('27° partly cloudy. Chance of rain today: 20%.')
  })
  it('unknown temperature gives no line, never 0', () => {
    expect(weatherLine({ ...wx, temp: null })).toBeNull()
    expect(weatherLine(null)).toBeNull()
  })
})

describe('GreetingBand', () => {
  it('before a check-in: the big button and the family count', () => {
    roster.last = { ma: new Date().toISOString() }
    render(<GreetingBand onOk={() => undefined} />)
    expect(screen.getByRole('button', { name: "I'm OK" })).toBeTruthy()
    expect(screen.getByText('1 of 2 others checked in today')).toBeTruthy()
  })
  it('after a check-in today the whole card is hidden', () => {
    roster.last = { me: new Date().toISOString() }
    const { container } = render(<GreetingBand onOk={() => undefined} />)
    expect(container.innerHTML).toBe('')
  })
  it('the card goes away live when a check-in arrives after mount', () => {
    roster.last = {}
    const { rerender, container } = render(<GreetingBand onOk={() => undefined} />)
    expect(screen.getByText('0 of 2 others checked in today')).toBeTruthy()
    roster.last = { me: new Date().toISOString(), ma: new Date().toISOString() }
    act(() => rerender(<GreetingBand onOk={() => undefined} />))
    expect(container.innerHTML).toBe('')
  })
  it('a check-in from yesterday does not count as checked in', () => {
    roster.last = { me: new Date(Date.now() - 36 * 3_600_000).toISOString() }
    render(<GreetingBand onOk={() => undefined} />)
    expect(screen.getByRole('button', { name: "I'm OK" })).toBeTruthy()
  })
})

describe('todayRows', () => {
  const now = new Date(2026, 9, 19, 10)
  const task = (o: Partial<FamilyTask>): FamilyTask => ({ clientId: 't', title: 'Task', due: '2026-10-19', assigneePersonId: null, done: false, ...o })
  const ev = (o: Partial<FamilyEvent>): FamilyEvent => ({ clientId: 'e', title: 'Event', startsAt: new Date(2026, 9, 19, 14).toISOString(), endsAt: null, allDay: false, personId: null, ...o })
  it('counts today tasks, keeps ticked ones, adds overdue open ones, skips other days and old done ones', () => {
    const r = todayRows([task({ clientId: 'a', done: true }), task({ clientId: 'b' }), task({ clientId: 'c', due: '2026-10-17' }), task({ clientId: 'd', due: '2026-10-17', done: true }), task({ clientId: 'f', due: '2026-10-20' })], [ev({}), ev({ clientId: 'x', startsAt: new Date(2026, 9, 20, 9).toISOString() })], now)
    expect(r.total).toBe(3)
    expect(r.done).toBe(1)
    expect(r.rows.map((x) => x.key)).toEqual(['c', 'a', 'b', 'e'])
    expect(r.rows[0]!.time).toBe('Overdue')
  })
  it('empty day: no rows and no 0 of 0', () => {
    expect(todayRows([], [], now)).toEqual({ rows: [], done: 0, total: 0 })
  })
})

describe('activeDays', () => {
  const now = new Date(2026, 9, 19, 10)
  const row = (kind: string, d: number, o: object = {}) => ({ kind, minutes: null, steps: null, startedAt: new Date(2026, 9, 19 - d, 9).toISOString(), ...o })
  it('counts days with a walk or steps, once each, inside the last 7 days', () => {
    expect(activeDays([row('walk', 0, { minutes: 20 }), row('walk', 0, { minutes: 10 }), row('steps', 2, { steps: 4000 }), row('walk', 9, { minutes: 30 }), row('check-in', 1), row('sleep', 1, { minutes: 400 }), row('steps', 3, { steps: 0 })], now)).toBe(2)
  })
})
