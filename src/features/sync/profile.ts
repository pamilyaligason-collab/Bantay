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
const BUCKET = 'avatars'

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
  for (const r of rows) {
    if (!('updated_at' in r) && !('photo_path' in r)) continue // old select (migration 0010 not applied): nothing to store
    const server = fromServer(r)
    const merged = mergeProfile(await db.profiles.get(server.id), server)
    await db.profiles.put(merged)
    if (server.id !== selfId) continue
    await db.kv.put({ key: SELF_ID, value: selfId })
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

/** Once per phone: copy what the wizard stored in kv up to the server, but only into fields the server has empty (server wins). */
export async function migrateKv(personId: string): Promise<void> {
  if ((await db.kv.get(MIGRATED))?.value) return
  const cur = (await db.profiles.get(personId)) ?? blankProfile(personId)
  const about = ((await db.kv.get('profile.about'))?.value ?? {}) as About
  const meds = (await db.kv.get('profile.medicines'))?.value
  const have = aboutFields(about)
  const patch: Partial<ProfileFields> = {}
  if (!cur.bloodType && have.bloodType) patch.bloodType = have.bloodType
  if (!cur.allergies.length && have.allergies.length) patch.allergies = have.allergies
  if (!cur.conditions.length && have.conditions.length) patch.conditions = have.conditions
  if (!cur.medicines.length && Array.isArray(meds) && meds.length) patch.medicines = list(meds)
  if (Object.keys(patch).length) await saveProfile(personId, patch)
  if (!cur.photoPath && (await db.kv.get('profile.photo'))?.value) await db.kv.put({ key: PHOTO_UP, value: true })
  await db.kv.put({ key: MIGRATED, value: true })
}

/** After a pull: own profile housekeeping. Profile data is optional, so nothing here may put the health sync into backoff. */
export async function syncOwnProfile(): Promise<void> {
  try {
    const m = await getMember()
    const id = m?.personId ?? ((await db.kv.get(SELF_ID))?.value as string | undefined)
    if (!id) return
    await migrateKv(id)
    await flushPhoto(id)
  } catch { /* try again next sync */ }
}

export const selfIdNow = async (): Promise<string | null> => {
  try { return (await getMember())?.personId ?? null } catch { return null }
}
