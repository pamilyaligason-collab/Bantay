import 'fake-indexeddb/auto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addScan, flushQueue } from '../docs/api'
import { ddb } from '../docs/store'

// Synthetic pages only. The fake records every call in order so "upload per page, then invoke" can be asserted.
type Row = Record<string, unknown>
function fake(o: { offline?: () => boolean } = {}) {
  const calls: string[] = []
  const upserts: { table: string; row: Row }[] = []
  const invoke = vi.fn(async (name: string, opts: { body: unknown }) => { calls.push(`invoke:${name}:${JSON.stringify(opts.body)}`); return { data: null, error: null } })
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: (table: string) => ({ upsert: async (row: Row) => { calls.push(`upsert:${table}`); upserts.push({ table, row }); return { error: null } } }),
    storage: { from: () => ({ upload: async (path: string) => { if (o.offline?.()) return { error: { message: 'Failed to fetch' } }; calls.push(`upload:${path}`); return { error: null } } }) },
    functions: { invoke }
  }
  return { client: client as unknown as SupabaseClient, calls, upserts, invoke }
}
const jpg = (n: string) => new Blob([n], { type: 'image/jpeg' })

beforeEach(async () => { await ddb.cards.clear(); await ddb.queue.clear() })

describe('scan queue', () => {
  it('queues N pages as one document and stores each page on the phone', async () => {
    const { docId } = await addScan({ pages: [jpg('a'), jpg('b'), jpg('c')], owner: 'u1', personId: 'p1', kind: 'lab', docDate: '2026-03-04' })
    const q = await ddb.queue.orderBy('seq').toArray()
    expect(q.map((r) => r.path)).toEqual([`p1/${docId}/p01.jpg`, `p1/${docId}/p02.jpg`, `p1/${docId}/p03.jpg`])
    expect(q.map((r) => [r.page, r.pages, r.docNew, r.kind, r.side])).toEqual([[1, 3, true, 'lab', null], [2, 3, false, 'lab', null], [3, 3, false, 'lab', null]])
    expect(await ddb.cards.count()).toBe(3)
  })

  it('offline: nothing is sent and nothing is lost; online: one upload per page, then one invoke', async () => {
    const { docId } = await addScan({ pages: [jpg('a'), jpg('b')], owner: 'u1', personId: 'p1', kind: 'prescription' })
    let off = true
    const f = fake({ offline: () => off })
    expect(await flushQueue(f.client, 'u1')).toBe(0)
    expect(f.invoke).not.toHaveBeenCalled()
    expect(await ddb.queue.count()).toBe(2)
    off = false
    expect(await flushQueue(f.client, 'u1')).toBe(2)
    await vi.waitFor(() => expect(f.invoke).toHaveBeenCalledTimes(1))
    expect(f.calls.filter((c) => c.startsWith('upload:'))).toEqual([`upload:p1/${docId}/p01.jpg`, `upload:p1/${docId}/p02.jpg`])
    expect(f.calls[f.calls.length - 1]).toBe(`invoke:records-extract:${JSON.stringify({ document_id: docId })}`)
    const doc = f.upserts.filter((u) => u.table === 'documents')
    expect(doc).toHaveLength(1)
    expect(doc[0]!.row).toMatchObject({ id: docId, kind: 'prescription', status: 'draft', card_type: null })
    expect(f.upserts.filter((u) => u.table === 'source_files').map((u) => u.row.page_no)).toEqual([1, 2])
    expect(await ddb.queue.count()).toBe(0)
  })

  it('does not invoke while pages are still waiting, and ignores a failing invoke', async () => {
    await addScan({ pages: [jpg('a'), jpg('b')], owner: 'u1', personId: 'p1', kind: 'other' })
    let calls = 0
    const f = fake({ offline: () => ++calls > 1 }) // page 1 goes, page 2 hits no signal
    await flushQueue(f.client, 'u1')
    expect(f.invoke).not.toHaveBeenCalled()
    f.invoke.mockRejectedValue(new Error('boom'))
    calls = -99
    expect(await flushQueue(f.client, 'u1')).toBe(1)
    await vi.waitFor(() => expect(f.invoke).toHaveBeenCalledTimes(1))
    expect(await ddb.queue.count()).toBe(0)
  })

  it('an ID goes the old way: confirmed, with a card type, and the server is not asked to read it', async () => {
    await addScan({ pages: [jpg('a'), jpg('b')], owner: 'u1', personId: 'p1', kind: 'id' })
    const f = fake()
    await flushQueue(f.client, 'u1')
    expect(f.upserts.find((u) => u.table === 'documents')!.row).toMatchObject({ kind: 'id_card', status: 'confirmed', card_type: 'other' })
    expect(f.upserts.filter((u) => u.table === 'source_files').map((u) => u.row.side)).toEqual(['front', 'back'])
    expect(f.invoke).not.toHaveBeenCalled()
  })
})
