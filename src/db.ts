import Dexie, { type Table } from 'dexie'

export interface OutboxRow {
  id?: number
  table: string
  op: string
  payload: unknown
  createdAt: number
  tries: number
}
export interface KvRow {
  key: string
  value: unknown
}

/** One people row's profile columns (public.people, migration 0010), camelCase. Unknown is null, never ''. */
export interface ProfileFields {
  photoPath: string | null
  phone: string | null
  birthdate: string | null
  bloodType: string | null
  allergies: string[]
  conditions: string[]
  medicines: string[]
}
export interface ProfileRow extends ProfileFields {
  id: string
  updatedAt: string | null
  /** Fields edited here that the server has not confirmed yet (they win a merge while this edit is newer). */
  pending?: (keyof ProfileFields)[]
}

class BantayDB extends Dexie {
  outbox!: Table<OutboxRow, number>
  kv!: Table<KvRow, string>
  profiles!: Table<ProfileRow, string>
  constructor() {
    super('bantay')
    // payload is stored but not indexed (objects are not valid index keys).
    this.version(1).stores({ outbox: '++id, table, op, createdAt, tries', kv: 'key' })
    // v2 only adds a table: existing outbox and kv rows are untouched.
    this.version(2).stores({ outbox: '++id, table, op, createdAt, tries', kv: 'key', profiles: 'id' })
  }
}

export const db = new BantayDB()

export const enqueue = (table: string, op: string, payload: unknown) =>
  db.outbox.add({ table, op, payload, createdAt: Date.now(), tries: 0 })

/** Send queued rows oldest first. A row is deleted only after sendFn resolves.
 *  On reject: tries += 1 and draining stops, so write order is kept and an offline phone makes one call.
 *  `only` (optional) skips rows it rejects: they stay queued, are not sent and not counted.
 *  Returns how many rows were sent.
 *  ponytail: one poison row blocks the queue; callers can read `tries` and drop it. */
export async function drain(sendFn: (row: OutboxRow) => Promise<unknown>, only?: (row: OutboxRow) => boolean): Promise<number> {
  let sent = 0
  for (const row of await db.outbox.orderBy('id').toArray()) {
    if (only && !only(row)) continue // rows the caller will not send stay queued, untouched
    try {
      await sendFn(row)
    } catch {
      await db.outbox.update(row.id!, { tries: row.tries + 1 })
      break
    }
    await db.outbox.delete(row.id!)
    sent++
  }
  return sent
}
