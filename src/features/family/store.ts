import Dexie, { type Table } from 'dexie'
import { enqueue } from '../../db'

// Family plan (migration 0012): tasks, calendar events and notes. Local first, then the outbox.
// Own Dexie database so the main schema version is never bumped for this. Unknown is null, never ''.
export interface FamilyTask { id?: number; clientId: string; title: string; due: string | null; assigneePersonId: string | null; done: boolean }
export interface FamilyEvent { id?: number; clientId: string; title: string; startsAt: string; endsAt: string | null; allDay: boolean; personId: string | null }
export interface FamilyNote { id?: number; clientId: string; body: string; pinned: boolean }

class FamilyDB extends Dexie {
  tasks!: Table<FamilyTask, number>
  events!: Table<FamilyEvent, number>
  notes!: Table<FamilyNote, number>
  constructor() {
    super('bantay-family')
    this.version(1).stores({ tasks: '++id, &clientId, due', events: '++id, &clientId, startsAt', notes: '++id, &clientId' })
  }
}
export const fdb = new FamilyDB()

type Kind = 'family_tasks' | 'family_events' | 'family_notes'
const TABLE = { family_tasks: () => fdb.tasks, family_events: () => fdb.events, family_notes: () => fdb.notes } as const
const tbl = (k: Kind) => TABLE[k]() as unknown as Table<{ id?: number; clientId: string }, number>

/** Fields the server needs on every write: the upsert's insert half must satisfy NOT NULL even when the row exists. */
const send = (k: Kind, row: { id?: number; clientId: string }, deletedAt: string | null) => {
  const { id: _local, ...rest } = row // the local Dexie id must not travel: sync would treat it as a local row to stamp
  return enqueue(k, 'upsert', { ...rest, client_id: row.clientId, deletedAt })
}

/** Save a new or edited row: local copy first (the screen updates now), then one outbox upsert on client_id. Works offline. */
export async function saveRow<T extends { id?: number; clientId: string }>(k: Kind, row: T): Promise<T> {
  const t = tbl(k)
  const have = await t.where('clientId').equals(row.clientId).first()
  const { id: _drop, ...bare } = row
  const id = have ? have.id! : await t.add(bare)
  if (have) await t.put({ ...bare, id })
  await send(k, row, null)
  return { ...row, id }
}

/** Delete = remove the local copy and tell the server with deleted_at (a soft delete, so other phones drop it too). */
export async function removeRow(k: Kind, row: { id?: number; clientId: string }): Promise<void> {
  if (row.id != null) await tbl(k).delete(row.id)
  else await tbl(k).where('clientId').equals(row.clientId).delete()
  await send(k, row, new Date().toISOString())
}

export const newClientId = (): string => crypto.randomUUID()

/** Trimmed text, or null when empty (unknown is null, never ''). */
export const blank = (s: string | null | undefined) => (typeof s === 'string' && s.trim() ? s.trim() : null)
