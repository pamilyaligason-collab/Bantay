import { db, enqueue, type ProfileFields, type ProfileRow } from '../../db'
import { supabase } from '../auth/client'
import { getMember } from '../auth/session'
import { JOIN, UNKNOWN, splitItems } from '../setup/lists'
import type { About } from '../setup/steps'

// Profile columns of public.people (migration 0010), kept in Dexie `profiles` and edited through the outbox.
// kv keys stay as the offline cache the wizard and probe read: profile.about, profile.medicines, profile.photo, profile.photoPath.

export const PROFILE_COLS = 'photo_path,phone,birthdate,blood_type,allergies,conditions,medicines,updated_at'
const MIGRATED = 'profile.migrated'
const PHOTO_UP = 'profile.photoUp' // a picked photo that has not reached the server yet
const PHOTO_AT = 'profile.photoAt' // when the cached kv photo was last known current
export const SELF_ID = 'profile.selfId'
export const SELF_USER = 'profile.selfUser' // the auth user the cached SELF_ID was seen with; the cache is honoured only for that user
const MIGRATING = 'profile.migrating' // the migration PATCH is queued and not yet confirmed
const MIGRATE_TRIES = 'profile.migrateTries'
const COLS_SEEN = 'profile.serverCols' // the server has answered with the profile columns at least once (migration 0010 applied)
const BUCKET = 'avatars'

// These kv keys are per phone, not per person. The phone's cache belongs to SELF_ID; when a different person
// signs in, the old person's cache (photo, pending upload, wizard answers, migration flag) is dropped so it can
// never be shown to, or uploaded for, someone else. Their unsent edits stay in the outbox (those carry their own id).
const PHONE_KEYS = ['profile.photo', PHOTO_UP, PHOTO_AT, MIGRATED, MIGRATING, MIGRATE_TRIES, 'profile.about', 'profile.medicines', 'profile.photoPath']
export async function adoptPerson(personId: string): Promise<void> {
  const owner = (await db.kv.get(SELF_ID))?.value as string | undefined
  if (owner === personId) return
  if (owner) await db.kv.bulkDelete(PHONE_KEYS)
  await db.kv.put({ key: SELF_ID, value: personId })
}

/** Sign-out: this phone forgets whose it was, so the next person (or nobody) never inherits it. */
export async function forgetSelf(): Promise<void> {
  await db.kv.bulkDelete([SELF_ID, SELF_USER, ...PHONE_KEYS]).catch(() => undefined)
}

export const blankProfile = (id: string): ProfileRow => ({
  id, photoPath: null, phone: null, birthdate: null, bloodType: null, allergies: [], conditions: [], medicines: [], updatedAt: null
})

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Server people row -> local profile. Null stays null; a missing array is empty. */
export const fromServer = (r: Record<string, unknown>): ProfileRow => ({
  id: String(r.id), photoPath: text(r.photo_path), phone: text(r.phone), birthdate: text(r.birthdate), bloodType: text(r.blood_type),
  allergies: list(r.allergies), conditions: list(r.conditions), medicines: list(r.medicines), updatedAt: text(r.updated_at)
})

const t = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0)

/** Server wins, unless this phone has edits the server has not confirmed and they are newer: those fields stay ours. */
export function mergeProfile(local: ProfileRow | undefined, server: ProfileRow): ProfileRow {
  if (!local?.pending?.length || t(local.updatedAt) <= t(server.updatedAt)) return server
  const mine = Object.fromEntries(local.pending.map((k) => [k, local[k]]))
  return { ...server, ...mine, updatedAt: local.updatedAt, pending: local.pending }
}

// ---- kv cache <-> profile

/** The wizard's about shape: one joined string per field, UNKNOWN for "not sure", a field left out when unanswered. */
export function aboutOf(p: ProfileFields): About {
  const a: About = {}
  if (p.bloodType) a.bloodType = p.bloodType
  if (p.allergies.length) a.allergies = p.allergies[0] === UNKNOWN ? UNKNOWN : p.allergies.join(JOIN)
  if (p.conditions.length) a.conditions = p.conditions[0] === UNKNOWN ? UNKNOWN : p.conditions.join(JOIN)
  return a
}
const arr = (s: string | undefined) => (s === UNKNOWN ? [UNKNOWN] : splitItems(s))
export const aboutFields = (a: About): Pick<ProfileFields, 'bloodType' | 'allergies' | 'conditions'> =>
  ({ bloodType: a.bloodType || null, allergies: arr(a.allergies), conditions: arr(a.conditions) })

/** `all` writes empty values too (a local edit); otherwise only what the server actually has, so a phone's cache is never blanked by an empty row. */
async function cacheToKv(p: ProfileRow, all: boolean) {
  const about = aboutOf(p)
  if (all || Object.keys(about).length) await db.kv.put({ key: 'profile.about', value: about })
  if (all || p.medicines.length) await db.kv.put({ key: 'profile.medicines', value: p.medicines })
  if (p.photoPath) await db.kv.put({ key: 'profile.photoPath', value: p.photoPath })
}

/** Edit own profile: local row first (so the screen updates now), then one outbox PATCH. Works offline. */
export async function saveProfile(personId: string, patch: Partial<ProfileFields>): Promise<ProfileRow> {
  await adoptPerson(personId)
  const now = new Date().toISOString()
  const cur = (await db.profiles.get(personId)) ?? blankProfile(personId)
  const keys = Object.keys(patch) as (keyof ProfileFields)[]
  const next: ProfileRow = { ...cur, ...patch, updatedAt: now, pending: [...new Set([...(cur.pending ?? []), ...keys])] }
  await db.profiles.put(next)
  await enqueue('people_profile', 'update', { id: personId, ...patch, updatedAt: now })
  await cacheToKv(next, true)
  if ((await db.kv.get('profile.photo'))?.value) await db.kv.put({ key: PHOTO_AT, value: now }) // our cached photo is current as of this edit
  return next
}

export const saveAbout = (personId: string, a: About) => saveProfile(personId, aboutFields(a))

// ---- pull

/** Apply pulled people rows (those carrying profile columns). `selfId` also refreshes this phone's kv cache. */
export async function applyPulledProfiles(rows: Record<string, unknown>[], selfId: string | null): Promise<void> {
  if (selfId) await adoptPerson(selfId)
  for (const r of rows) {
    if (!('updated_at' in r) && !('photo_path' in r)) continue // old select (migration 0010 not applied): nothing to store
    await db.kv.put({ key: COLS_SEEN, value: true })
    const server = fromServer(r)
    const merged = mergeProfile(await db.profiles.get(server.id), server)
    await db.profiles.put(merged)
    if (server.id !== selfId) continue
    await cacheToKv(merged, false)
    const at = (await db.kv.get(PHOTO_AT))?.value as string | undefined
    // another phone changed the photo after ours was cached: drop the cache so the server photo shows
    if (merged === server && server.photoPath && t(server.updatedAt) > t(at ?? null) && !(await db.kv.get(PHOTO_UP))?.value) await db.kv.delete('profile.photo')
  }
}

// ---- photo

function toBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const bin = atob(b64 ?? '')
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'image/jpeg' })
}

const signed = new Map<string, { url: string; exp: number }>()

/** A short-lived link to a person's photo, cached for 50 minutes. null when signed out, offline or no such file. */
export async function signedAvatar(path: string | null | undefined): Promise<string | null> {
  if (!path || !supabase) return null
  const hit = signed.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (!data?.signedUrl) return null
    signed.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 })
    return data.signedUrl
  } catch { return null }
}

/** Keep a picked photo on this phone, then try to upload it as avatars/<person>.jpg and record the path. Never throws. */
export async function savePhoto(personId: string | null, dataUrl: string): Promise<void> {
  if (personId) await adoptPerson(personId)
  const at = new Date().toISOString()
  await db.kv.put({ key: 'profile.photo', value: dataUrl })
  await db.kv.put({ key: PHOTO_AT, value: at })
  await db.kv.put({ key: PHOTO_UP, value: true })
  if (personId) await flushPhoto(personId)
}

/** Upload the cached photo if one is waiting. Returns true when nothing is left to upload. */
export async function flushPhoto(personId: string): Promise<boolean> {
  if (!(await db.kv.get(PHOTO_UP))?.value) return true
  const dataUrl = (await db.kv.get('profile.photo'))?.value
  if (typeof dataUrl !== 'string' || !supabase) return false
  try {
    const path = `${personId}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, toBlob(dataUrl), { upsert: true, contentType: 'image/jpeg' })
    if (error) return false
    signed.delete(path)
    await db.kv.delete(PHOTO_UP)
    await saveProfile(personId, { photoPath: path })
    return true
  } catch { return false }
}

// ---- run from sync

const outboxHas = async () => (await db.outbox.toArray()).some((r) => r.table === 'people_profile')
const deadCount = async () => (((await db.kv.get('sync.dead'))?.value as { table: string }[] | undefined) ?? []).filter((d) => d.table === 'people_profile').length

/** Copy what the wizard stored in kv up to the server, only into fields the server has empty (server wins).
 *  The one-time flag is set only once the server write is confirmed: never while the profile columns are missing
 *  (migration 0010 not applied), and not if the PATCH dead-lettered (retried on later syncs, at most 3 times). */
export async function migrateKv(personId: string): Promise<void> {
  await adoptPerson(personId)
  if ((await db.kv.get(MIGRATED))?.value) return
  if (!(await db.kv.get(COLS_SEEN))?.value) return
  const sentAt = (await db.kv.get(MIGRATING))?.value
  if (typeof sentAt === 'number') { // value = how many profile writes were dead-lettered before ours was queued
    if (await outboxHas()) return // still on its way
    if ((await deadCount()) > sentAt) { // the write failed: allow a few more tries
      const n = (((await db.kv.get(MIGRATE_TRIES))?.value as number | undefined) ?? 0) + 1
      await db.kv.put({ key: MIGRATE_TRIES, value: n })
      await db.kv.delete(MIGRATING)
      if (n >= 3) await db.kv.put({ key: MIGRATED, value: true }) // give up; the answers stay in the local cache
      return
    }
    await db.kv.delete(MIGRATING)
    await db.kv.put({ key: MIGRATED, value: true })
    return
  }
  const cur = (await db.profiles.get(personId)) ?? blankProfile(personId)
  const about = ((await db.kv.get('profile.about'))?.value ?? {}) as About
  const meds = (await db.kv.get('profile.medicines'))?.value
  const have = aboutFields(about)
  const patch: Partial<ProfileFields> = {}
  if (!cur.bloodType && have.bloodType) patch.bloodType = have.bloodType
  if (!cur.allergies.length && have.allergies.length) patch.allergies = have.allergies
  if (!cur.conditions.length && have.conditions.length) patch.conditions = have.conditions
  if (!cur.medicines.length && Array.isArray(meds) && meds.length) patch.medicines = list(meds)
  // a failed earlier try left its fields marked pending on the local row: send those again
  for (const k of cur.pending ?? []) if (k !== 'photoPath' && !(k in patch)) (patch as Record<string, unknown>)[k] = cur[k]
  if (!cur.photoPath && (await db.kv.get('profile.photo'))?.value) await db.kv.put({ key: PHOTO_UP, value: true })
  if (Object.keys(patch).length) {
    const before = await deadCount()
    await saveProfile(personId, patch)
    await db.kv.put({ key: MIGRATING, value: before })
  } else await db.kv.put({ key: MIGRATED, value: true }) // nothing to write
}

/** After a pull: own profile housekeeping. Profile data is optional, so nothing here may put the health sync into backoff. */
export async function syncOwnProfile(): Promise<void> {
  try {
    const m = await getMember()
    const id = m?.personId ?? ((await db.kv.get(SELF_ID))?.value as string | undefined)
    if (!id) return
    await adoptPerson(id)
    await migrateKv(id)
    await flushPhoto(id)
  } catch { /* try again next sync */ }
}

/** The signed-in person's id; offline (member known, person not fetched) the id cached for this same user. Signed out: null. */
export async function selfIdOrCached(): Promise<string | null> {
  const m = await getMember().catch(() => null)
  if (!m) return null
  if (m.personId) { await db.kv.put({ key: SELF_USER, value: m.userId }).catch(() => undefined); return m.personId }
  const user = (await db.kv.get(SELF_USER).catch(() => undefined))?.value
  if (user !== m.userId) return null
  return ((await db.kv.get(SELF_ID).catch(() => undefined))?.value as string | undefined) ?? null
}

export const selfIdNow = async (): Promise<string | null> => {
  try { return (await getMember())?.personId ?? null } catch { return null }
}
