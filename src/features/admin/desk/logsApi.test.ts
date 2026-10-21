import { beforeEach, describe, expect, it, vi } from 'vitest'
import logsSource from './logsApi.ts?raw'

const h = vi.hoisted(() => {
  const calls: { fn: string; args: unknown[] }[] = []
  // Chainable query recorder: every method logs itself and returns the chain; awaiting it resolves to `result`.
  const result = { data: [] as unknown, error: null as unknown }
  const chain: Record<string, unknown> = {}
  const log = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }); return chain }
  for (const m of ['select', 'update', 'eq', 'gte', 'lt', 'order', 'range', 'limit', 'single']) chain[m] = log(m)
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  const sb = { from: log('from'), rpc: log('rpc') }
  return { calls, result, sb }
})
vi.mock('../../auth/client', () => ({ supabase: h.sb }))

import { canRetry, dedupeCounts, editPatch, errorWords, FILE_COLS, last4Of, listAudit, listFiles, maskNumber, noAuditTable, numberPatch, PAGE, RETRY_PATCH, retryFile, isExpired } from './logsApi'

const names = () => h.calls.map((c) => c.fn)
beforeEach(() => { h.calls.length = 0; h.result.data = []; h.result.error = null })

describe('mask', () => {
  it('shows only the last 4 and masks fully under 8 characters, for lengths 0..20', () => {
    for (let n = 0; n <= 20; n++) {
      const num = 'A1b2C3d4E5f6G7h8I9j0'.slice(0, n)
      const m = maskNumber(last4Of(num))
      if (n < 8) expect(m).toBe('••••••••')
      else { expect(m).toBe(`•••• ${num.slice(-4)}`); expect(m.replace(/[•\s]/g, '')).toHaveLength(4) }
    }
    expect(maskNumber(null)).toBe('••••••••')
    expect(maskNumber(undefined)).toBe('••••••••')
    expect(last4Of(null)).toBeNull()
  })
})

describe('no number columns in a table select', () => {
  it('logsApi source never names id_number or member_no inside a select()', () => {
    const src = logsSource
    const selects = [...src.matchAll(/select\(\s*(['"`])([^'"`]*)\1/g)].map((m) => m[2]).concat(FILE_COLS)
    expect(selects.length).toBeGreaterThan(3)
    for (const s of selects) expect(s).not.toMatch(/id_number|member_no/)
  })
  it('edits never carry a number column', () => {
    for (const source of ['id', 'insurance'] as const) {
      const p = editPatch(source, { label: 'x', plan: 'y', issued_on: '', expires_on: '2027-01-01', status: 'draft' })
      expect(Object.keys(p).join()).not.toMatch(/number|member_no/)
    }
    expect(numberPatch('id', ' 123 ')).toEqual({ id_number: '123' })
    expect(numberPatch('insurance', ' 123 ')).toEqual({ member_no: '123' })
    expect(editPatch('id', { label: 'sss', plan: null, issued_on: ' ', expires_on: null, status: 'draft' })).toMatchObject({ issued_on: null, expires_on: null })
  })
  it('isExpired is false for unknown dates', () => {
    expect(isExpired(null)).toBe(false)
    expect(isExpired('2000-01-01')).toBe(true)
    expect(isExpired('2999-01-01')).toBe(false)
  })
})

describe('retry', () => {
  it('only a failed file with an uploaded copy', () => {
    expect(canRetry({ ingest_status: 'failed', storage_path: 'p/a.jpg' })).toBe(true)
    expect(canRetry({ ingest_status: 'failed', storage_path: null })).toBe(false)
    expect(canRetry({ ingest_status: 'done', storage_path: 'p/a.jpg' })).toBe(false)
  })
  it('resets status, tries and error, and only on a still-failed row', async () => {
    h.result.data = [{ id: 'f1' }]
    expect(await retryFile('f1')).toEqual({ ok: true, data: null })
    expect(h.calls.find((c) => c.fn === 'update')?.args[0]).toEqual({ ingest_status: 'new', ingest_tries: 0, ingest_error: null })
    expect(RETRY_PATCH).toEqual({ ingest_status: 'new', ingest_tries: 0, ingest_error: null })
    expect(h.calls.filter((c) => c.fn === 'eq').map((c) => c.args)).toEqual([['id', 'f1'], ['ingest_status', 'failed']])
  })
  it('a row RLS hides counts as forbidden', async () => {
    h.result.data = []
    expect(await retryFile('f1')).toMatchObject({ ok: false, error: 'forbidden' })
  })
})

describe('files and errors', () => {
  it('filters by status and person', async () => {
    await listFiles({ status: 'failed', person: 'p1' })
    expect(h.calls.filter((c) => c.fn === 'eq').map((c) => c.args)).toEqual([['ingest_status', 'failed'], ['person_id', 'p1']])
    h.calls.length = 0
    await listFiles({ status: 'all', person: '' })
    expect(names()).not.toContain('eq')
  })
  it('turns codes into words', () => {
    expect(errorWords('too_many_tries')).toBe('Tried too many times')
    expect(errorWords('odd_new_code')).toBe('odd new code')
    expect(errorWords(null)).toBe('')
  })
})

describe('history query', () => {
  const base = { person: '', table: '', action: '', from: '', to: '', page: 0 }
  it('newest first, one page plus one row, no filters when empty', async () => {
    await listAudit(base)
    expect(h.calls.find((c) => c.fn === 'range')?.args).toEqual([0, PAGE])
    expect(h.calls.filter((c) => c.fn === 'order').map((c) => c.args)).toEqual([['at', { ascending: false }], ['id', { ascending: false }]])
    expect(names()).not.toContain('eq')
  })
  it('pages by 100 and builds every filter', async () => {
    await listAudit({ person: 'p1', table: 'lab_results', action: 'reveal', from: '2026-10-01', to: '2026-10-02', page: 2 })
    expect(h.calls.find((c) => c.fn === 'range')?.args).toEqual([200, 300])
    expect(h.calls.filter((c) => c.fn === 'eq').map((c) => c.args)).toEqual([['person_id', 'p1'], ['tbl', 'lab_results'], ['action', 'reveal']])
    const gte = h.calls.find((c) => c.fn === 'gte')!.args, lt = h.calls.find((c) => c.fn === 'lt')!.args
    expect(new Date(gte[1] as string).getTime()).toBe(new Date('2026-10-01T00:00:00').getTime())
    expect(new Date(lt[1] as string).getTime()).toBe(new Date('2026-10-03T00:00:00').getTime()) // "to" is inclusive: strictly before the next day
  })
  it('detects the missing table before 0021', () => {
    expect(noAuditTable('42P01')).toBe(true)
    expect(noAuditTable('PGRST205')).toBe(true)
    expect(noAuditTable('42501')).toBe(false)
    expect(noAuditTable(undefined)).toBe(false)
  })
})

describe('dedupe counts', () => {
  it('groups by table and old status', () => {
    const row = (id: number, tbl: string, old_status: string | null) => ({ id, at: '2026-10-01T00:00:00Z', tbl, row_id: 'r', old_status })
    const c = dedupeCounts([row(1, 'lab_results', 'draft'), row(2, 'lab_results', 'draft'), row(3, 'lab_results', 'confirmed'), row(4, 'documents', null)])
    expect(c).toEqual([{ tbl: 'documents', old_status: null, n: 1 }, { tbl: 'lab_results', old_status: 'draft', n: 2 }, { tbl: 'lab_results', old_status: 'confirmed', n: 1 }])
  })
})
