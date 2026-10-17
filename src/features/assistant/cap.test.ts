import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { manilaDay, takeMessage } from './cap'

beforeEach(() => db.kv.clear())

describe('daily cap', () => {
  it('uses the Asia/Manila day', () => {
    expect(manilaDay(new Date('2026-10-17T16:30:00Z'))).toBe('2026-10-18')
    expect(manilaDay(new Date('2026-10-17T15:30:00Z'))).toBe('2026-10-17')
  })
  it('allows up to the limit, then refuses without counting', async () => {
    const t = new Date('2026-10-17T02:00:00Z')
    for (let i = 0; i < 3; i++) expect(await takeMessage(3, t)).toBe(true)
    expect(await takeMessage(3, t)).toBe(false)
    expect((await db.kv.get('assistant.cap'))?.value).toEqual({ day: '2026-10-17', count: 3 })
  })
  it('resets on the next Manila day', async () => {
    await takeMessage(1, new Date('2026-10-17T02:00:00Z'))
    expect(await takeMessage(1, new Date('2026-10-17T02:00:00Z'))).toBe(false)
    expect(await takeMessage(1, new Date('2026-10-17T17:00:00Z'))).toBe(true)
  })
})
