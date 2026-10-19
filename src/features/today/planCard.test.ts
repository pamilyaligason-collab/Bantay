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
