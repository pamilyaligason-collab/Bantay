import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { EVENT_NAMES, track } from './events'
import { pinError } from './pin'

describe('track allowlist (B-7)', () => {
  beforeEach(() => db.outbox.clear())
  it('queues an allowed event with only kind, name and appVersion', async () => {
    expect(await track('screen', 'health')).toBe(true)
    const rows = await db.outbox.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ table: 'usage_events', op: 'insert' })
    expect(Object.keys(rows[0]!.payload as object).sort()).toEqual(['appVersion', 'kind', 'name'])
  })
  it('drops unknown kinds, unknown names and digit-bearing names', async () => {
    for (const [k, n] of [['reading', 'health'], ['screen', 'bp_150'], ['screen', 'health2'], ['action', '120/80'], ['screen', ''], ['__proto__', 'x'], ['constructor', 'today'], ['action', 'Health']]) {
      expect(await track(k!, n!), `${k}/${n}`).toBe(false)
    }
    expect(await db.outbox.count()).toBe(0)
  })
  it('every allowed name is letters and underscores only (matches the DB check)', () => {
    for (const names of Object.values(EVENT_NAMES)) for (const n of names) expect(n).toMatch(/^[a-z_]{1,40}$/)
  })
})

describe('pinError', () => {
  it('accepts a good PIN and rejects the weak ones', () => {
    expect(pinError('483920')).toBeNull()
    expect(pinError('12345')).not.toBeNull()
    expect(pinError('1234567')).not.toBeNull()
    expect(pinError('12345a')).not.toBeNull()
    expect(pinError('111111')).not.toBeNull()
    expect(pinError('123456')).not.toBeNull()
  })
})
