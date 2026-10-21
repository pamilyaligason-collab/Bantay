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
      const fs: ((r: R) => boolean)[] = []
      const b: R = {}
      const add = (n: string, f: (...a: any[]) => (r: R) => boolean) => { b[n] = (...a: unknown[]) => { fs.push(f(...a)); return b } } // eslint-disable-line @typescript-eslint/no-explicit-any
      add('eq', (c, v) => (r) => r[c] === v); add('neq', (c, v) => (r) => r[c] !== v); add('in', (c, v) => (r) => v.includes(r[c]))
      add('is', (c) => (r) => r[c] == null); add('gte', (c, v) => (r) => String(r[c] ?? '') >= v); add('lte', (c, v) => (r) => String(r[c] ?? '') <= v)
      add('not', (c, op, v) => (r) => (op === 'is' ? r[c] != null : !String(v).slice(1, -1).split(',').includes(String(r[c]))))
      for (const n of ['select', 'order', 'limit']) b[n] = () => b
      b.range = (a: number, z: number) => { rng = [a, z]; return b }
      b.update = (p: R) => { patch = p; return b }
      b.then = (res: (v: unknown) => unknown) => {
        const rows = (tables[t] ?? []).filter((r) => fs.every((f) => f(r)))
        if (patch) { for (const r of rows) Object.assign(r, patch); writes.push({ t, patch, ids: rows.map((r) => r.id) }) }
        return Promise.resolve({ data: (rng ? rows.slice(rng[0], rng[1] + 1) : rows).map((r) => ({ ...r })), error: null }).then(res)
      }
      return b
    }
  }
}
configure({ asyncUtilTimeout: 6000 })
import Records, { buildEditPatch } from './Records'

const lab = (id: string, name: string, o: R = {}): R => ({ id, document_id: 'd1', person_id: 'p1', name_raw: name, value_num: 95, unit_raw: 'mg/dL', confidence: 0.9, status: 'draft', collected_at: '2026-09-01T00:00:00Z', client_id: 'c', ...o })
const mk = (): Record<string, R[]> => ({
  people: [{ id: 'p1', display_name: 'Test Person' }, { id: 'p2', display_name: 'Other Person' }],
  documents: [
    { id: 'd1', person_id: 'p1', kind: 'lab', status: 'draft', doc_date: '2026-09-01', facility: 'Test Clinic', title: 'Lab paper' },
    { id: 'd9', person_id: 'p1', kind: 'id_card', status: 'confirmed', doc_date: null, facility: null, title: 'Card' }
  ],
  lab_results: [lab('l1', 'LDL Test'), lab('l2', 'Glucose Test', { status: 'confirmed', collected_at: '2026-08-01T00:00:00Z' })],
  prescriptions: [], vaccinations: [], imaging_reports: [],
  source_files: [{ id: 'f1', document_id: 'd1', name: 'page1.jpg', mime: 'image/jpeg', drive_file_id: null, storage_path: 'p1/a.jpg', page_no: 1 }, { id: 'f2', document_id: 'd1', name: 'old.pdf', mime: 'application/pdf', drive_file_id: 'abc123', storage_path: null, page_no: 2 }]
})
let tables: Record<string, R[]>
let writes: W[]
beforeEach(() => { tables = mk(); writes = []; h.sb = fakeSb(tables, writes) })
afterEach(cleanup)

describe('Records', () => {
  it('lists papers without ID cards and filters by status chip', async () => {
    render(<Records id={null} />)
    expect(await screen.findByRole('button', { name: 'Lab paper' })).toBeTruthy()
    expect(screen.queryByText('Card')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmed' }))
    await waitFor(() => expect(screen.getByText('Nothing matches.')).toBeTruthy())
  })

  it('switches kind, searches client-side, and says when it is showing the newest 500', async () => {
    tables.lab_results = Array.from({ length: 501 }, (_, i) => lab(`x${i}`, i === 7 ? 'Special Test' : 'Plain Test', { collected_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` }))
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Labs' }))
    expect(await screen.findByText(/Showing the newest 500/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'special' } })
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Special Test' })).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Plain Test' })).toBeNull()
  })

  it('a row opens the panel with source pages, editable inputs and read-only fields', async () => {
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Labs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'LDL Test' }))
    const panel = await screen.findByRole('dialog')
    expect(await within(panel).findByAltText('Source page page1.jpg')).toHaveProperty('src', 'https://files.test/p1/a.jpg')
    expect(within(panel).getByRole('link', { name: 'Open old.pdf in Drive' }).getAttribute('href')).toBe('https://drive.google.com/file/d/abc123/view')
    expect(within(panel).getByLabelText('value num')).toBeTruthy() // EDITABLE
    expect(within(panel).queryByLabelText('status')).toBeNull() // read-only column is not an input
    expect(within(panel).getByText('confidence')).toBeTruthy()
  })

  it('Confirm writes the status, settles the paper and Undo puts the old status back', async () => {
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Labs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'LDL Test' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirm' }))
    await screen.findByText('Confirmed.')
    expect(writes.find((w) => w.t === 'lab_results')).toMatchObject({ patch: { status: 'confirmed' }, ids: ['l1'] })
    expect(tables.documents[0].status).toBe('confirmed') // no draft row left: settleDocument closed it
    writes.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(writes.find((w) => w.t === 'lab_results')).toMatchObject({ patch: { status: 'draft' }, ids: ['l1'] }))
    await waitFor(() => expect(tables.documents[0].status).toBe('draft'))
  })

  it('Reject offers Undo too, and a medicine (not on the phone list) is a plain update', async () => {
    tables.medications = [{ id: 'm1', person_id: 'p1', name: 'Test Medicine', status: 'draft', deleted_at: null }, { id: 'm2', person_id: 'p1', name: 'Gone Medicine', status: 'draft', deleted_at: '2026-01-01' }]
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Medicines' }))
    expect(screen.queryByRole('button', { name: 'Gone Medicine' })).toBeNull() // soft-deleted are hidden
    fireEvent.click(await screen.findByRole('button', { name: 'Test Medicine' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).queryByRole('button', { name: 'Save fix' })).toBeNull() // nothing editable on this kind
    fireEvent.click(within(panel).getByRole('button', { name: 'Reject' }))
    await screen.findByText('Rejected.')
    expect(writes[0]).toMatchObject({ t: 'medications', patch: { status: 'rejected' }, ids: ['m1'] })
  })

  it('saving a fix sends only the changed EDITABLE column', async () => {
    render(<Records id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Labs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'LDL Test' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.change(within(panel).getByLabelText('unit raw'), { target: { value: 'mmol/L' } })
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
    expect(buildEditPatch('lab_results', row, { value_num: 'x' })).toEqual({ error: 'value num must be a number' })
    expect(buildEditPatch('lab_results', row, { status: 'confirmed', unit_raw: 'mg', value_num: '5' })).toEqual({ patch: {} })
  })
})
