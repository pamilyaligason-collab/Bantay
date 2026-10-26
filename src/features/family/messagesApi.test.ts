import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/client', () => ({ supabase: {} }))
const syncNow = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../sync/sync', () => ({ syncNow }))

import { db } from '../../db'
import { toRow } from '../sync/tables'
import { listQueued, sendText } from './messagesApi'

beforeEach(async () => { await db.outbox.clear(); syncNow.mockClear() })

describe('family text through the outbox', () => {
  it('queues a trimmed text with a client id and asks sync to run, with no network call', async () => {
    expect(await sendText('  Kumain na  ')).toEqual({ ok: true, data: null })
    const rows = await db.outbox.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ table: 'family_messages', op: 'insert', payload: { kind: 'text', body: 'Kumain na' } })
    expect(typeof (rows[0]!.payload as { client_id: string }).client_id).toBe('string')
    await vi.waitFor(() => expect(syncNow).toHaveBeenCalledTimes(1))
  })
  it('refuses an empty text without queueing', async () => {
    expect(await sendText('   ')).toEqual({ ok: false, error: 'failed' })
    expect(await db.outbox.count()).toBe(0)
  })
  it('lists queued texts oldest first and hides the ones the thread already returned', async () => {
    await sendText('one'); await sendText('two')
    const all = await listQueued(new Set())
    expect(all.map((m) => m.body)).toEqual(['one', 'two'])
    expect(all.every((m) => m.queued && m.mine)).toBe(true)
    const sent = new Set([all[0]!.clientId!])
    expect((await listQueued(sent)).map((m) => m.body)).toEqual(['two'])
  })
  it('sync sends only kind, body and client_id (the server stamps the sender)', () => {
    expect(toRow('family_messages', { kind: 'text', body: 'hi', client_id: 'c', senderId: 'x', attachmentPath: 'p' }, 'c')).toEqual({ kind: 'text', body: 'hi', client_id: 'c' })
  })
})
