import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { fdb } from '../family/store'
import { planCard } from './planCard'

describe('planCard', () => {
  beforeEach(async () => { await fdb.events.clear(); await fdb.tasks.clear() })
  it('skips a timed event that started over an hour ago', async () => {
    const now = new Date('2026-10-19T09:00:00Z') // 5 PM Manila
    await fdb.events.add({ id: 'e1', title: 'Breakfast', startsAt: '2026-10-19T00:00:00Z', allDay: false } as never)
    await fdb.events.add({ id: 'e2', title: 'Dinner', startsAt: '2026-10-19T10:30:00Z', allDay: false } as never)
    const card = await planCard(now)
    expect(card?.title).toBe('Next: Dinner')
  })
})

describe('todayRows masking (D-109)', () => {
  it('another person\'s event reads Doctors & Lab Appointments; own, whole-family and tasks keep titles', async () => {
    const { todayRows } = await import('./PlanToday')
    const now = new Date('2026-10-19T01:00:00Z')
    const ev = (id: string, title: string, personId: string | null) => ({ clientId: id, title, startsAt: '2026-10-19T02:00:00Z', allDay: false, personId }) as never
    const task = { clientId: 't1', title: 'Buy rice', due: '2026-10-19', done: false } as never
    const { rows } = todayRows([task], [ev('a', 'Dentist', 'ma'), ev('b', 'Checkup', 'me'), ev('c', 'Fiesta', null)], now, 'me')
    const titles = rows.map((r) => r.title)
    expect(titles).toEqual(expect.arrayContaining(['Buy rice', 'Doctors & Lab Appointments', 'Checkup', 'Fiesta']))
    expect(JSON.stringify(rows.map(({ title, time, sort }) => ({ title, time, sort })))).not.toContain('Dentist')
  })
})

describe('planCard masking (D-109)', () => {
  beforeEach(async () => { await fdb.events.clear(); await fdb.tasks.clear() })
  it('another person\'s next event reads Doctors & Lab Appointments and keeps its time; own and whole-family keep the title', async () => {
    const now = new Date('2026-10-19T01:00:00Z') // 9 AM Manila
    await fdb.events.add({ id: 'e1', clientId: 'e1', title: 'Dentist', startsAt: '2026-10-19T02:00:00Z', allDay: false, personId: 'ma' } as never)
    const other = await planCard(now, 'me')
    expect(other?.title).toBe('Next: Doctors & Lab Appointments')
    expect(JSON.stringify(other)).not.toContain('Dentist')
    expect(other?.body).toMatch(/^At 10/)
    expect((await planCard(now, null))?.title).toBe('Next: Doctors & Lab Appointments')
    expect((await planCard(now, 'ma'))?.title).toBe('Next: Dentist')
    await fdb.events.clear()
    await fdb.events.add({ id: 'e2', clientId: 'e2', title: 'Fiesta', startsAt: '2026-10-19T02:00:00Z', allDay: false, personId: null } as never)
    expect((await planCard(now, 'me'))?.title).toBe('Next: Fiesta')
  })
})
