import { beforeEach, describe, expect, it, vi } from 'vitest'
import homeCss from './home.css?raw'

// One mock for both loaders: rpc answers per person, table selects answer per table.
const h = vi.hoisted(() => {
  const st = {
    rpc: {} as Record<string, { data: unknown; error: unknown }>,
    tables: {} as Record<string, { data: unknown; error: unknown }>,
    usagePages: [] as { data: unknown; error: unknown }[]
  }
  const sb = {
    rpc: (_fn: string, a: { p_person: string }) => Promise.resolve(st.rpc[a.p_person]),
    from: (t: string) => {
      let page = -1
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'gte', 'lte', 'eq', 'order']) b[m] = () => b
      b.range = (from: number) => { page = from / 1000; return b }
      b.then = (res: (v: unknown) => unknown) => Promise.resolve(t === 'usage_events' ? st.usagePages[page] : st.tables[t]).then(res)
      return b
    }
  }
  return { st, sb }
})
vi.mock('../../auth/client', () => ({ supabase: h.sb }))

import { listExpiringIds } from './logsApi'
import { loadActiveWeeks, loadExpiring } from './homeApi'

const id = (i: string, expires_on: string | null, status = 'confirmed') => ({ id: i, source: 'id', label: 'x', plan: null, last4: null, issued_on: null, expires_on, status, source_file_id: null, confidence: null })
beforeEach(() => { h.st.rpc = {}; h.st.tables = {}; h.st.usagePages = [] })

describe('listExpiringIds', () => {
  it('sorts soonest first, keeps expired, skips rejected, unknown dates and ones past 60 days', async () => {
    h.st.rpc.p1 = { data: [id('a', '2026-11-20'), id('b', '2026-10-01'), id('c', '2026-11-05', 'rejected'), id('d', null), id('e', '2026-12-31')], error: null }
    h.st.rpc.p2 = { data: [id('f', '2026-10-23')], error: null }
    const r = await listExpiringIds(['p1', 'p2'], '2026-10-22')
    expect(r.ok && r.data.map((x) => [x.id, x.person_id, x.days])).toEqual([['b', 'p1', -21], ['f', 'p2', 1], ['a', 'p1', 29]])
  })
  it('is an error when any one person fails', async () => {
    h.st.rpc.p1 = { data: [id('a', '2026-11-20')], error: null }
    h.st.rpc.p2 = { data: null, error: { message: 'boom' } }
    expect((await listExpiringIds(['p1', 'p2'], '2026-10-22')).ok).toBe(false)
  })
})

describe('Home expiring tile follows the list rule', () => {
  it('counts 0 to 60 days ahead, skips rejected, leaves expired to the list flag', async () => {
    const now = new Date('2026-10-22T04:00:00Z') // Manila 2026-10-22
    h.st.tables.person_identifiers = { data: [{ expires_on: '2026-10-22', status: 'confirmed' }, { expires_on: '2026-12-21', status: 'draft' }, { expires_on: '2026-11-01', status: 'rejected' }], error: null }
    h.st.tables.insurance_policies = { data: [{ valid_to: '2026-11-30', status: 'confirmed' }, { valid_to: '2026-11-30', status: 'rejected' }], error: null }
    expect(await loadExpiring(now)).toEqual({ ok: true, data: 3 })
  })
})

describe('loadActiveWeeks', () => {
  const now = new Date('2026-10-22T04:00:00Z')
  const full = { data: Array.from({ length: 1000 }, () => ({ user_id: 'a', at: '2026-10-21T01:00:00Z' })), error: null }
  it('reports unknown (not a low number) when it hits the 20k cap', async () => {
    h.st.usagePages = Array.from({ length: 20 }, () => full)
    expect((await loadActiveWeeks(now)).ok).toBe(false)
  })
  it('answers when the last page is short', async () => {
    h.st.usagePages = [{ data: [{ user_id: 'a', at: '2026-10-21T01:00:00Z' }], error: null }]
    expect(await loadActiveWeeks(now)).toEqual({ ok: true, data: { cur: ['a'], prev: [] } })
  })
})

describe('chart axis text', () => {
  it('is never under 12 px', () => {
    const sizes = [...homeCss.matchAll(/\.hm-axis\s*\{[^}]*font-size:\s*(\d+)px/g)].map((m) => Number(m[1]))
    expect(sizes.length).toBeGreaterThan(0)
    for (const n of sizes) expect(n).toBeGreaterThanOrEqual(12)
  })
})
