import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import {
  applyKeep, CAP, countsFor, defaultChecked, groupDuplicates, listKind, KINDS, loadDuplicates, planKeep, queueKey, REFUSED, restore, rxDiff, searchRows, setStatusFor, resolveTab, TABS, toChanges, labValue, labRange, labNumber, isAbnormal, labTag, docOf, type KRow,
  type DocLite, type FileLite, type Kids, type QItem, type RxLine
} from './recordsApi'

const doc = (id: string, o: Partial<DocLite> = {}): DocLite => ({ id, person_id: 'p1', status: 'draft', doc_date: '2026-09-01', facility: 'Test Clinic', title: null, created_at: '2026-10-01T00:00:00Z', kind: 'lab', ...o })
const file = (document_id: string, sha256 = 'a'.repeat(64)): FileLite => ({ sha256, document_id })
const kids = (o: Partial<Kids> = {}): Kids => ({ labs: [], vaccinations: [], imaging: [], items: [], prescriptions: [], ...o })
const lab = (id: string, document_id: string, status: 'draft' | 'confirmed' | 'rejected' = 'draft') => ({ id, document_id, status })

describe('default-checked rule (same as the phone ConfirmSheet)', () => {
  const lbl = (row: R): QItem => ({ table: 'lab_results', row: { id: 'x', confidence: 0.9, value_num: 5, ...row } }) as QItem
  it('ticks a clear lab with a value', () => expect(defaultChecked(lbl({}))).toBe(true))
  it('leaves low confidence unticked, 0.8 exactly is fine', () => {
    expect(defaultChecked(lbl({ confidence: 0.79 }))).toBe(false)
    expect(defaultChecked(lbl({ confidence: 0.8 }))).toBe(true)
  })
  it('unknown confidence is not low; a zero value is still a value', () => {
    expect(defaultChecked(lbl({ confidence: null }))).toBe(true)
    expect(defaultChecked(lbl({ value_num: 0 }))).toBe(true)
  })
  it('leaves a lab with no value unticked', () => expect(defaultChecked(lbl({ value_num: null, value_text: null }))).toBe(false))
  it('leaves an unclear prescription line unticked', () => expect(defaultChecked({ table: 'prescription_items', row: { id: 'i', confidence: 0.99, unclear: true } } as QItem)).toBe(false))
})

describe('queue keyboard', () => {
  it('maps j k x c', () => {
    expect(['j', 'k', 'x', 'c', 'z'].map((key) => queueKey({ key, target: { tagName: 'TR' } }))).toEqual(['next', 'prev', 'toggle', 'confirm', null])
  })
  it('ignores keys while typing and with modifiers', () => {
    expect(queueKey({ key: 'c', target: { tagName: 'INPUT' } })).toBeNull()
    expect(queueKey({ key: 'x', target: { tagName: 'textarea' } })).toBeNull()
    expect(queueKey({ key: 'j', target: { tagName: 'SELECT' } })).toBeNull()
    expect(queueKey({ key: 'j', target: { tagName: 'DIV', isContentEditable: true } })).toBeNull()
    expect(queueKey({ key: 'c', target: { tagName: 'BODY' }, ctrlKey: true })).toBeNull()
  })
})

describe('search and cap', () => {
  const rows = [{ a: 'Glucose', b: null }, { a: 'LDL', b: 'glucose panel' }, { a: 'HDL', b: 'x' }]
  it('searches the given columns, case-insensitive; empty keeps all', () => {
    expect(searchRows(rows, 'GLUC', ['a', 'b'])).toHaveLength(2)
    expect(searchRows(rows, 'gluc', ['a'])).toHaveLength(1)
    expect(searchRows(rows, '  ', ['a'])).toHaveLength(3)
  })
  it('lists at most the newest 500 rows of a kind, newest first', async () => {
    const labs = Array.from({ length: 520 }, (_, i) => ({ id: `l${i}`, person_id: 'p1', name_raw: 'T', status: 'draft', collected_at: `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`, n: i }))
    h.sb = fakeSb({ lab_results: labs }, [])
    const r = await listKind(KINDS.find((k) => k.key === 'labs')!, { person: 'p1', status: 'all', from: '', to: '' })
    expect(r.ok && r.data.length).toBe(CAP)
    if (r.ok) expect(r.data[0].when! >= r.data[CAP - 1].when!).toBe(true)
  })
  it('papers skip ID and insurance cards; medicines skip deleted ones; filters by status', async () => {
    h.sb = fakeSb({
      documents: [{ id: 'd1', kind: 'lab', status: 'draft' }, { id: 'd2', kind: 'id_card', status: 'draft' }, { id: 'd3', kind: 'insurance_card', status: 'draft' }],
      medications: [{ id: 'm1', status: 'confirmed', deleted_at: null }, { id: 'm2', status: 'confirmed', deleted_at: '2026-01-01' }]
    }, [])
    const papers = await listKind(KINDS.find((k) => k.key === 'papers')!, { person: null, status: 'draft', from: '', to: '' })
    expect(papers.ok && papers.data.map((r) => r.id)).toEqual(['d1'])
    const meds = await listKind(KINDS.find((k) => k.key === 'medicines')!, { person: null, status: 'all', from: '', to: '' })
    expect(meds.ok && meds.data.map((r) => r.id)).toEqual(['m1'])
  })
  it('visits merge encounters and appointments', async () => {
    h.sb = fakeSb({ encounters: [{ id: 'e1', status: 'draft', occurred_on: '2026-05-01' }], appointments: [{ id: 'a1', status: 'draft', due_on: '2026-06-01' }] }, [])
    const r = await listKind(KINDS.find((k) => k.key === 'visits')!, { person: null, status: 'all', from: '', to: '' })
    expect(r.ok && r.data.map((x) => [x.id, x._table])).toEqual([['a1', 'appointments'], ['e1', 'encounters']])
  })
})

describe('duplicate grouping', () => {
  it('groups live documents that share a hash and a person', () => {
    const g = groupDuplicates([doc('a'), doc('b', { created_at: '2026-10-02T00:00:00Z' }), doc('c')], [file('a'), file('b'), file('c', 'b'.repeat(64))])
    expect(g).toHaveLength(1)
    expect(g[0].docs.map((d) => d.id)).toEqual(['a', 'b'])
  })
  it('ignores rejected copies, other people, and files with no hash', () => {
    expect(groupDuplicates([doc('a'), doc('b', { status: 'rejected' })], [file('a'), file('b')])).toEqual([])
    expect(groupDuplicates([doc('a'), doc('b', { person_id: 'p2' })], [file('a'), file('b')])).toEqual([])
    expect(groupDuplicates([doc('a'), doc('b')], [{ sha256: null, document_id: 'a' }, { sha256: null, document_id: 'b' }])).toEqual([])
  })
  it('one document with two pages of the same file is not a duplicate', () => {
    expect(groupDuplicates([doc('a')], [file('a'), file('a')])).toEqual([])
  })
  it('loadDuplicates finds the pair and its child rows', async () => {
    h.sb = fakeSb({
      documents: [doc('a'), doc('b')], source_files: [file('a'), file('b')],
      lab_results: [lab('l1', 'a'), lab('l2', 'b', 'confirmed')], vaccinations: [], imaging_reports: [],
      prescriptions: [{ id: 'rx1', document_id: 'a', status: 'draft' }], prescription_items: [{ id: 'i1', prescription_id: 'rx1', line_no: 1, drug_raw: 'Test Drug', status: 'draft' }]
    }, [])
    const r = await loadDuplicates()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.groups).toHaveLength(1)
    expect(countsFor('a', r.data.kids)['Prescription lines']).toEqual({ n: 1, confirmed: 0 })
    expect(countsFor('b', r.data.kids).Labs).toEqual({ n: 1, confirmed: 1 })
  })
})

describe('Keep this one', () => {
  const g = { key: 'k', docs: [doc('a'), doc('b')] }
  it('rejects the other copy and only its DRAFT rows; records the old statuses', () => {
    const p = planKeep(g, 'a', kids({
      labs: [lab('la', 'a'), lab('lb1', 'b'), lab('lb2', 'b', 'rejected')], prescriptions: [lab('rxb', 'b')],
      items: [{ id: 'ib', prescription_id: 'rxb', document_id: 'b', line_no: 1, status: 'draft' }]
    }))
    expect(p).toEqual({ ok: true, changes: [
      { table: 'lab_results', ids: ['lb1'], prev: 'draft' }, { table: 'prescription_items', ids: ['ib'], prev: 'draft' },
      { table: 'prescriptions', ids: ['rxb'], prev: 'draft' }, { table: 'documents', ids: ['b'], prev: 'draft' }
    ] })
  })
  it('refuses when the other copy has a confirmed row', () => {
    const p = planKeep(g, 'a', kids({ labs: [lab('lb', 'b', 'confirmed'), lab('lb2', 'b')] }))
    expect(p).toEqual({ ok: false, error: REFUSED })
    expect(REFUSED).toBe('This copy has confirmed rows. Check it in Records first.')
  })
  it('keeping the other way round checks the first copy instead', () => {
    expect(planKeep(g, 'b', kids({ labs: [lab('la', 'a', 'confirmed')] })).ok).toBe(false)
  })
  it('apply rejects children then the paper; undo writes the old statuses back', async () => {
    const tables = { lab_results: [{ id: 'lb1', status: 'draft' }], documents: [{ id: 'b', status: 'draft' }] }
    const writes: W[] = []
    h.sb = fakeSb(tables, writes)
    const changes = [{ table: 'lab_results', ids: ['lb1'], prev: 'draft' as const }, { table: 'documents', ids: ['b'], prev: 'draft' as const }]
    expect((await applyKeep(changes)).ok).toBe(true)
    expect(writes.map((w) => [w.t, w.patch.status])).toEqual([['lab_results', 'rejected'], ['documents', 'rejected']])
    expect(tables.documents[0].status).toBe('rejected')
    await restore(changes)
    expect(tables.lab_results[0].status).toBe('draft')
    expect(tables.documents[0].status).toBe('draft')
  })
})

describe('prescription line differences', () => {
  const l = (line_no: number, o: R): RxLine => ({ id: `i${line_no}`, prescription_id: 'r', document_id: 'a', line_no, status: 'draft', ...o }) as RxLine
  it('lists changed fields per line and missing lines', () => {
    const d = rxDiff([l(1, { drug_raw: 'Drug A', dose: '1 tab' }), l(2, { drug_raw: 'Drug B' })], [l(1, { drug_raw: 'Drug A', dose: '2 tabs', frequency: 'daily' })])
    expect(d).toEqual([
      { line: 1, field: 'frequency', a: '', b: 'daily' }, { line: 1, field: 'dose', a: '1 tab', b: '2 tabs' },
      { line: 2, field: 'drug_raw', a: 'Drug B', b: '' }
    ])
  })
  it('identical copies have no differences', () => expect(rxDiff([l(1, { drug_raw: 'X' })], [l(1, { drug_raw: 'X' })])).toEqual([]))
})

describe('status writes', () => {
  it('a table the phone does not handle gets a plain status update', async () => {
    const writes: W[] = []
    h.sb = fakeSb({ conditions: [{ id: 'c1', status: 'draft' }] }, writes)
    const r = await setStatusFor('conditions', ['c1'], 'confirmed')
    expect(r).toEqual({ ok: true, data: { changed: 1, ids: ['c1'] } })
    expect(writes[0]).toMatchObject({ t: 'conditions', patch: { status: 'confirmed' }, ids: ['c1'] })
  })
  it('no id is invalid and nothing is sent', async () => {
    const writes: W[] = []
    h.sb = fakeSb({}, writes)
    expect(await setStatusFor('conditions', [], 'rejected')).toMatchObject({ ok: false, error: 'invalid' })
    expect(writes).toEqual([])
  })
  beforeEach(() => { h.sb = null })
})

describe('tabs and lab cells', () => {
  it('resolveTab: known keys, everything else is Laboratory', () => {
    expect(TABS.map((t) => t.key)).toEqual(['lab', 'rx', 'meds', 'imaging', 'vaccines', 'ids', 'papers', 'conditions', 'visits'])
    expect(resolveTab('rx').key).toBe('rx')
    for (const bad of [null, undefined, '', 'nope', 'LAB']) expect(resolveTab(bad).key).toBe('lab')
  })
  it('lab value, range and flag keep unknown as blank, never 0', () => {
    expect(labValue({ id: 'x', value_num: 95, unit_raw: 'mg/dL' })).toBe('95 mg/dL')
    expect(labValue({ id: 'x', value_num: null, value_text: 'Negative', unit_raw: null })).toBe('Negative')
    expect(labValue({ id: 'x', value_num: null, value_text: null })).toBe('')
    expect(labNumber({ id: 'x', value_num: null })).toBeNull()
    expect(labNumber({ id: 'x', value_num: '' })).toBeNull()
    expect(labRange({ id: 'x', ref_low: 0, ref_high: 100 })).toBe('0 to 100')
    expect(labRange({ id: 'x', ref_low: null, ref_high: 5 })).toBe('5 or less')
    expect(labRange({ id: 'x', ref_low: null, ref_high: null, ref_text: 'negative' })).toBe('negative')
    expect([isAbnormal('H'), isAbnormal('L'), isAbnormal('A'), isAbnormal('N'), isAbnormal(null)]).toEqual([true, true, true, false, false])
  })
  it('labTag: printed flag first, then value against range; unknown or no range is null, never Normal', () => {
    expect(labTag({ id: 'x', flag: 'H', value_num: 50, ref_low: 0, ref_high: 100 })).toEqual({ word: 'High', tone: 'warn' }) // flag wins
    expect(labTag({ id: 'x', value_num: 120, ref_low: 0, ref_high: 100 })?.word).toBe('High')
    expect(labTag({ id: 'x', value_num: -1, ref_low: 0, ref_high: 100 })?.word).toBe('Low')
    expect(labTag({ id: 'x', value_num: 5, ref_low: 10, ref_high: null })?.word).toBe('Low')
    expect(labTag({ id: 'x', value_num: 50, ref_low: 0, ref_high: 100 })).toBeNull() // in range: no tag
    expect(labTag({ id: 'x', value_num: null, ref_low: 0, ref_high: 100 })).toBeNull() // unknown value
    expect(labTag({ id: 'x', value_num: '', ref_low: 0, ref_high: 100 })).toBeNull()
    expect(labTag({ id: 'x', value_num: 999, ref_low: null, ref_high: null })).toBeNull() // no range
  })
  it('toChanges groups by table and previous status; docOf skips papers', () => {
    const r = (id: string, _table: string, status: 'draft' | 'confirmed', document_id?: string) => ({ id, _table, status, document_id }) as KRow
    expect(toChanges([r('a', 'lab_results', 'draft'), r('b', 'lab_results', 'draft'), r('c', 'lab_results', 'confirmed'), r('d', 'medications', 'draft')])).toEqual([
      { table: 'lab_results', ids: ['a', 'b'], prev: 'draft' }, { table: 'lab_results', ids: ['c'], prev: 'confirmed' }, { table: 'medications', ids: ['d'], prev: 'draft' }
    ])
    expect(docOf(r('a', 'documents', 'draft', 'zzz'))).toBeNull()
    expect(docOf(r('a', 'lab_results', 'draft', 'd1'))).toBe('d1')
  })
})
