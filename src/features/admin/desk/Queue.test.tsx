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
import Queue from './Queue'

const mk = (): Record<string, R[]> => ({
  people: [{ id: 'p1', display_name: 'Test Person' }],
  documents: [
    { id: 'd1', person_id: 'p1', kind: 'lab', status: 'draft', doc_date: '2026-09-01', facility: 'Test Clinic', title: null },
    { id: 'd2', person_id: 'p1', kind: 'prescription', status: 'draft', doc_date: '2026-08-01', facility: 'Test Clinic', title: null }
  ],
  lab_results: [
    { id: 'l1', document_id: 'd1', person_id: 'p1', name_raw: 'LDL Test', value_num: 95, unit_raw: 'mg/dL', confidence: 0.95, status: 'draft' },
    { id: 'l2', document_id: 'd1', person_id: 'p1', name_raw: 'Glucose Test', value_num: 180, unit_raw: 'mg/dL', confidence: 0.6, status: 'draft' },
    { id: 'l3', document_id: 'd1', person_id: 'p1', name_raw: 'Blank Test', value_num: null, value_text: null, confidence: 0.9, status: 'draft' }
  ],
  vaccinations: [], imaging_reports: [], source_files: [],
  prescriptions: [{ id: 'rx1', document_id: 'd2', status: 'draft' }],
  prescription_items: [
    { id: 'i1', prescription_id: 'rx1', line_no: 1, person_id: 'p1', drug_raw: 'Test Drug A', strength: '10 mg', unclear: false, confidence: 0.9, status: 'draft' },
    { id: 'i2', prescription_id: 'rx1', line_no: 2, person_id: 'p1', drug_raw: null, unclear: true, confidence: 0.9, status: 'draft' }
  ]
})
let tables: Record<string, R[]>
let writes: W[]
beforeEach(() => { tables = mk(); writes = []; h.sb = fakeSb(tables, writes) })
afterEach(cleanup)
const statusWrites = () => writes.filter((w) => w.patch.status).map((w) => [w.t, w.patch.status, [...w.ids].sort()])
const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[]

describe('Confirm queue', () => {
  it('groups by person then paper, with totals by kind, and starts low-confidence, blank and unclear rows unchecked', async () => {
    render(<Queue id={null} />)
    expect(await screen.findByRole('heading', { name: 'Test Person' })).toBeTruthy()
    expect(screen.getByTestId('q-totals').textContent).toContain('Lab results 3 · Prescription lines 2')
    expect(screen.getAllByRole('table')).toHaveLength(2)
    const on = Object.fromEntries(boxes().filter((b) => b.getAttribute('aria-label')).map((b) => [b.getAttribute('aria-label'), b.checked]))
    expect(on).toEqual({ 'Include LDL Test': true, 'Include Glucose Test': false, 'Include Blank Test': false, 'Include Test Drug A': true, 'Line that could not be read is unclear: confirm it on its own': false })
    expect(boxes().find((b) => b.disabled)).toBeTruthy() // the unclear line cannot be ticked
    expect(screen.getByRole('button', { name: 'Confirm 2 checked' })).toBeTruthy()
  })

  it('bulk confirm asks first, then sends only the checked ids and offers Undo', async () => {
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 2 checked' }))
    expect(statusWrites()).toEqual([]) // nothing yet: the dialog is open
    const dlg = await screen.findByRole('alertdialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(statusWrites()).toContainEqual(['prescription_items', 'confirmed', ['i1']]))
    expect(statusWrites()).toContainEqual(['lab_results', 'confirmed', ['l1']])
    expect(JSON.stringify(statusWrites())).not.toContain('l2')
    expect(JSON.stringify(statusWrites())).not.toContain('i2')
    await screen.findByText('2 confirmed.')
    writes.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(statusWrites()).toContainEqual(['lab_results', 'draft', ['l1']]))
    expect(statusWrites()).toContainEqual(['prescription_items', 'draft', ['i1']])
  })

  it('one checked row confirms without a dialog', async () => {
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    fireEvent.click(screen.getByLabelText('Include Test Drug A')) // uncheck: 1 left
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 checked' }))
    await waitFor(() => expect(statusWrites()).toContainEqual(['lab_results', 'confirmed', ['l1']]))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('S11: a paper printed with another name asks "Name on paper" before it is confirmed; an alias or a matching name does not', async () => {
    tables.documents[0].printed_name = 'Rosa Dela Cruz'
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    fireEvent.click(screen.getByLabelText('Include Test Drug A')) // 1 row left: no generic dialog, only the name warning
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 checked' }))
    const dlg = await screen.findByRole('alertdialog')
    expect(dlg.textContent).toContain('Name on paper: Rosa Dela Cruz (filed under Test Person)')
    expect(statusWrites()).toEqual([])
    fireEvent.click(within(dlg).getByRole('button', { name: 'Confirm anyway' }))
    await waitFor(() => expect(statusWrites()).toContainEqual(['lab_results', 'confirmed', ['l1']]))
  })

  it('S11: bulk confirm shows the generic question, then the name warning, and cancelling the warning writes nothing', async () => {
    tables.documents[0].printed_name = 'Rosa Dela Cruz'
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 2 checked' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    const warn = await screen.findByText(/Name on paper: Rosa Dela Cruz/)
    expect(warn).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(statusWrites()).toEqual([])
  })

  it('S11: an alias in person_aliases clears the warning', async () => {
    tables.documents[0].printed_name = 'Rosa Dela Cruz'
    tables.person_aliases = [{ alias: 'rosa dela cruz', person_id: 'p1' }]
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    fireEvent.click(screen.getByLabelText('Include Test Drug A'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 checked' }))
    await waitFor(() => expect(statusWrites()).toContainEqual(['lab_results', 'confirmed', ['l1']]))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('Reject paper asks first and rejects every draft row of that paper only', async () => {
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    fireEvent.click(screen.getByRole('button', { name: /Reject paper Lab results/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(statusWrites()).toContainEqual(['lab_results', 'rejected', ['l1', 'l2', 'l3']]))
    expect(statusWrites().some((w) => w[0] === 'prescription_items')).toBe(false)
    expect(tables.documents.find((d) => d.id === 'd1')!.status).toBe('rejected') // settleDocument closed the paper
  })

  it('an unclear line is confirmed on its own and never in a bulk call', async () => {
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Line that could not be read' }))
    await waitFor(() => expect(statusWrites()).toContainEqual(['prescription_items', 'confirmed', ['i2']]))
  })

  it('keyboard: j/k move focus, x toggles, c confirms; typing in a field is ignored', async () => {
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    const key = (k: string, el: Element = document.body) => fireEvent.keyDown(el, { key: k })
    key('j')
    await waitFor(() => expect(document.activeElement?.getAttribute('data-row')).toBe('l1'))
    key('j'); key('j')
    await waitFor(() => expect(document.activeElement?.getAttribute('data-row')).toBe('l3'))
    key('x') // l3 on
    expect(screen.getByRole('button', { name: 'Confirm 3 checked' })).toBeTruthy()
    key('k'); key('k'); key('k') // stays on the first row
    expect(document.activeElement?.getAttribute('data-row')).toBe('l1')
    fireEvent.click(screen.getByRole('button', { name: 'Fix LDL Test' }))
    const input = (await screen.findAllByRole('textbox'))[0]
    key('x', input); key('c', input)
    expect(screen.getByRole('button', { name: 'Confirm 3 checked' })).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    key('c') // from outside a field: 3 checked, so the dialog opens
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    key('c') // a dialog is open: ignored
  })

  it('Fix saves an edited value through the EDITABLE columns only', async () => {
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    fireEvent.click(screen.getByRole('button', { name: 'Fix LDL Test' }))
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '96,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save fix' }))
    await waitFor(() => expect(writes.some((w) => w.t === 'lab_results' && w.patch.value_num === 96.5)).toBe(true))
    const w = writes.find((x) => x.patch.value_num === 96.5)!
    expect(Object.keys(w.patch).sort()).toEqual(['value_canonical', 'value_num']) // a changed value drops the stale canonical
    expect(w.ids).toEqual(['l1'])
  })

  it('a bad number is refused before anything is sent', async () => {
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    fireEvent.click(screen.getByRole('button', { name: 'Fix LDL Test' }))
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save fix' }))
    expect((await screen.findByRole('alert')).textContent).toContain('must be a number')
    expect(writes).toEqual([])
  })

  it('an empty queue says so', async () => {
    tables.documents = []; tables.lab_results = []; tables.prescription_items = []; tables.prescriptions = []
    render(<Queue id={null} />)
    expect(await screen.findByText('Nothing to confirm.')).toBeTruthy()
  })
})

describe('Queue load error', () => {
  it('says it could not load, with Retry, and never "Nothing to confirm"', async () => {
    h.sb = null // not connected: the load fails
    render(<Queue id={null} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/./)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByText('Nothing to confirm.')).toBeNull()
    h.sb = fakeSb(tables, writes)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await screen.findAllByRole('table')).length).toBe(2)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })
  it('shows the range and a High/Low tag for a lab value', async () => {
    tables.lab_results[0] = { ...tables.lab_results[0], ref_low: 0, ref_high: 90 }
    render(<Queue id={null} />)
    await screen.findByRole('heading', { name: 'Test Person' })
    expect(screen.getByText('Range 0 to 90')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
  })
})

describe('Queue per person and source link', () => {
  it("#/queue/<personId> shows only that person's papers", async () => {
    tables.people.push({ id: 'p2', display_name: 'Other Person' })
    tables.documents.push({ id: 'd3', person_id: 'p2', kind: 'lab', status: 'draft', doc_date: '2026-09-02', facility: 'Test Clinic', title: null })
    tables.lab_results.push({ id: 'l9', document_id: 'd3', person_id: 'p2', name_raw: 'Other Test', value_num: 1, confidence: 0.9, status: 'draft' })
    render(<Queue id="p2" />)
    expect(await screen.findByRole('heading', { name: 'Other Person' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Test Person' })).toBeNull()
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(screen.getByLabelText('Include Other Test')).toBeTruthy()
  })
  it('the 60 s signed link is renewed once after the image fails, not in a loop', async () => {
    tables.source_files = [{ id: 'f1', document_id: 'd1', name: 'page1.jpg', mime: 'image/jpeg', drive_file_id: null, storage_path: 'p1/a.jpg', page_no: 1, sha256: 'b'.repeat(64) }]
    let signs = 0
    const sb = h.sb as { storage: unknown }
    sb.storage = { from: () => ({ createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://files.test/${p}?n=${++signs}` }, error: null }) }) }
    render(<Queue id={null} />)
    const img = await screen.findByRole('img', { name: 'Source page page1.jpg' })
    expect(signs).toBe(1)
    fireEvent.error(img)
    await waitFor(() => expect(signs).toBe(2))
    fireEvent.error(screen.getByRole('img', { name: 'Source page page1.jpg' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(signs).toBe(2) // only one retry per page
  })
  it('the signed link is renewed every 50 s while the paper is shown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      tables.source_files = [{ id: 'f1', document_id: 'd1', name: 'page1.jpg', mime: 'image/jpeg', drive_file_id: null, storage_path: 'p1/a.jpg', page_no: 1, sha256: 'b'.repeat(64) }]
      let signs = 0
      const sb = h.sb as { storage: unknown }
      sb.storage = { from: () => ({ createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://files.test/${p}?n=${++signs}` }, error: null }) }) }
      render(<Queue id={null} />)
      await screen.findByRole('img', { name: 'Source page page1.jpg' })
      expect(signs).toBe(1)
      await vi.advanceTimersByTimeAsync(50_000)
      expect(signs).toBe(2)
      await vi.advanceTimersByTimeAsync(50_000)
      expect(signs).toBe(3)
    } finally { vi.useRealTimers() }
  })
})

describe('Queue select all', () => {
  it('ticks every clear row and empty paper, leaves unclear lines out and says so before confirming', async () => {
    tables.documents.push({ id: 'd3', person_id: 'p1', kind: 'other', status: 'draft', doc_date: '2026-07-01', facility: 'Test Clinic', title: 'Empty paper' })
    render(<Queue id={null} />)
    const all = await screen.findByRole('checkbox', { name: /Select all \(5\)/ }) // l1, l2, l3, i1 and the empty paper d3; i2 is unclear
    expect(screen.getByRole('note').textContent).toMatch(/1 prescription line has unclear handwriting/)
    fireEvent.click(all)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 5 checked' }))
    const dlg = await screen.findByRole('alertdialog')
    expect(dlg.textContent).toMatch(/Confirm 4 rows and 1 paper with no rows\?/)
    expect(dlg.textContent).toMatch(/1 line has unclear handwriting and is not included/)
    fireEvent.click(within(dlg).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(statusWrites()).toEqual(expect.arrayContaining([['lab_results', 'confirmed', ['l1', 'l2', 'l3']], ['prescription_items', 'confirmed', ['i1']], ['documents', 'confirmed', ['d3']]])))
    expect(tables.prescription_items.find((r) => r.id === 'i2')!.status).toBe('draft')
  })
  it('unticks everything when clicked again', async () => {
    render(<Queue id={null} />)
    const all = await screen.findByRole('checkbox', { name: /Select all/ })
    fireEvent.click(all) // partly ticked by default -> all
    fireEvent.click(all) // -> none
    expect(screen.queryByRole('button', { name: /^Confirm \d+ checked$/ })).toBeNull() // the sticky bar only shows while something is ticked
  })
})
