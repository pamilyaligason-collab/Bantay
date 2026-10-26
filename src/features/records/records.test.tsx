import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

type Call = { table: string; ops: unknown[][] }
const h = vi.hoisted(() => {
  const signed = vi.fn(async (_p: string, _s: number) => ({ data: { signedUrl: 'https://signed.test/x' }, error: null as unknown }))
  const buckets: string[] = []
  const calls: { table: string; ops: unknown[][] }[] = []
  const state = { handler: (_c: { table: string; ops: unknown[][] }): unknown => ({ data: [], error: null }) }
  const from = (table: string) => {
    const c = { table, ops: [] as unknown[][] }
    calls.push(c)
    const b: unknown = new Proxy({}, {
      get: (_t, k: string) => (k === 'then' ? (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(state.handler(c)).then(res, rej) : (...a: unknown[]) => { c.ops.push([k, ...a]); return b })
    })
    return b
  }
  return { calls, state, signed, buckets, sb: { from, storage: { from: (b: string) => { buckets.push(b); return { createSignedUrl: signed } } } } }
})
let connected = true
vi.mock('../auth/client', () => ({ get supabase() { return connected ? h.sb : null } }))
const who = vi.hoisted(() => ({ member: { userId: 'u1', personId: 'p1', role: 'admin', handle: null } as { userId: string; personId: string | null; role: string; handle: string | null } | null }))
vi.mock('../auth/session', () => ({ getMember: async () => who.member }))

import Records from '../../screens/Records'
import { canonicalFor, confirmRows, EDITABLE, listQueue, rejectRows, settleDocument, updateRow } from './api'
import { ConfirmFlow, OriginalLink } from './ConfirmSheet'
import { hdb } from './store'

const ok = (data: unknown) => ({ data, error: null })
const has = (c: Call, op: string, ...args: unknown[]) => c.ops.some((o) => o[0] === op && args.every((a, i) => JSON.stringify(o[i + 1]) === JSON.stringify(a)))
const updates = () => h.calls.filter((c) => c.ops.some((o) => o[0] === 'update'))

const doc = { id: 'd1', person_id: 'p1', kind: 'lab', doc_date: '2026-09-01', facility: 'Test Clinic', title: null, status: 'draft', confirmed_by: null, confirmed_at: null }
const lab = (id: string, o: Record<string, unknown> = {}) => ({ id, document_id: 'd1', person_id: 'p1', name_raw: `Test ${id}`, value_num: 5, value_text: null, unit_raw: 'mg/dL', test_code: 'ldl', flag: 'N', ref_low: 0, ref_high: 10, ref_text: null, collected_at: null, confidence: 0.95, value_canonical: 5, status: 'draft', ...o })
const rxLine = (id: string, line_no: number, o: Record<string, unknown> = {}) => ({ id, person_id: 'p1', prescription_id: 'rx1', line_no, drug_raw: `Drug ${id}`, strength: '10 mg', dose: '1 tab', frequency: 'daily', duration: null, unclear: false, confidence: 0.9, status: 'draft', ...o })
const catalog = [{ code: 'ldl', name: 'LDL cholesterol', unit: 'mg/dL', conversions: { 'mmol/L': 38.67 } }]
let tables: Record<string, unknown>

function serve() {
  h.state.handler = (c) => {
    if (c.ops.some((o) => o[0] === 'update')) { const ids = c.ops.find((o) => o[0] === 'in')?.[2] as string[] | undefined; return ok((ids ?? ['x']).map((id) => ({ id }))) }
    return ok(tables[c.table] ?? [])
  }
}

beforeEach(async () => {
  connected = true
  h.calls.length = 0
  await Promise.all([db.kv.clear(), hdb.readings.clear(), hdb.people.clear(), hdb.consults.clear()])
  await hdb.people.put({ id: 'p1', name: 'Test Person' })
  tables = {
    records_queue: [{ person_id: 'p1', kind: 'lab_results', drafts: 3 }, { person_id: 'p1', kind: 'documents', drafts: 1 }],
    documents: [doc],
    lab_results: [lab('l1'), lab('l2', { confidence: 0.5 }), lab('l3', { flag: 'H', value_num: 20 }), lab('l4', { value_num: null, value_canonical: null })],
    prescription_items: [rxLine('i1', 1), rxLine('i2', 2, { unclear: true })],
    prescriptions: [{ id: 'rx1', document_id: 'd1' }],
    source_files: [{ id: 'f1', name: 'scan.pdf', mime: 'application/pdf', drive_file_id: 'abc123', document_id: 'd1' }],
    test_catalog: catalog
  }
  serve()
})
afterEach(cleanup)

describe('api', () => {
  it('queue count is rows to check, not documents on top of them', async () => {
    const r = await listQueue()
    expect(r).toEqual({ ok: true, data: { total: 3, byPerson: { p1: 3 } } })
  })

  it('confirm sends only status, never confirmed_by', async () => {
    expect((await confirmRows('lab_results', ['l1'])).ok).toBe(true)
    const u = updates()[0]
    expect(u.ops.find((o) => o[0] === 'update')![1]).toEqual({ status: 'confirmed' })
    expect(JSON.stringify(h.calls)).not.toContain('confirmed_by')
  })

  it('a confirm copies the server reading into the local store, a reject removes it (tombstone)', async () => {
    const srv = { client_id: 'c9', person_id: 'p1', taken_at: '2026-09-01T00:00:00+00:00', test: 'ldl', value: 5, unit: 'mg/dL', lab_low: 0, lab_high: 10, deleted_at: null }
    tables.readings = [srv]
    await confirmRows('lab_results', ['l1'])
    expect((await hdb.readings.toArray()).map((r) => [r.clientId, r.value])).toEqual([['c9', 5]])
    tables.readings = [{ ...srv, value: 6 }] // edit: same row
    await updateRow('lab_results', 'l1', { value_num: 6 })
    expect((await hdb.readings.toArray()).map((r) => r.value)).toEqual([6])
    tables.readings = [{ ...srv, deleted_at: '2026-09-02T00:00:00Z' }]
    await rejectRows('lab_results', ['l1'])
    expect(await hdb.readings.count()).toBe(0)
    tables.readings = [{ ...srv, value: 7 }] // re-confirm: back once, no duplicate
    await confirmRows('lab_results', ['l1'])
    expect((await hdb.readings.toArray()).map((r) => r.value)).toEqual([7])
  })

  it('fix allowlist rejects unknown columns and makes no request', async () => {
    h.calls.length = 0
    for (const bad of [{ status: 'confirmed' }, { confirmed_by: 'u' }, { person_id: 'p2' }, { value_num: 1, junk: 2 }, {}]) {
      expect(await updateRow('lab_results', 'l1', bad)).toEqual({ ok: false, error: 'column_not_allowed' })
    }
    expect(h.calls).toHaveLength(0)
    expect(EDITABLE.lab_results).not.toContain('status')
  })

  it('a blank fix is null, never 0, and drops the stale canonical value', async () => {
    await updateRow('lab_results', 'l1', { value_num: '' })
    const body = updates()[0].ops.find((o) => o[0] === 'update')![1]
    expect(body).toEqual({ value_num: null, value_canonical: null })
    expect(canonicalFor(catalog[0], null, 'mg/dL')).toBeNull()
    expect(canonicalFor(catalog[0], 5, 'mmol/L')).toBeCloseTo(193.35)
    expect(canonicalFor(catalog[0], 5, 'furlongs')).toBeNull()
    expect(canonicalFor(catalog[0], 5, ' MMOL/L ')).toBeCloseTo(193.35) // case and spaces do not matter
    expect(canonicalFor({ ...catalog[0], conversions: { 'MMOL/L ': 38.67 } }, 5, 'mmol/l')).toBeCloseTo(193.35)
  })

  it('an unclear prescription line is excluded from a batch confirm on the server too', async () => {
    await confirmRows('prescription_items', ['i1', 'i2'])
    expect(has(h.calls[0], 'eq', 'unclear', false)).toBe(true)
    h.calls.length = 0
    await confirmRows('prescription_items', ['i2'])
    expect(has(h.calls[0], 'eq', 'unclear', false)).toBe(false)
  })

  it('the badge counts a draft document that has no rows, so it matches the list', async () => {
    tables.documents = [doc, { ...doc, id: 'd2', kind: 'insurance', doc_date: '2026-09-02' }]
    expect(await listQueue()).toEqual({ ok: true, data: { total: 4, byPerson: { p1: 4 } } })
  })

  it('settle closes the children first and the document last', async () => {
    tables.lab_results = [{ id: 'l1', status: 'confirmed' }]
    tables.prescription_items = [{ id: 'i1', status: 'confirmed' }]
    tables.vaccinations = []
    tables.imaging_reports = []
    h.calls.length = 0
    expect(await settleDocument('d1')).toEqual({ ok: true, data: 'confirmed' })
    expect(updates().map((c) => c.table)).toEqual(['prescriptions', 'documents'])
    tables.lab_results = [{ id: 'l1', status: 'draft' }]
    expect(await settleDocument('d1')).toEqual({ ok: true, data: 'open' })
    tables.lab_results = []
    tables.prescription_items = []
    tables.prescriptions = []
    expect(await settleDocument('d1')).toEqual({ ok: true, data: 'open' }) // a document with no rows is not auto-rejected
  })

  it('errors are typed results with a code, never the server message', async () => {
    h.state.handler = () => ({ data: null, error: { code: '42501', message: 'value 99 for Test Person' } })
    expect(await confirmRows('lab_results', ['l1'])).toEqual({ ok: false, error: 'forbidden', code: '42501' })
    connected = false
    expect(await confirmRows('lab_results', ['l1'])).toEqual({ ok: false, error: 'not_connected' })
  })
})

describe('Records queue entry', () => {
  it('shows To check (3) when drafts wait and nothing when none do', async () => {
    render(<Records />)
    expect(await screen.findByRole('button', { name: /To check \(3\)/ })).toBeTruthy()
    cleanup()
    tables.records_queue = []
    render(<Records />)
    await screen.findByText('No records yet')
    expect(screen.queryByText(/To check/)).toBeNull()
  })
})

describe('Records queue errors', () => {
  it('a failing queue shows an error row with retry instead of hiding it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.state.handler = () => ({ data: null, error: { code: '42501', message: 'x' } })
    who.member = { userId: 'u2', personId: 'p1', role: 'member', handle: null } // only an admin sees the error row
    render(<Records />)
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(screen.queryByText('Could not load records to check. Try again.')).toBeNull()
    cleanup()
    who.member = { userId: 'u1', personId: 'p1', role: 'admin', handle: null }
    render(<Records />)
    expect(await screen.findByText('Could not load records to check. Try again.')).toBeTruthy()
    expect(warn).toHaveBeenCalledWith('records queue failed', '42501')
    serve()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /To check \(3\)/ })).toBeTruthy()
    warn.mockRestore()
  })

  it('when only the records_queue view fails, draft rows are counted from the tables', async () => {
    h.state.handler = (c) => (c.table === 'records_queue' ? { data: null, error: { code: '42P01', message: 'x' } } : ok(tables[c.table] ?? []))
    expect(await listQueue()).toEqual({ ok: true, data: { total: 6, byPerson: { p1: 6 } } })
  })
})

describe('ConfirmFlow', () => {
  const mount = async () => {
    const onClose = vi.fn()
    const onChanged = vi.fn()
    render(<ConfirmFlow people={[{ id: 'p1', name: 'Test Person' }]} onClose={onClose} onChanged={onChanged} />)
    fireEvent.click(await screen.findByRole('button', { name: /Lab results, 2026-09-01/ }))
    await screen.findByRole('button', { name: /Confirm all checked/ })
    return { onClose, onChanged }
  }

  it('lists the document with the person first name, then focuses the sheet heading', async () => {
    render(<ConfirmFlow people={[{ id: 'p1', name: 'Test Person' }]} onClose={() => {}} onChanged={() => {}} />)
    const b = await screen.findByRole('button', { name: /Lab results, 2026-09-01/ })
    expect(b.textContent).toContain('Test · Test Clinic')
    expect(b.textContent).not.toContain('Person')
    fireEvent.click(b)
    const h2 = await screen.findByRole('heading', { name: 'Lab results, 2026-09-01' })
    await waitFor(() => expect(document.activeElement).toBe(h2))
    expect(screen.getByRole('link', { name: /Open original/ }).getAttribute('href')).toBe('https://drive.google.com/file/d/abc123/view')
  })

  it('highlights low confidence and out of range rows, not normal ones', async () => {
    await mount()
    const flagged = (id: string) => document.querySelector(`[data-row="${id}"]`)!.getAttribute('data-flagged')
    expect(flagged('l1')).toBeNull()
    expect(flagged('l2')).toBe('true') // confidence 0.5
    expect(flagged('l3')).toBe('true') // flag H
    expect(screen.getByText('Low confidence')).toBeTruthy()
    expect(screen.getByText('Outside the lab range')).toBeTruthy()
  })

  it('an unclear line has no checkbox, is not in Confirm all checked, and confirms on its own', async () => {
    await mount()
    expect(screen.queryByLabelText('Include Drug i2')).toBeNull()
    expect(screen.getByText('Unclear: check this line')).toBeTruthy()
    // checked by default: l1, l3 (l2 low confidence and l4 no value start unchecked) + clear line i1
    const btn = screen.getByRole('button', { name: 'Confirm all checked (3)' })
    fireEvent.click(btn)
    await screen.findByText(/confirmed/)
    const sent = updates().map((c) => ({ t: c.table, ids: c.ops.find((o) => o[0] === 'in')![2] as string[] }))
    expect(sent).toContainEqual({ t: 'prescription_items', ids: ['i1'] })
    expect(sent.some((s) => s.ids.includes('i2'))).toBe(false)
    expect(screen.getByRole('status').textContent).toBe('3 confirmed')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm line Drug i2' }))
    await waitFor(() => expect(updates().some((c) => (c.ops.find((o) => o[0] === 'in')![2] as string[]).includes('i2'))).toBe(true))
  })

  it('B-5: an unread value shows as not read, and clearing a value in Fix saves null, not 0', async () => {
    await mount()
    const r4 = document.querySelector('[data-row="l4"]') as HTMLElement
    expect(within(r4).getByText('Not read')).toBeTruthy()
    expect(r4.querySelector('.rx-val')!.textContent).toBe('Not read') // blank, never 0
    fireEvent.click(screen.getByRole('button', { name: 'Fix Test l1' }))
    const input = screen.getByLabelText('Value') as HTMLInputElement
    expect(input.value).toBe('5')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save fix' }))
    await screen.findByText('Fix saved')
    const body = updates().at(-1)!.ops.find((o) => o[0] === 'update')![1]
    expect(body).toEqual({ value_num: null, value_canonical: null })
  })

  it('Fix lets a unit change recompute the canonical value from the catalog', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Fix Test l1' }))
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'mmol/L' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save fix' }))
    await screen.findByText('Fix saved')
    const body = updates().at(-1)!.ops.find((o) => o[0] === 'update')![1] as Record<string, unknown>
    expect(body.unit_raw).toBe('mmol/L')
    expect(body.value_canonical).toBeCloseTo(193.35)
  })

  it('a draft document with no rows offers Confirm document and Reject document, then leaves the list', async () => {
    tables.documents = [doc, { ...doc, id: 'd2', kind: 'certificate', doc_date: '2026-09-02' }, { ...doc, id: 'd3', kind: 'id_card', doc_date: '2026-09-03' }]
    render(<ConfirmFlow people={[{ id: 'p1', name: 'Test Person' }]} onClose={() => {}} onChanged={() => {}} />)
    expect(screen.queryByRole('button', { name: /ID card, 2026-09-03/ })).toBeNull() // cards are confirmed on the IDs screen
    fireEvent.click(await screen.findByRole('button', { name: /Certificate, 2026-09-02/ }))
    expect(await screen.findByRole('button', { name: 'Reject document' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm document' }))
    await screen.findByRole('heading', { name: 'To check' })
    expect(screen.getByRole('status').textContent).toBe('Document confirmed')
    const u = updates().find((c) => c.table === 'documents')!
    expect(u.ops.find((o) => o[0] === 'update')![1]).toEqual({ status: 'confirmed' })
    expect(u.ops.find((o) => o[0] === 'in')![2]).toEqual(['d2'])
    expect(screen.queryByRole('button', { name: /Certificate, 2026-09-02/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Lab results, 2026-09-01/ })).toBeTruthy()
  })

  it('only rows the server actually changed leave the list', async () => {
    await mount()
    h.state.handler = (c) => {
      if (c.ops.some((o) => o[0] === 'update')) return ok(c.table === 'lab_results' ? [{ id: 'l1' }] : (c.ops.find((o) => o[0] === 'in')?.[2] as string[]).map((id) => ({ id })))
      return ok(tables[c.table] ?? [])
    }
    fireEvent.click(screen.getByRole('button', { name: /Confirm all checked/ }))
    await waitFor(() => expect(document.querySelector('[data-row="l1"]')).toBeNull())
    expect(document.querySelector('[data-row="l3"]')).not.toBeNull() // l3 was asked for but not changed
    expect(screen.getByRole('status').textContent).toContain('Could not save the rest')
  })

  it('a private-bucket file opens a 60 s signed link from the records bucket and nothing is stored', async () => {
    const win = { close: vi.fn(), opener: 1, location: { href: '' } }
    vi.stubGlobal('open', vi.fn(() => win))
    render(<OriginalLink file={{ id: 'f9', name: 'card.jpg', mime: 'image/jpeg', drive_file_id: null, storage_path: 'p1/u.jpg', side: 'front' }} />)
    fireEvent.click(screen.getByRole('button', { name: /Open original \(front\)/ }))
    await waitFor(() => expect(h.signed).toHaveBeenCalledWith('p1/u.jpg', 60))
    expect(h.buckets).toContain('records')
    await waitFor(() => expect(win.location.href).toBe('https://signed.test/x'))
    expect(JSON.stringify(await db.kv.toArray())).not.toContain('signed.test')
    vi.unstubAllGlobals()
  })

  it('Escape goes back, then closes; status is one polite live region', async () => {
    const { onClose } = await mount()
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    await screen.findByRole('heading', { name: 'To check' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ConfirmFlow name on paper (S11, hazard K1)', () => {
  const open = async () => {
    render(<ConfirmFlow people={[{ id: 'p1', name: 'Test Person' }]} onClose={() => {}} onChanged={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Lab results, 2026-09-01/ }))
    await screen.findByRole('button', { name: /Confirm all checked/ })
  }
  it('another name shows the paper name and a red warning, and blocks every Confirm until acknowledged', async () => {
    tables.documents = [{ ...doc, printed_name: 'Rosa Dela Cruz' }]
    await open()
    expect(screen.getByTestId('printed-name').textContent).toBe('Name on paper: Rosa Dela Cruz')
    expect(screen.getByTestId('name-mismatch').textContent).toContain('Rosa Dela Cruz, not Test Person')
    const all = screen.getByRole('button', { name: /Confirm all checked/ }) as HTMLButtonElement
    const one = screen.getByRole('button', { name: 'Confirm Test l1' }) as HTMLButtonElement
    expect([all.disabled, one.disabled]).toEqual([true, true])
    fireEvent.click(screen.getByRole('checkbox', { name: /I checked/ }))
    expect([all.disabled, one.disabled]).toEqual([false, false])
  })
  it('a matching or unread name shows no warning', async () => {
    tables.documents = [{ ...doc, printed_name: 'PERSON TEST' }]
    await open()
    expect(screen.queryByTestId('name-mismatch')).toBeNull()
    cleanup()
    tables.documents = [{ ...doc, printed_name: null }]
    await open()
    expect(screen.queryByTestId('name-mismatch')).toBeNull()
    expect((screen.getByRole('button', { name: /Confirm all checked/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})
