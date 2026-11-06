import Dexie, { type Table } from 'dexie'

export interface OutboxRow {
  id?: number
  table: string
  op: string
  payload: unknown
  createdAt: number
  tries: number
  /** Short code of the last failed send (HTTP status code, PostgREST code or 'net'), never a message; additive, old rows lack it. */
  lastCode?: string
  lastAt?: number
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

/** A region pack on the phone (APP-INTEGRATION section 3.1). `hazards` is the unit's NOAH file, kept only after a Wi-Fi or tapped download. */
export interface PackRow {
  code: string
  version: number
  checksum: string
  name: string
  neighbours: string[]
  places: unknown[]
  fetchedAt: number
  usedAt: number
  pinned: boolean
  /** The unit whose row holds the NOAH file for this unit (General Santos reads South Cotabato's). */
  hazardsFrom?: string
  hazards?: { checksum: string; bounds?: Record<string, number[]>; blob: Blob }
  /** The unit's PMTiles street map (D-131), stored whole so it draws offline. `bounds` = west, south, east, north. */
  basemap?: { checksum: string; bounds: [number, number, number, number]; blob: Blob; savedAt: string }
}

/** One family feed post as `family_feed` returned it (migration 0050). The table is replaced whole on each pull; the phone never writes it. */
export interface FeedRow {
  /** kind + '|' + rowId */
  id: string
  kind: 'bp' | 'lab' | 'photo' | 'status'
  personId: string
  at: string
  titleKey: string
  valueText: string | null
  chip: string | null
  photoPath: string | null
  rowId: string
}

class BantayDB extends Dexie {
  outbox!: Table<OutboxRow, number>
  kv!: Table<KvRow, string>
  profiles!: Table<ProfileRow, string>
  packs!: Table<PackRow, string>
  feed!: Table<FeedRow, string>
  constructor() {
    super('bantay')
    // payload is stored but not indexed (objects are not valid index keys).
    this.version(1).stores({ outbox: '++id, table, op, createdAt, tries', kv: 'key' })
    // v2 only adds a table: existing outbox and kv rows are untouched.
    this.version(2).stores({ outbox: '++id, table, op, createdAt, tries', kv: 'key', profiles: 'id' })
    // v3 only adds the region-pack table.
    this.version(3).stores({ outbox: '++id, table, op, createdAt, tries', kv: 'key', profiles: 'id', packs: 'code' })
    // v4 adds the family feed (D-134): replaced whole on each pull, not an outbox table.
    this.version(4).stores({ outbox: '++id, table, op, createdAt, tries', kv: 'key', profiles: 'id', packs: 'code', feed: 'id, at, personId' })
  }
}

export const db = new BantayDB()

/** Other people's shared values live here: sign-out and Forget this phone empty it so the next person on the phone cannot read them. */
export const clearFeed = () => db.feed.clear()

export const enqueue = (table: string, op: string, payload: unknown) =>
  db.outbox.add({ table, op, payload, createdAt: Date.now(), tries: 0 })

/** Send queued rows oldest first. A row is deleted only after sendFn resolves.
 *  On reject: tries += 1 and draining stops, so write order is kept and an offline phone makes one call.
 *  `only` (optional) skips rows it rejects: they stay queued, are not sent and not counted.
 *  `first` rows go ahead of the rest, id order kept inside each group. `max` caps this drain; the rest wait for the next one.
 *  Returns how many rows were sent.
 *  ponytail: one poison row blocks the queue; callers can read `tries` and drop it. */
export async function drain(sendFn: (row: OutboxRow) => Promise<unknown>, only?: (row: OutboxRow) => boolean, { first, max = Infinity }: { first?: (row: OutboxRow) => boolean; max?: number } = {}): Promise<number> {
  let sent = 0
  const rows = (await db.outbox.orderBy('id').toArray()).filter((r) => !only || only(r)) // rows the caller will not send stay queued, untouched
  const queue = first ? [...rows.filter(first), ...rows.filter((r) => !first(r))] : rows
  for (const row of queue.slice(0, max)) {
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
