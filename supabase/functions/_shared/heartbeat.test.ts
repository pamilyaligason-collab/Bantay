import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALERT_WINDOW_S, countsOnly, heartbeat, systemRef, type HeartbeatClient } from './heartbeat'

type Call = { table: string; op: string; arg: unknown }

/** A fake service-role client: records inserts, answers the admin lookup, can fail a table. */
function fake(opts: { admins?: string[]; failInsert?: string[]; throwFrom?: boolean } = {}) {
  const calls: Call[] = []
  const sb: HeartbeatClient = {
    from(table: string) {
      if (opts.throwFrom) throw new Error('boom')
      return {
        insert: async (row: unknown) => {
          calls.push({ table, op: 'insert', arg: row })
          return { error: opts.failInsert?.includes(table) ? { code: '23505' } : null }
        },
        select: (cols: string) => ({
          eq: (c1: string, v1: unknown) => ({
            eq: async (c2: string, v2: unknown) => {
              calls.push({ table, op: 'select', arg: [cols, c1, v1, c2, v2] })
              return { data: (opts.admins ?? []).map((user_id) => ({ user_id })), error: null }
            }
          })
        })
      }
    }
  }
  return { sb, calls }
}

afterEach(() => vi.useRealTimers())

describe('heartbeat', () => {
  it('an ok run writes exactly one job_runs row and no alert', async () => {
    const { sb, calls } = fake({ admins: ['a1'] })
    await heartbeat(sb, 'dose-watch', true, { sent: 3 })
    expect(calls).toEqual([{ table: 'job_runs', op: 'insert', arg: { job: 'dose-watch', ok: true, summary: { sent: 3 } } }])
  })

  it('a failed run also raises one system alert per admin, person_id null, ref job:window', async () => {
    vi.useFakeTimers(); vi.setSystemTime(ALERT_WINDOW_S * 5 * 1000 + 1234) // window 5, hand-computed
    const { sb, calls } = fake({ admins: ['a1', 'a2'] })
    await heartbeat(sb, 'records-extract', false, { documents: 2, failed: 2 })
    expect(calls.filter((c) => c.table === 'job_runs')).toEqual([{ table: 'job_runs', op: 'insert', arg: { job: 'records-extract', ok: false, summary: { documents: 2, failed: 2 } } }])
    expect(calls.find((c) => c.op === 'select')?.arg).toEqual(['user_id', 'role', 'admin', 'disabled', false])
    expect(calls.filter((c) => c.table === 'carer_alerts').map((c) => c.arg)).toEqual([
      { kind: 'system', template: 'system', person_id: null, carer_user_id: 'a1', ref: 'records-extract:5' },
      { kind: 'system', template: 'system', person_id: null, carer_user_id: 'a2', ref: 'records-extract:5' }
    ])
  })

  it('the ref changes every 6 hours, not before', () => {
    const six = ALERT_WINDOW_S * 1000
    expect(systemRef('j', 0)).toBe('j:0')
    expect(systemRef('j', six - 1)).toBe('j:0')
    expect(systemRef('j', six)).toBe('j:1')
    expect(systemRef('j', 3 * six + 5)).toBe('j:3')
  })

  it('a duplicate alert for one admin does not stop the next admin, and nothing throws', async () => {
    const { sb, calls } = fake({ admins: ['a1', 'a2'], failInsert: ['carer_alerts'] })
    await expect(heartbeat(sb, 'alerts-ingest', false)).resolves.toBeUndefined()
    expect(calls.filter((c) => c.table === 'carer_alerts')).toHaveLength(2)
  })

  it('no admin, no alert; a client that throws never throws into the job', async () => {
    const { sb, calls } = fake({ admins: [] })
    await heartbeat(sb, 'dose-watch', false)
    expect(calls.filter((c) => c.table === 'carer_alerts')).toHaveLength(0)
    await expect(heartbeat(fake({ throwFrom: true }).sb, 'dose-watch', false)).resolves.toBeUndefined()
  })

  it('an empty job name writes nothing', async () => {
    const { sb, calls } = fake()
    await heartbeat(sb, '', true)
    expect(calls).toEqual([])
  })

  it('a job name is cut to 64 characters (the table check)', async () => {
    const { sb, calls } = fake()
    await heartbeat(sb, 'x'.repeat(80), true)
    expect((calls[0]!.arg as { job: string }).job).toHaveLength(64)
  })
})

describe('countsOnly (B-7)', () => {
  it('keeps finite numbers and booleans under plain keys, drops text, arrays, objects and odd keys', () => {
    expect(countsOnly({ sent: 2, ok: true, errors: ['Mama 150/90'], name: 'Mama', nested: { a: 1 }, nan: NaN, inf: Infinity, 'Bad Key': 1, none: null, undef: undefined, zero: 0 }))
      .toEqual({ sent: 2, ok: true, zero: 0 })
  })
  it('caps at 20 keys and tolerates undefined', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]))
    expect(Object.keys(countsOnly(many))).toHaveLength(20)
    expect(countsOnly(undefined)).toEqual({})
  })
})
