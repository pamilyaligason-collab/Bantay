import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type R = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type W = { t: string; patch: R; ids: string[] }
const h = vi.hoisted(() => ({ sb: null as unknown }))
vi.mock('../../auth/client', () => ({ get supabase() { return h.sb } }))
// Synthetic in-memory PostgREST: filters, update, range. Writes are logged and applied.
function fakeSb(tables: Record<string, R[]>, writes: W[]) {
  return {
    auth: { getSession: async () => ({ data: { session: null } }) },
    storage: { from: () => ({ createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://files.test/${p}` }, error: null }) }) },
    from: (t: string) => {
      let patch: R | null = null
      let rng: [number, number] | null = null
      let head = false
      const fs: ((r: R) => boolean)[] = []
      const b: R = {}
      const add = (n: string, f: (...a: any[]) => (r: R) => boolean) => { b[n] = (...a: unknown[]) => { fs.push(f(...a)); return b } } // eslint-disable-line @typescript-eslint/no-explicit-any
      add('eq', (c, v) => (r) => r[c] === v); add('neq', (c, v) => (r) => r[c] !== v); add('in', (c, v) => (r) => v.includes(r[c]))
      add('is', (c) => (r) => r[c] == null); add('gte', (c, v) => (r) => String(r[c] ?? '') >= v); add('lte', (c, v) => (r) => String(r[c] ?? '') <= v)
      add('not', (c, op, v) => (r) => (op === 'is' ? r[c] != null : !String(v).slice(1, -1).split(',').includes(String(r[c]))))
      for (const n of ['order', 'limit']) b[n] = () => b
      b.select = (_c: string, o?: { head?: boolean }) => { head = !!o?.head; return b }
      b.range = (a: number, z: number) => { rng = [a, z]; return b }
      b.update = (p: R) => { patch = p; return b }
      b.then = (res: (v: unknown) => unknown) => {
        const rows = (tables[t] ?? []).filter((r) => fs.every((f) => f(r)))
        if (patch) { for (const r of rows) Object.assign(r, patch); writes.push({ t, patch, ids: rows.map((r) => r.id) }) }
        if (head) return Promise.resolve({ data: null, count: rows.length, error: null }).then(res)
        return Promise.resolve({ data: (rng ? rows.slice(rng[0], rng[1] + 1) : rows).map((r) => ({ ...r })), error: null }).then(res)
      }
      return b
    }
  }
}
configure({ asyncUtilTimeout: 6000 })
import Records from './Records'
import { buildEditPatch } from './recordsUi'

const lab = (id: string, name: string, o: R = {}): R => ({ id, document_id: 'd1', person_id: 'p1', name_raw: name, value_num: 95, unit_raw: 'mg/dL', confidence: 0.9, status: 'draft', collected_at: '2026-09-01T00:00:00Z', client_id: 'c', ...o })
const mk = (): Record<string, R[]> => ({
  people: [{ id: 'p1', display_name: 'Test Person' }, { id: 'p2', display_name: 'Other Person' }],
  documents: [
    { id: 'd1', person_id: 'p1', kind: 'lab', status: 'draft', doc_date: '2026-09-01', facility: 'Test Clinic', title: 'Lab paper' },
    { id: 'd9', person_id: 'p1', kind: 'id_card', status: 'confirmed', doc_date: null, facility: null, title: 'Card' }
  ],
  lab_results: [lab('l1', 'LDL Test', { flag: 'H', ref_low: 0, ref_high: 100 }), lab('l2', 'Glucose Test', { status: 'confirmed', collected_at: '2026-08-01T00:00:00Z' }), lab('l3', 'HDL Test', { collected_at: '2026-07-01T00:00:00Z' })],
  prescriptions: [
    { id: 'rxa', document_id: 'd1', person_id: 'p1', rx_date: '2026-08-01', prescriber: 'Dr Test', status: 'draft' },
    { id: 'rxb', document_id: 'd1', person_id: 'p1', rx_date: '2026-07-01', prescriber: 'Dr Other', status: 'draft' }
  ],
  prescription_items: [
    { id: 'ia', prescription_id: 'rxa', person_id: 'p1', line_no: 1, drug_raw: 'Alpha Drug', unclear: false, status: 'draft' },
    { id: 'ib', prescription_id: 'rxa', person_id: 'p1', line_no: 2, drug_raw: 'Beta Drug', unclear: true, status: 'draft' },
    { id: 'ic', prescription_id: 'rxb', person_id: 'p1', line_no: 1, drug_raw: 'Gamma Drug', unclear: false, status: 'draft' }
  ],
  vaccinations: [], imaging_reports: [], allergies: [{ id: 'al1', person_id: 'p1', substance: 'Test Dust', status: 'draft', created_at: '2026-01-01T00:00:00Z' }], conditions: [{ id: 'co1', person_id: 'p1', name: 'Test Condition', status: 'draft', onset_on: '2025-01-01' }],
  source_files: [{ id: 'f1', document_id: 'd1', name: 'page1.jpg', mime: 'image/jpeg', drive_file_id: null, storage_path: 'p1/a.jpg', page_no: 1 }, { id: 'f2', document_id: 'd1', name: 'old.pdf', mime: 'application/pdf', drive_file_id: 'abc123', storage_path: null, page_no: 2 }]
})
let tables: Record<string, R[]>
let writes: W[]
beforeEach(() => { tables = mk(); writes = []; h.sb = fakeSb(tables, writes) })
afterEach(cleanup)

describe('Records tabs', () => {
  it('defaults to Laboratory; an unknown tab falls back to it; the sub segment picks a tab', async () => {
    const a = render(<Records id={null} />)
    expect(await screen.findByRole('button', { name: 'LDL Test' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^Laboratory/ }).getAttribute('aria-current')).toBe('page')
    a.unmount()
    const b = render(<Records id={null} sub="nonsense" />)
    expect(await screen.findByRole('button', { name: 'LDL Test' })).toBeTruthy()
    b.unmount()
    render(<Records id="all" sub="papers" />)
    expect(await screen.findByRole('button', { name: 'Lab paper' })).toBeTruthy()
    expect(screen.queryByText('Card')).toBeNull() // ID cards live on the IDs tab
    expect(screen.getByRole('link', { name: /^Papers/ }).getAttribute('href')).toBe('#/records/all/papers')
  })

  it('shows a count per tab for the person and status filter', async () => {
    render(<Records id="p1" />)
    expect(await screen.findByRole('link', { name: 'Laboratory 3' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Prescriptions 2' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Allergies and conditions 2' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Papers 1' })).toBeTruthy() // the ID card is not counted
    fireEvent.click(screen.getByRole('button', { name: 'Confirmed' }))
    expect(await screen.findByRole('link', { name: 'Laboratory 1' })).toBeTruthy()
  })

  it('Laboratory: value with unit, range, flag word, source, and filters by status chip', async () => {
    render(<Records id={null} />)
    const row = (await screen.findByRole('button', { name: 'LDL Test' })).closest('tr')!
    expect(within(row).getByText('95 mg/dL')).toBeTruthy()
    expect(within(row).getByText('0 to 100')).toBeTruthy()
    expect(within(row).getByText('High')).toBeTruthy()
    expect(within(row).getByText('Lab paper')).toBeTruthy()
    expect(row.className).toContain('rc-abn')
    fireEvent.click(screen.getByRole('button', { name: 'Rejected' }))
    await waitFor(() => expect(screen.getByText(/No laboratory for these filters/)).toBeTruthy())
  })

  it('searches client-side and says when it is showing the newest 500', async () => {
    tables.lab_results = Array.from({ length: 501 }, (_, i) => lab(`x${i}`, i === 7 ? 'Special Test' : 'Plain Test', { collected_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` }))
    render(<Records id={null} />)
    expect(await screen.findByText(/Showing the newest 500/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'special' } })
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Special Test' })).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Plain Test' })).toBeNull()
  })

  it('sorts a column and flips on a second click', async () => {
    render(<Records id={null} />)
    await screen.findByRole('button', { name: 'LDL Test' })
    const names = () => screen.getAllByRole('button', { name: /Test$/ }).filter((b) => b.className === 'dk-rowbtn').map((b) => b.textContent)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(names()).toEqual(['Glucose Test', 'HDL Test', 'LDL Test'])
    fireEvent.click(screen.getByRole('button', { name: /^Test/ }))
    expect(names()).toEqual(['LDL Test', 'HDL Test', 'Glucose Test'])
  })

  it('Prescriptions groups the lines under their header and flags an unclear line', async () => {
    render(<Records id={null} sub="rx" />)
    const a = await screen.findByRole('region', { name: 'Prescription 2026-08-01' })
    expect(within(a).getByRole('button', { name: 'Alpha Drug' })).toBeTruthy()
    expect(within(a).getByRole('button', { name: 'Beta Drug' })).toBeTruthy()
    expect(within(a).queryByRole('button', { name: 'Gamma Drug' })).toBeNull()
    expect(within(a).getByText('Unclear: check the photo')).toBeTruthy()
    const b = screen.getByRole('region', { name: 'Prescription 2026-07-01' })
    expect(within(b).getByRole('button', { name: 'Gamma Drug' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'gamma' } })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Prescription 2026-08-01' })).toBeNull())
  })

  it('Prescriptions: confirming one line is an item-level write', async () => {
    render(<Records id={null} sub="rx" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Beta Drug' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm' }))
    await screen.findByText('Confirmed.')
    expect(writes.find((w) => w.t === 'prescription_items')).toMatchObject({ patch: { status: 'confirmed' }, ids: ['ib'] })
  })

  it('Allergies and conditions shows one section for each', async () => {
    render(<Records id={null} sub="conditions" />)
    expect(await screen.findByRole('button', { name: 'Test Dust' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Test Condition' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Allergies' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Conditions' })).toBeTruthy()
  })

  it('bulk: Confirm N sends the ticked ids after a confirm step; Undo puts them back', async () => {
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select LDL Test' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select HDL Test' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 2' }))
    expect(writes).toHaveLength(0) // nothing yet: the dialog asks first
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await screen.findByText('2 confirmed.')
    expect([...writes.find((w) => w.t === 'lab_results')!.ids].sort()).toEqual(['l1', 'l3'])
    writes.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(writes.find((w) => w.t === 'lab_results')).toMatchObject({ patch: { status: 'draft' } }))
    expect([...writes.find((w) => w.t === 'lab_results')!.ids].sort()).toEqual(['l1', 'l3'])
  })

  it('bulk: Reject N rejects the ticked rows only', async () => {
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select LDL Test' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject 1' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await screen.findByText('Rejected.')
    expect(writes.find((w) => w.t === 'lab_results')).toMatchObject({ patch: { status: 'rejected' }, ids: ['l1'] })
  })

  it('embedded: no heading or person picker, and a tab click never touches location.hash', async () => {
    location.hash = '#/members/p1'
    tables.medications = [{ id: 'm1', person_id: 'p1', name: 'Test Medicine', status: 'draft', deleted_at: null }]
    render(<Records id="p1" embedded />)
    expect(await screen.findByRole('button', { name: 'LDL Test' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByLabelText('Person')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /^Medicines/ }))
    expect(await screen.findByRole('button', { name: 'Test Medicine' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Medicines/ }).getAttribute('aria-selected')).toBe('true')
    expect(location.hash).toBe('#/members/p1')
  })

  it('the person picker is a select that routes to #/records/<id>/<tab>', async () => {
    location.hash = ''
    render(<Records id={null} sub="meds" />)
    const pick = (await screen.findByLabelText('Person')) as HTMLSelectElement
    await waitFor(() => expect(within(pick).getByRole('option', { name: 'Test Person' })).toBeTruthy())
    fireEvent.change(pick, { target: { value: 'p1' } })
    expect(location.hash).toBe('#/records/p1/meds')
  })
})

describe('Records detail', () => {
  it('a row opens the panel with source pages, editable inputs and read-only fields', async () => {
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'LDL Test' }))
    const panel = await screen.findByRole('dialog')
    expect(await within(panel).findByAltText('Source page page1.jpg')).toHaveProperty('src', 'https://files.test/p1/a.jpg')
    expect(within(panel).getByRole('link', { name: 'Open old.pdf in Drive' }).getAttribute('href')).toBe('https://drive.google.com/file/d/abc123/view')
    expect(within(panel).getByLabelText('Value')).toBeTruthy() // EDITABLE
    expect(within(panel).queryByLabelText('status')).toBeNull() // read-only column is not an input
    expect(within(panel).getByText('Read confidence')).toBeTruthy()
  })

  it('Confirm writes the status, settles the paper and Undo puts the old status back', async () => {
    tables.lab_results = tables.lab_results.filter((r) => r.id === 'l1'); tables.prescriptions = []
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'LDL Test' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }))
    await screen.findByText('Confirmed.')
    expect(writes.find((w) => w.t === 'lab_results')).toMatchObject({ patch: { status: 'confirmed' }, ids: ['l1'] })
    expect(tables.documents[0].status).toBe('confirmed') // no draft row left: settleDocument closed it
    writes.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(writes.find((w) => w.t === 'lab_results')).toMatchObject({ patch: { status: 'draft' }, ids: ['l1'] }))
    await waitFor(() => expect(tables.documents[0].status).toBe('draft'))
  })

  it('S11: confirming a row of a paper printed with another name asks first and writes nothing until "Confirm anyway"', async () => {
    tables.lab_results = tables.lab_results.filter((r) => r.id === 'l1'); tables.prescriptions = []
    tables.documents[0].printed_name = 'Rosa Dela Cruz'
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'LDL Test' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }))
    const warn = await screen.findByRole('alertdialog')
    expect(warn.textContent).toContain('Name on paper: Rosa Dela Cruz (filed under Test Person)')
    expect(writes.filter((w) => w.patch.status)).toEqual([])
    fireEvent.click(within(warn).getByRole('button', { name: 'Confirm anyway' }))
    await screen.findByText('Confirmed.')
    expect(writes.find((w) => w.t === 'lab_results')).toMatchObject({ patch: { status: 'confirmed' }, ids: ['l1'] })
  })

  it('Reject offers Undo too, and a medicine (not on the phone list) is a plain update', async () => {
    tables.medications = [{ id: 'm1', person_id: 'p1', name: 'Test Medicine', status: 'draft', deleted_at: null }, { id: 'm2', person_id: 'p1', name: 'Gone Medicine', status: 'draft', deleted_at: '2026-01-01' }]
    render(<Records id={null} sub="meds" />)
    expect(await screen.findByRole('button', { name: 'Test Medicine' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gone Medicine' })).toBeNull() // soft-deleted are hidden
    fireEvent.click(screen.getByRole('button', { name: 'Test Medicine' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).queryByRole('button', { name: 'Save fix' })).toBeNull() // nothing editable on this kind
    fireEvent.click(within(panel).getByRole('button', { name: 'Reject' }))
    await screen.findByText('Rejected.')
    expect(writes[0]).toMatchObject({ t: 'medications', patch: { status: 'rejected' }, ids: ['m1'] })
  })

  it('saving a fix sends only the changed EDITABLE column', async () => {
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'LDL Test' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.change(within(panel).getByLabelText('Unit'), { target: { value: 'mmol/L' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save fix' }))
    await screen.findByText('Saved.')
    const w = writes.find((x) => x.patch.unit_raw === 'mmol/L')!
    expect(Object.keys(w.patch).sort()).toEqual(['unit_raw', 'value_canonical'])
  })
})

describe('buildEditPatch', () => {
  const row = { value_num: 5, unit_raw: 'mg', ref_low: null, collected_at: '2026-09-01T00:00:00Z' }
  it('sends changed columns only; empty is null, never 0', () => {
    expect(buildEditPatch('lab_results', row, { value_num: '5', unit_raw: 'mg', ref_low: '', collected_at: '2026-09-01' })).toEqual({ patch: {} })
    expect(buildEditPatch('lab_results', row, { value_num: '', unit_raw: 'mg' })).toEqual({ patch: { value_num: null } })
    expect(buildEditPatch('lab_results', row, { value_num: '7,5', unit_raw: 'mg', ref_low: '0' })).toEqual({ patch: { value_num: 7.5, ref_low: 0 } })
  })
  it('rejects a bad number and ignores columns that are not editable', () => {
    expect(buildEditPatch('lab_results', row, { value_num: 'x' })).toEqual({ error: 'Value must be a number' })
    expect(buildEditPatch('lab_results', row, { status: 'confirmed', unit_raw: 'mg', value_num: '5' })).toEqual({ patch: {} })
  })
})
