import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearFeed, db, drain, enqueue } from './db'

beforeEach(async () => {
  await db.outbox.clear()
  await db.kv.clear()
})

describe('outbox', () => {
  it('enqueue stores a row with tries 0', async () => {
    const id = await enqueue('t', 'insert', { n: 1 })
    const row = await db.outbox.get(id)
    expect(row).toMatchObject({ table: 't', op: 'insert', payload: { n: 1 }, tries: 0 })
    expect(typeof row?.createdAt).toBe('number')
  })

  it('drain deletes a row only after sendFn resolves', async () => {
    await enqueue('t', 'insert', { n: 1 })
    await enqueue('t', 'insert', { n: 2 })
    const seen: number[] = []
    const sent = await drain(async (row) => {
      // row must still exist while sending
      expect(await db.outbox.get(row.id!)).toBeDefined()
      seen.push((row.payload as { n: number }).n)
    })
    expect(sent).toBe(2)
    expect(seen).toEqual([1, 2])
    expect(await db.outbox.count()).toBe(0)
  })

  it('drain keeps the row and increments tries when sendFn rejects, and stops', async () => {
    await enqueue('t', 'insert', { n: 1 })
    await enqueue('t', 'insert', { n: 2 })
    let calls = 0
    const sent = await drain(async () => {
      calls++
      throw new Error('offline')
    })
    expect(sent).toBe(0)
    expect(calls).toBe(1)
    const rows = await db.outbox.orderBy('id').toArray()
    expect(rows.map((r) => r.tries)).toEqual([1, 0])
  })

  it('kv table round-trips', async () => {
    await db.kv.put({ key: 'theme', value: 'dark' })
    expect((await db.kv.get('theme'))?.value).toBe('dark')
  })
})

describe('feed', () => {
  it('clearFeed empties the table that holds other members\' shared values', async () => {
    await db.feed.put({ id: 'bp|1', kind: 'bp', personId: 'p2', at: '2026-11-05T00:00:00.000Z', titleKey: '', valueText: '148/90 mmHg', chip: null, photoPath: null, rowId: '1' })
    expect(await db.feed.count()).toBe(1)
    await clearFeed()
    expect(await db.feed.count()).toBe(0)
  })
})
