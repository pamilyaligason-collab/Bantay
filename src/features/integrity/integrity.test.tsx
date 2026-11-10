import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const tables: Record<string, { data: unknown[]; error?: boolean; count?: number }> = {}
  const chain = (t: string) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit']) c[m] = () => c
    c.then = (res: (v: unknown) => unknown) => { const x = tables[t] ?? { data: [] }; return Promise.resolve(x.error ? { data: null, error: { code: 'x' }, count: null } : { data: x.data, error: null, count: x.count ?? null }).then(res) }
    return c
  }
  return { tables, from: (t: string) => chain(t) }
})
vi.mock('../auth/client', () => ({ supabase: { from: h.from, rpc: vi.fn() } }))

import IntegrityCard from './IntegrityCard'
import { findingLine, integrityStatus, type Finding, type Snapshot } from './integrityApi'

const f = (over: Partial<Finding>): Finding => ({ id: 1, kind: 'impossible', table_name: 'readings', person_id: 'p1', detail: {}, checked_at: '2026-11-10T19:30:00Z', ...over })

describe('findingLine', () => {
  it('says what is wrong in plain words, using only the parts it has', () => {
    expect(findingLine(f({ detail: { test: 'bp_systolic', value: 400, unit: 'mmHg', reason: 'out_of_range' } }))).toEqual({ title: 'Blood pressure, top 400 mmHg', note: 'Outside what can be true' })
    expect(findingLine(f({ kind: 'unit_mismatch', detail: { test: 'glucose', value: 5.6, unit: 'mg/dL', reason: 'fits_other_unit', likely_unit: 'mmol/l' } })).note).toBe('Fits mmol/l better than mg/dL')
    expect(findingLine(f({ kind: 'no_unit', detail: { test: 'hemoglobin', value: 215 } }))).toEqual({ title: 'Hemoglobin 215', note: 'The unit is missing' })
    expect(findingLine(f({ kind: 'duplicate', detail: { test: 'heart_rate', gap_s: 0 } })).note).toBe('Same value as another row, 0 seconds apart')
  })
  it('sleep totals in hours and minutes, steps overlaps by count', () => {
    expect(findingLine(f({ kind: 'tile_mismatch', detail: { metric: 'sleep', day: '2026-11-10', rows_total_min: 760, shown_min: 400 } }))).toEqual({ title: 'Sleep on 2026-11-10', note: 'Rows add up to 12 h 40 min, the app shows 6 h 40 min' })
    expect(findingLine(f({ kind: 'tile_mismatch', detail: { metric: 'steps', day: '2026-11-09', overlapping_rows: 1 } })).note).toBe('1 row overlaps another, so the day total counts them twice')
    expect(findingLine(f({ detail: { metric: 'sleep', day: '2026-11-10', reason: 'sleep_over_16h', minutes: 1000 } })).note).toBe('16 h 40 min of sleep in one night')
  })
  it('an unknown detail still gives a line (no crash, no invented value)', () => {
    expect(findingLine(f({ detail: {} }))).toEqual({ title: 'Record', note: 'Cannot be right' })
  })
})

describe('integrityStatus', () => {
  const run = (ok: boolean) => ({ ran_at: '2026-11-10T19:30:00Z', ok, summary: {} })
  const snap = (o: Partial<Snapshot>): Snapshot => ({ run: run(true), open: 0, findings: [], available: true, ...o })
  it('unknown, never run, failed, open findings, clean', () => {
    expect(integrityStatus(null)).toEqual({ tone: 'plain', text: 'Not available yet' })
    expect(integrityStatus(snap({ available: false })).tone).toBe('plain')
    expect(integrityStatus(snap({ run: null })).tone).toBe('warn')
    expect(integrityStatus(snap({ run: run(false) })).tone).toBe('bad')
    expect(integrityStatus(snap({ open: 3 }))).toEqual({ tone: 'warn', text: '3 to look at' })
    expect(integrityStatus(snap({}))).toEqual({ tone: 'ok', text: 'Nothing to look at' })
  })
})

describe('IntegrityCard', () => {
  beforeEach(() => {
    for (const k of Object.keys(h.tables)) delete h.tables[k]
    h.tables.people = { data: [{ id: 'p1', display_name: 'Mama', auth_user_id: 'u1', photo_path: null }] }
  })
  afterEach(cleanup)

  it('shows the last run counts and the open findings with the person name', async () => {
    h.tables.job_runs = { data: [{ ran_at: '2026-11-10T19:30:00Z', ok: true, summary: { dupes: 1, impossible: 1, mismatched: 0, checked: 12000 } }] }
    h.tables.integrity_findings = { count: 2, data: [
      f({ id: 1, detail: { test: 'bp_systolic', value: 400, unit: 'mmHg', reason: 'out_of_range' } }),
      f({ id: 2, kind: 'duplicate', detail: { test: 'heart_rate', gap_s: 0 } })
    ] }
    render(<IntegrityCard tick={0} />)
    const card = (await screen.findByRole('region', { name: 'Data integrity check' }))
    expect(await within(card).findByText(/12,000 records checked/)).toBeTruthy()
    expect(within(card).getByText('2 to look at')).toBeTruthy()
    const list = within(card).getByRole('list', { name: 'Open findings' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText(/Mama · Outside what can be true/)).toBeTruthy()
    expect(within(card).queryByText(/Showing the first/)).toBeNull()
  })

  it('says so when the findings table is not there yet (0064 not applied), without an error', async () => {
    h.tables.job_runs = { data: [] }
    h.tables.integrity_findings = { data: [], error: true }
    render(<IntegrityCard tick={0} />)
    expect(await screen.findByText(/Not available yet/)).toBeTruthy()
    expect(screen.queryByText('Could not load.')).toBeNull()
  })

  it('a clean night: no findings', async () => {
    h.tables.job_runs = { data: [{ ran_at: '2026-11-10T19:30:00Z', ok: true, summary: { dupes: 0, impossible: 0, mismatched: 0, checked: 50 } }] }
    h.tables.integrity_findings = { data: [], count: 0 }
    render(<IntegrityCard tick={0} />)
    expect(await screen.findByText('No open findings.')).toBeTruthy()
    expect(screen.getByText('Nothing to look at')).toBeTruthy()
  })
})
