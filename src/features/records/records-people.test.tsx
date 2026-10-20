import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

// Records for every person: default to me, picker shared with Health, confirm -> readings, confirm all, progress, medicines.
const h = vi.hoisted(() => {
  const state = { handler: (_c: { table: string; ops: unknown[][] }): unknown => ({ data: [], error: null }) }
  const from = (table: string) => {
    const c = { table, ops: [] as unknown[][] }
    const b: unknown = new Proxy({}, {
      get: (_t, k: string) => (k === 'then' ? (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(state.handler(c)).then(res, rej) : (...a: unknown[]) => { c.ops.push([k, ...a]); return b })
    })
    return b
  }
  return { state, sb: { from, storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) } } }
})
vi.mock('../auth/client', () => ({ supabase: h.sb }))
const who = vi.hoisted(() => ({ member: { userId: 'u1', personId: 'p2' as string | null, role: 'admin', handle: null } }))
vi.mock('../auth/session', () => ({ getMember: async () => who.member }))

const tracked = vi.hoisted(() => ({ calls: [] as string[][] }))
vi.mock('../admin/events', async (orig) => ({ ...(await orig<typeof import('../admin/events')>()), track: async (k: string, n: string) => { tracked.calls.push([k, n]); return true } }))
configure({ asyncUtilTimeout: 6000 }) // the full suite loads the machine
vi.mock('./trend', () => ({ trendChart: () => ({ destroy() {}, setSize() {} }) })) // uPlot needs a canvas
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })

import Records from '../../screens/Records'
import Health from '../../screens/Health'
import { confirmRows } from './api'
import { ConfirmFlow } from './ConfirmSheet'
import { hdb } from './store'
import { resetPersonChoice } from './useHealthData'

const ok = (data: unknown) => ({ data, error: null })
const doc = (id: string, person: string, status = 'draft') => ({ id, person_id: person, kind: 'lab', doc_date: '2026-09-01', facility: 'Test Clinic', title: null, status, confirmed_by: null, confirmed_at: null })
const lab = (id: string, doc: string, person: string, o: Record<string, unknown> = {}) => ({ id, document_id: doc, person_id: person, name_raw: `Test ${id}`, value_num: 5, value_text: null, unit_raw: 'mg/dL', test_code: 'ldl', flag: 'N', ref_low: 0, ref_high: 10, ref_text: null, collected_at: null, confidence: 0.95, value_canonical: 5, status: 'draft', ...o })
let tables: Record<string, unknown>
const updates: { table: string; body: unknown; ids: unknown }[] = []

function serve() {
  h.state.handler = (c) => {
    const upd = c.ops.find((o) => o[0] === 'update')
    if (upd) { const ids = (c.ops.find((o) => o[0] === 'in')?.[2] as string[] | undefined) ?? ['x']; updates.push({ table: c.table, body: upd[1], ids }); for (const r of (tables[c.table] ?? []) as Record<string, unknown>[]) if (ids.includes(r.id as string)) Object.assign(r, upd[1]); return ok(ids.map((id) => ({ id }))) }
    let rows = (tables[c.table] ?? []) as Record<string, unknown>[]
    for (const o of c.ops) if (o[0] === 'eq' && typeof o[1] === 'string' && o[1] !== 'unclear') rows = rows.filter((r) => !((o[1] as string) in r) || r[o[1] as string] === o[2])
    return ok(rows)
  }
}

beforeEach(async () => {
  who.member = { userId: 'u1', personId: 'p2', role: 'admin', handle: null }
  updates.length = 0
  tracked.calls.length = 0
  resetPersonChoice()
  await Promise.all([db.kv.clear(), hdb.readings.clear(), hdb.people.clear(), hdb.consults.clear()])
  await hdb.people.bulkPut([{ id: 'p1', name: 'Lola Santos' }, { id: 'p2', name: 'Lloyd Roc' }])
  tables = {
    records_queue: [{ person_id: 'p1', kind: 'lab_results', drafts: 4 }],
    documents: [doc('d1', 'p1'), doc('d2', 'p1'), doc('d3', 'p1', 'confirmed')],
    lab_results: [lab('l1', 'd1', 'p1'), lab('l2', 'd1', 'p1', { confidence: 0.5 }), lab('l3', 'd2', 'p1')],
    prescription_items: [], prescriptions: [], vaccinations: [], imaging_reports: [], source_files: [], test_catalog: []
  }
  serve()
})
afterEach(cleanup)

describe('person picker', () => {
  it('opens on the signed-in member (not an arbitrary first person), Me first, with draft counts', async () => {
    render(<Records />)
    const me = await screen.findByRole('button', { name: 'Me' })
    expect(me.getAttribute('aria-pressed')).toBe('true')
    const chips = within(screen.getByRole('group', { name: 'Whose records' })).getAllByRole('button')
    expect(chips.map((b) => b.textContent)).toEqual(['Me', 'Lola4'])
    expect(screen.getByRole('button', { name: 'Lola, 4 to check' })).toBeTruthy()
    expect(screen.queryByText(/To check \(/)).toBeNull() // me has nothing waiting
  })

  it('picking Lola shows her to-check row, and Health follows the same choice', async () => {
    render(<Records />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lola, 4 to check' }))
    expect(await screen.findByRole('button', { name: /To check \(4\)/ })).toBeTruthy()
    cleanup()
    render(<Health />)
    const lola = await screen.findByRole('button', { name: 'Lola' })
    await waitFor(() => expect(lola.getAttribute('aria-pressed')).toBe('true'))
  })

  it('a member with no person of their own falls back to the first person', async () => {
    who.member = { userId: 'u9', personId: null, role: 'member', handle: null }
    render(<Records />)
    expect((await screen.findByRole('button', { name: 'Lloyd' })).getAttribute('aria-pressed')).toBe('true') // sorted by name: Lloyd before Lola
  })
})

describe('confirm -> readings', () => {
  it('a confirmed lab row shows in Records timeline and Health latest for that person only', async () => {
    const srv = { client_id: 'c1', person_id: 'p1', taken_at: '2026-09-01T00:00:00+00:00', test: 'ldl', value: 95, unit: 'mg/dL', lab_low: 0, lab_high: 130, deleted_at: null }
    tables.readings = [srv]
    expect((await confirmRows('lab_results', ['l1'])).ok).toBe(true)
    expect((await hdb.readings.toArray()).map((r) => [r.personId, r.value])).toEqual([['p1', 95]])
    // Lloyd (me) sees nothing
    render(<Records />)
    await screen.findByText('No records yet')
    cleanup()
    render(<Records />)
    fireEvent.click(await screen.findByRole('button', { name: /Lola/ }))
    expect(await screen.findByText(/95 mg\/dL/)).toBeTruthy()
    cleanup()
    render(<Health />) // same choice, no re-pick
    const row = await screen.findByText(/95/)
    expect(row.closest('[data-test="ldl"]')).toBeTruthy()
  })
})

describe('check flow', () => {
  it('Confirm all N from this paper sends every non-unclear row in one call, the progress line counts papers, and one records_confirmed is sent', async () => {
    const people = [{ id: 'p1', name: 'Lola Santos' }]
    const done = vi.fn()
    render(<ConfirmFlow people={people} personId="p1" checkedDocs={1} onClose={() => {}} onChanged={done} />)
    expect(await screen.findByText('1 of 3 checked')).toBeTruthy() // 1 confirmed + d1 + d2 drafts
    fireEvent.click(screen.getAllByRole('button', { name: /Lab results, 2026-09-01/ })[0])
    const all = await screen.findByRole('button', { name: 'Confirm all 2 from this paper' }) // l2 is low confidence (unchecked), still in "all"
    fireEvent.click(all)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('2 confirmed'))
    const u = updates.filter((x) => x.table === 'lab_results')
    expect(u).toHaveLength(1)
    expect(u[0]).toMatchObject({ body: { status: 'confirmed' }, ids: ['l1', 'l2'] })
    expect(done).toHaveBeenCalled()
    await waitFor(() => expect(tracked.calls.filter((c) => c[1] === 'records_confirmed')).toHaveLength(1))
    expect(tracked.calls[0]).toEqual(['action', 'records_confirmed'])
  })

  it('the sheet lists only the picked person', async () => {
    tables.documents = [doc('d1', 'p1'), doc('d9', 'p2')]
    tables.lab_results = [lab('l1', 'd1', 'p1'), lab('l9', 'd9', 'p2')]
    render(<ConfirmFlow people={[{ id: 'p1', name: 'Lola' }, { id: 'p2', name: 'Lloyd' }]} personId="p2" onClose={() => {}} onChanged={() => {}} />)
    expect(await screen.findByText(/Lloyd · Test Clinic/)).toBeTruthy()
    expect(screen.queryByText(/Lola · Test Clinic/)).toBeNull()
  })
})

describe('medicines from prescriptions', () => {
  it('lists confirmed prescription lines for the picked person under the timeline', async () => {
    who.member = { userId: 'u1', personId: 'p1', role: 'admin', handle: null }
    tables.prescription_items = [
      { id: 'i1', person_id: 'p1', status: 'confirmed', prescription_id: 'rx1', line_no: 1, drug_raw: 'Losartan', strength: '50 mg', dose: '1 tab', frequency: 'daily', duration: null, unclear: false, confidence: 0.9 },
      { id: 'i2', person_id: 'p2', status: 'confirmed', prescription_id: 'rx2', line_no: 1, drug_raw: 'Other person drug', strength: null, dose: null, frequency: null, duration: null, unclear: false, confidence: 0.9 }
    ]
    render(<Records />)
    const meds = await screen.findByTestId('rx-meds')
    expect(meds.textContent).toContain('Losartan')
    expect(meds.textContent).not.toContain('Other person drug')
    expect(screen.getByRole('heading', { name: 'Medicines from prescriptions' })).toBeTruthy()
  })
})
