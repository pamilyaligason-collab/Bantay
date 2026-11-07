import { Capacitor } from '@capacitor/core'
import { BackgroundRunner } from '@capacitor/background-runner' // static: this module is itself a lazy chunk, and the web build of the plugin is a thin proxy
import { db } from '../../db'
import { supabase, supabasePublishableKey, supabaseUrl } from '../auth/client'
import { familyPlacesOn } from './flags'
import { PLACE_KEY, PLACE_NOTICE_KEY, placeNoticeKey, placeSharingOn } from './placeApi'

/** Daily check-in while the app is closed (D-138, D-149, D-150, D-151): arms or disarms the background runner (public/runners/bgplace.js, APK 2.8.0+).
 *  The daily run sends only the battery and that the phone checked in, never a place: the runner holds no position and needs no location permission (D-151).
 *  It holds this phone's own place key (migration 0053), never the app's sign-in token, and only while this person has answered the notice, sharing is on, and the Family map is on (ML-46).
 *  Never throws; an older shell without the plugin is a no-op. */
export const BG_PLACE_LABEL = 'ph.bantay.family.place' // must equal capacitor.config.ts plugins.BackgroundRunner.label
const CONFIGURE = 'configure'
const SEND_MS = 8_000
const NET_MS = 6_000
const ROTATE_MS = 24 * 3600 * 1000 // a key older than this is re-issued at the next open (also keeps it inside the server's 30 idle days)

/** `place.bgkey:<personId>` = { k: the raw key, at: issued ms }. Under `place.` on purpose: signOut's wipe of every `place.` key covers it too (ML-46). */
export const BGKEY_KEY = 'place.bgkey'
export const bgKeyKey = (personId: string): string => `${BGKEY_KEY}:${personId}`
/** A random id for this phone, not secret, not a hardware id: one active key per person per phone. Survives sign-out (it names the phone, not a person). */
const DEVICE_KEY = 'bgplace.device'
/** Keys that were dropped from this phone but whose revoke did not reach the server yet (offline): retried at the next start. Dead keys only. */
const PENDING_KEY = 'bgplace.revoke'

export type BgPlaceConfig = { on: false } | { on: true; url: string; key: string; pkey: string }

const nativeAndroid = (): boolean => { try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('BackgroundRunner') } catch { return false } }
const timeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T> => Promise.race([Promise.resolve(p), new Promise<T>((_, no) => setTimeout(() => no(new Error('timeout')), ms))])
const newId = (): string => { try { return globalThis.crypto.randomUUID() } catch { return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}` } }

async function deviceId(): Promise<string> {
  const v = (await db.kv.get(DEVICE_KEY).catch(() => undefined))?.value
  if (typeof v === 'string' && v.length >= 8) return v
  const id = newId()
  await db.kv.put({ key: DEVICE_KEY, value: id }).catch(() => undefined)
  return id
}

type Held = { k: string; at: number }
const heldOf = async (personId: string): Promise<Held | null> => {
  const v = (await db.kv.get(bgKeyKey(personId)).catch(() => undefined))?.value as Partial<Held> | undefined
  return v && typeof v.k === 'string' && v.k && typeof v.at === 'number' ? { k: v.k, at: v.at } : null
}

/** This person's key for this phone: the one held if it is younger than a day, else a fresh one (issuing rotates, the server revokes the old). null when none can be had.
 *  A refusal from the server (sharing off for them) drops the held key; a network failure keeps it. */
async function ensureKey(personId: string): Promise<string | null> {
  if (!supabase) return null
  const held = await heldOf(personId)
  if (held && held.at <= Date.now() + 60_000 && Date.now() - held.at < ROTATE_MS) return held.k
  try {
    const { data, error } = await timeout(supabase.rpc('device_place_key_issue', { p_device: await deviceId(), p_label: 'android' }), NET_MS)
    if (!error && typeof data === 'string' && data.length >= 20) { await db.kv.put({ key: bgKeyKey(personId), value: { k: data, at: Date.now() } }); return data }
    if (error?.code === '42501') { await db.kv.delete(bgKeyKey(personId)).catch(() => undefined); return null }
  } catch { /* offline or slow: keep the one held */ }
  return held?.k ?? null
}

/** What the runner should hold right now for this person. Off unless every gate is open and a key can be had. */
export async function bgPlaceConfig(personId: string | null | undefined): Promise<BgPlaceConfig> {
  const off = { on: false } as const
  if (!personId || !supabase || !supabaseUrl || !supabasePublishableKey || !familyPlacesOn()) return off
  const noticeSeen = (await db.kv.get(placeNoticeKey(personId)).catch(() => undefined))?.value === true
  if (!noticeSeen || !(await placeSharingOn(personId))) return off
  const pkey = await ensureKey(personId)
  if (!pkey) return off
  return { on: true, url: supabaseUrl, key: supabasePublishableKey, pkey }
}

/** Revoke one key on the server by itself (no session needed). A failure is queued and retried at the next start. Never throws. */
async function revokeKey(k: string): Promise<void> {
  try {
    const { error } = await timeout(supabase!.rpc('device_place_key_revoke', { p_key: k }), NET_MS)
    if (!error) return
  } catch { /* queue below */ }
  try {
    const q = (((await db.kv.get(PENDING_KEY))?.value as string[] | undefined) ?? []).filter((x) => x !== k)
    await db.kv.put({ key: PENDING_KEY, value: [...q, k].slice(-5) })
  } catch { /* storage refused: the server's 30-day idle expiry still ends it */ }
}

/** Put every key this phone holds except `keep`'s (null keeps none) into the revoke queue, and take it out of the `place.` store when `move` is true: local reads and writes only, no network, so it finishes in a moment.
 *  Done BEFORE sign-out wipes every `place.` key, so a slow runner dispatch or a slow network can never leave a live key that nothing knows about (the queue key is outside `place.`). */
async function stashHeld(keep: string | null, move = true): Promise<void> {
  try {
    const keys = (await db.kv.toCollection().primaryKeys()).filter((k) => String(k).startsWith(`${BGKEY_KEY}:`) && (keep === null || k !== bgKeyKey(keep)))
    const dead: string[] = []
    for (const key of keys) {
      const v = (await db.kv.get(key).catch(() => undefined))?.value as Partial<Held> | undefined
      if (move) await db.kv.delete(key).catch(() => undefined)
      if (v && typeof v.k === 'string' && v.k) dead.push(v.k)
    }
    if (dead.length) {
      const q = ((await db.kv.get(PENDING_KEY).catch(() => undefined))?.value as string[] | undefined) ?? []
      await db.kv.put({ key: PENDING_KEY, value: [...q.filter((x) => !dead.includes(x)), ...dead].slice(-5) })
    }
  } catch { /* nothing held, or storage refused: the server's 30-day idle expiry still ends it */ }
}

/** Sign-out calls this first and waits for it (local only), then wipes the `place.` keys: every key held is already in the revoke queue by then. It only copies: the held key stays where it is until the clear that follows
 *  moves and revokes it, so a sync that is already waiting in the queue still finds its key and issues no new one. */
export const bgPlaceStash = (): Promise<void> => stashHeld(null, false)

/** Drop and revoke every key this phone holds except `keep`'s (null keeps none): a person who is off, signed out, or replaced by someone else on the same phone. */
async function revokeHeld(keep: string | null): Promise<void> {
  await stashHeld(keep)
  await retryPending()
}

async function retryPending(): Promise<void> {
  if (!supabase) return
  try {
    const q = ((await db.kv.get(PENDING_KEY))?.value as string[] | undefined) ?? []
    if (!q.length) return
    await db.kv.delete(PENDING_KEY)
    for (const k of q) await revokeKey(k)
  } catch { /* try again next start */ }
}

let chain: Promise<unknown> = Promise.resolve()
let watching = false

async function send(cfg: BgPlaceConfig): Promise<'on' | 'off' | 'unavailable'> {
  if (!nativeAndroid()) return 'unavailable'
  try {
    await timeout(BackgroundRunner.dispatchEvent({ label: BG_PLACE_LABEL, event: CONFIGURE, details: cfg }), SEND_MS)
    return cfg.on ? 'on' : 'off'
  } catch { return 'unavailable' }
}

/** Arm (all gates open) or disarm the runner for this person; `personId` null disarms. Disarming also revokes the key. Calls are serialised so the last one wins.
 */
export function bgPlaceSync(personId: string | null | undefined): Promise<'on' | 'off' | 'unavailable'> {
  if (!nativeAndroid()) return Promise.resolve('unavailable')
  watch()
  const run = chain.then(async () => {
    const cfg = await bgPlaceConfig(personId)
    await stashHeld(cfg.on ? personId! : null) // local only, before the runner is told, so the dead key is queued whatever happens next
    const sent = await send(cfg)
    await retryPending() // the network revoke comes after the runner is told: a slow network never leaves it armed
    return sent
  }, () => 'unavailable' as const)
  chain = run.catch(() => undefined)
  return run as Promise<'on' | 'off' | 'unavailable'>
}

/** Disarm and revoke at once (sign-out, switch off). On web it only revokes nothing: no key is ever issued there. */
export function bgPlaceClear(): Promise<'on' | 'off' | 'unavailable'> {
  if (!nativeAndroid()) return revokeHeld(null).then(() => 'unavailable' as const)
  return bgPlaceSync(null)
}

/** Register the watchers at app start (main.tsx), not only after a place write: the Labs Family map switch reloads the app, so the first sync here sees it. Safe to call twice. */
export function bgPlaceStart(): void {
  if (!nativeAndroid()) return
  watch()
  void retryPending()
  void resync()
}

async function resync(): Promise<void> {
  const me = await import('../sync/profile').then((m) => m.selfIdOrCached()).catch(() => null)
  await bgPlaceSync(me)
}

/** Keep the runner in step without touching the code that changes the state: a change to any `place.` switch or notice key (the person's switch, the notice answer, the sign-out wipe),
 *  every sign-in and token refresh, sign-out, the Family map flag changing in another tab, and the app coming back to the front re-evaluate the gates (a different person on the same phone arms nothing until they answer). */
function watch(): void {
  if (watching) return
  watching = true
  const again = (key: unknown) => { if (typeof key === 'string' && (key.startsWith(PLACE_KEY) || key.startsWith(PLACE_NOTICE_KEY))) setTimeout(() => void resync(), 0) }
  try {
    db.kv.hook('creating', (key) => { again(key) })
    db.kv.hook('updating', (_mods, key) => { again(key) })
    db.kv.hook('deleting', (key) => { again(key) })
  } catch { /* hooks unavailable: the next open still re-syncs */ }
  try {
    supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') void bgPlaceClear() // never call auth inside its own callback: this only touches the runner and the key RPC
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(() => void resync(), 0)
    })
  } catch { /* no auth client: nothing to follow */ }
  try {
    window.addEventListener('storage', (e) => { if (e.key === 'bantay.flag.places') void resync() })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void resync() })
  } catch { /* no window */ }
}
