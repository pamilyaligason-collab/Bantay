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
    from: (t: string) => {
      let patch: R | null = null
      let rng: [number, number] | null = null
      const fs: ((r: R) => boolean)[] = []
      const b: R = {}
      const add = (n: string, f: (...a: any[]) => (r: R) => boolean) => { b[n] = (...a: unknown[]) => { fs.push(f(...a)); return b } } // eslint-disable-line @typescript-eslint/no-explicit-any
      add('eq', (c, v) => (r) => r[c] === v); add('neq', (c, v) => (r) => r[c] !== v); add('in', (c, v) => (r) => v.includes(r[c]))
      add('is', (c) => (r) => r[c] == null)
      add('not', (c, op) => (r) => (op === 'is' ? r[c] != null : true))
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
import Duplicates from './Duplicates'

const SHA = 'a'.repeat(64)
const mk = (): Record<string, R[]> => ({
  people: [{ id: 'p1', display_name: 'Test Person' }],
  documents: [
    { id: 'a', person_id: 'p1', kind: 'prescription', status: 'draft', doc_date: '2026-09-01', facility: 'Test Clinic', title: null, created_at: '2026-10-01T00:00:00Z' },
    { id: 'b', person_id: 'p1', kind: 'prescription', status: 'draft', doc_date: '2026-09-01', facility: 'Test Clinic', title: null, created_at: '2026-10-02T00:00:00Z' }
  ],
  source_files: [{ sha256: SHA, document_id: 'a' }, { sha256: SHA, document_id: 'b' }],
  lab_results: [], vaccinations: [], imaging_reports: [],
  prescriptions: [{ id: 'rxa', document_id: 'a', status: 'draft' }, { id: 'rxb', document_id: 'b', status: 'draft' }],
  prescription_items: [
    { id: 'ia', prescription_id: 'rxa', line_no: 1, drug_raw: 'Test Drug', dose: '1 tab', frequency: 'daily', status: 'draft' },
    { id: 'ib', prescription_id: 'rxb', line_no: 1, drug_raw: 'Test Drug', dose: '2 tabs', frequency: 'daily', status: 'draft' }
  ]
})
let tables: Record<string, R[]>
let writes: W[]
beforeEach(() => { tables = mk(); writes = []; h.sb = fakeSb(tables, writes) })
afterEach(cleanup)
const statusWrites = () => writes.filter((w) => w.patch.status).map((w) => [w.t, w.patch.status, [...w.ids].sort()])

describe('Duplicates', () => {
  it('shows a pair side by side with counts and the prescription line differences', async () => {
    render(<Duplicates id={null} />)
    const c1 = await screen.findByRole('article', { name: 'Copy 1' })
    expect(within(c1).getByText('Prescription lines').nextSibling?.textContent).toBe('1 (0 confirmed)')
    expect(screen.getByRole('article', { name: 'Copy 2' })).toBeTruthy()
    const diff = screen.getByRole('table', { name: /Prescription line differences/ })
    expect(within(diff).getByText('1 tab')).toBeTruthy()
    expect(within(diff).getByText(/2 tabs/)).toBeTruthy()
    expect(within(diff).queryByText('frequency')).toBeNull() // identical fields are not listed
  })

  it('Keep this one asks first, rejects only the other copy and its draft rows, and Undo restores them', async () => {
    render(<Duplicates id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Keep copy 1 in group 1' }))
    expect(statusWrites()).toEqual([])
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await screen.findByText('Kept this copy.')
    expect(statusWrites()).toEqual([['prescription_items', 'rejected', ['ib']], ['prescriptions', 'rejected', ['rxb']], ['documents', 'rejected', ['b']]])
    expect(tables.documents.find((d) => d.id === 'a')!.status).toBe('draft') // the kept copy is untouched
    writes.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(statusWrites()).toContainEqual(['documents', 'draft', ['b']]))
    expect(statusWrites()).toContainEqual(['prescription_items', 'draft', ['ib']])
    expect(tables.documents.find((d) => d.id === 'b')!.status).toBe('draft')
  })

  it('refuses when the other copy has a confirmed row, and writes nothing', async () => {
    tables.prescription_items[1].status = 'confirmed'
    render(<Duplicates id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Keep copy 1 in group 1' }))
    expect(await screen.findByText('This copy has confirmed rows. Check it in Records first.')).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(writes).toEqual([])
    // the confirmed copy can be the one kept: then copy 1 (all draft) is rejected
    fireEvent.click(screen.getByRole('button', { name: 'Keep copy 2 in group 1' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
  })

  it('no groups: says so', async () => {
    tables.source_files = [{ sha256: SHA, document_id: 'a' }]
    render(<Duplicates id={null} />)
    expect(await screen.findByText('No duplicate papers.')).toBeTruthy()
  })

  it('a load error shows Retry, not "No duplicate papers"', async () => {
    h.sb = null
    render(<Duplicates id={null} />)
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByText('No duplicate papers.')).toBeNull()
  })
})
