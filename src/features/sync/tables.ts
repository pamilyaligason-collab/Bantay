// The one place that knows which outbox tables reach Supabase and how camelCase client fields become snake_case columns.
// Anything not listed here is never sent (it stays in the outbox and is counted in the sync status).

export interface TableSpec {
  /** camelCase payload fields that become columns (anything else is dropped, so a stray field cannot cause a 400). */
  fields: string[]
  /** PostgREST on_conflict target and how a duplicate is handled. */
  onConflict: string
  resolution: 'ignore-duplicates' | 'merge-duplicates'
  /** Pull this table down into the local Dexie store (own and linked rows). */
  pull?: boolean
  /** Server rows change after insert (edit, tombstone): pull by this column and upsert by client_id; deleted_at removes the row. Default: created_at, insert-only. */
  cursor?: 'updated_at'
  /** Do not send client_id (the row is keyed another way). */
  noClientId?: boolean
  /** Columns that are read on pull but never sent (the server stamps them). */
  pullOnly?: string[]
  /** The server row id is kept locally as `serverId` and sent as `id` when the row has one (other rows point at it by that id). */
  serverId?: boolean
  /** Send as PATCH of an existing row: REST table name, and the payload field that names the row (matched to column id). */
  patch?: { table: string; idField: string }
}

export const TABLES: Record<string, TableSpec> = {
  readings: {
    fields: ['personId', 'takenAt', 'test', 'value', 'unit', 'labLow', 'labHigh', 'sourceFileId', 'driveUrl', 'confidence', 'confirmedBy', 'confirmedAt'],
    onConflict: 'client_id', resolution: 'ignore-duplicates', pull: true, cursor: 'updated_at'
  },
  consults: {
    fields: ['personId', 'takenAt', 'doctor', 'reason', 'medicines', 'nextVisit', 'sourceFileId', 'driveUrl', 'confirmedBy', 'confirmedAt'],
    onConflict: 'client_id', resolution: 'ignore-duplicates', pull: true
  },
  meds_taken: { fields: ['personId', 'name', 'takenAt', 'medicationId', 'slot', 'skipped'], onConflict: 'client_id', resolution: 'ignore-duplicates', pull: true },
  activity: {
    fields: ['personId', 'kind', 'minutes', 'steps', 'startedAt', 'source'],
    onConflict: 'client_id', resolution: 'ignore-duplicates', pull: true
  },
  // Food, water and salt goals (0024). Entries are full-row upserts on client_id with a soft delete, like the plan rows. The goal is one row per person.
  food_entries: {
    fields: ['personId', 'eatenAt', 'meal', 'foodKey', 'name', 'portion', 'servingLabel', 'kcal', 'sodiumMg', 'potassiumMg', 'proteinG', 'deletedAt'],
    onConflict: 'client_id', resolution: 'merge-duplicates', pull: true, cursor: 'updated_at'
  },
  water_entries: { fields: ['personId', 'drunkAt', 'ml', 'deletedAt'], onConflict: 'client_id', resolution: 'merge-duplicates', pull: true, cursor: 'updated_at' },
  nutrition_goals: { fields: ['personId', 'sodiumMg', 'waterMl'], onConflict: 'person_id', resolution: 'merge-duplicates', noClientId: true },
  // A device's push subscription is keyed by its endpoint; resubscribing updates the keys.
  push_subscriptions: { fields: ['endpoint', 'p256dh', 'auth', 'expirationTime'], onConflict: 'endpoint', resolution: 'merge-duplicates', noClientId: true },
  usage_events: { fields: ['kind', 'name', 'appVersion', 'clientAt'], onConflict: 'client_id', resolution: 'ignore-duplicates' },
  // A member's own profile columns on people (0010). PATCH, so the row must already exist; RLS decides who may.
  people_profile: {
    fields: ['photoPath', 'phone', 'birthdate', 'bloodType', 'allergies', 'conditions'],
    onConflict: 'id', resolution: 'merge-duplicates', noClientId: true, patch: { table: 'people', idField: 'id' }
  },
  // Family plan (0012): edits and soft deletes (deletedAt) are full-row upserts on client_id; the pull removes tombstoned rows.
  family_tasks: { fields: ['title', 'due', 'assigneePersonId', 'done', 'deletedAt'], onConflict: 'client_id', resolution: 'merge-duplicates', pull: true, cursor: 'updated_at' },
  family_events: { fields: ['title', 'startsAt', 'endsAt', 'allDay', 'personId', 'deletedAt'], onConflict: 'client_id', resolution: 'merge-duplicates', pull: true, cursor: 'updated_at' },
  family_notes: { fields: ['body', 'pinned', 'deletedAt'], onConflict: 'client_id', resolution: 'merge-duplicates', pull: true, cursor: 'updated_at' },
  // The live medicine schedule (0014). Edits and soft deletes are full-row upserts on client_id, like the plan rows. origin and
  // edited_at are stamped by the server (converter / edit trigger), so they are read but never sent. App-made rows use status 'confirmed'.
  medications: {
    fields: ['personId', 'name', 'genericName', 'strength', 'form', 'dose', 'schedule', 'asNeeded', 'perDay', 'stockQty', 'stockUnit', 'stockSetAt', 'medStatus', 'startedOn', 'stoppedOn', 'status', 'deletedAt'],
    onConflict: 'client_id', resolution: 'merge-duplicates', pull: true, cursor: 'updated_at', pullOnly: ['origin', 'editedAt'], serverId: true
  },
  // Doctor visits (0008): read-only here, nothing on this phone writes them. Follow-ups come from prescriptions.follow_up_on.
  appointments: { fields: ['personId', 'startsAt', 'dueOn', 'provider', 'facility', 'purpose', 'apptStatus', 'sourcePrescriptionId', 'status'], onConflict: 'client_id', resolution: 'ignore-duplicates', pull: true, cursor: 'updated_at' },
  prescriptions: { fields: ['personId', 'rxDate', 'prescriber', 'followUpOn', 'status'], onConflict: 'client_id', resolution: 'ignore-duplicates', pull: true, cursor: 'updated_at', serverId: true },
  // An admin edit of a hotline or place replaces the earlier edit of the same one.
  safety_overrides: { fields: ['kind', 'key', 'data', 'removed'], onConflict: 'kind,key', resolution: 'merge-duplicates', noClientId: true }
}

export const isSyncable = (table: string) => Object.hasOwn(TABLES, table)
export const PULL_TABLES = Object.keys(TABLES).filter((t) => TABLES[t].pull)

export const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
export const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

type Obj = Record<string, unknown>

/** Outbox payload -> the JSON body for Supabase. Unknown stays null (never 0); undefined fields are left out. */
export function toRow(table: string, payload: unknown, clientId?: string): Obj {
  const spec = TABLES[table]
  const p = { ...(payload as Obj) }
  if (table === 'push_subscriptions') {
    // PushSubscription.toJSON(): { endpoint, expirationTime, keys: { p256dh, auth } }
    const keys = (p.keys ?? {}) as Obj
    p.p256dh = keys.p256dh
    p.auth = keys.auth
    if (typeof p.expirationTime === 'number') p.expirationTime = new Date(p.expirationTime).toISOString()
  }
  const out: Obj = {}
  for (const f of spec.fields) if (p[f] !== undefined) out[toSnake(f)] = p[f]
  if (!spec.noClientId && clientId) out.client_id = clientId
  if (spec.serverId && typeof p.serverId === 'string' && p.serverId) out.id = p.serverId
  return out
}

/** Server row -> local store row. Nulls are dropped except where "unknown" is a real value in the local type. */
const KEEP_NULL = new Set(['labLow', 'labHigh', 'minutes', 'steps', 'kcal', 'sodiumMg', 'potassiumMg', 'proteinG', 'foodKey', 'servingLabel'])
export function fromRow(table: string, row: Obj): Obj {
  const out: Obj = { clientId: row.client_id }
  const spec = TABLES[table]
  if (spec.serverId && typeof row.id === 'string') out.serverId = row.id
  for (const f of [...spec.fields, ...(spec.pullOnly ?? [])]) {
    const v = row[toSnake(f)]
    if (v === undefined || (v === null && !KEEP_NULL.has(f))) continue
    out[f] = v
  }
  return out
}

const ms = (iso: unknown) => Date.parse(String(iso))
/** Identity of a row apart from client_id, so a row pushed before it was stamped is not added twice on pull. */
export const naturalKey: Record<string, (r: Obj) => string> = {
  readings: (r) => `${r.personId}|${r.test}|${ms(r.takenAt)}`,
  consults: (r) => `${r.personId}|${ms(r.takenAt)}`,
  meds_taken: (r) => `${r.personId}|${r.name}|${ms(r.takenAt)}`,
  activity: (r) => `${r.personId}|${r.kind}|${ms(r.startedAt)}`,
  // plan rows are stamped with a client_id when they are created, so there is no unstamped twin to match
  family_tasks: (r) => `cid:${r.clientId}`,
  medications: (r) => `cid:${r.clientId}`,
  family_events: (r) => `cid:${r.clientId}`,
  family_notes: (r) => `cid:${r.clientId}`,
  food_entries: (r) => `cid:${r.clientId}`,
  water_entries: (r) => `cid:${r.clientId}`,
  appointments: (r) => `cid:${r.clientId}`,
  prescriptions: (r) => `cid:${r.clientId}`
}
