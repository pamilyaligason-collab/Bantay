import { Capacitor } from '@capacitor/core'
import { supabase } from './client'
import { getMember } from './session'

/** One face on the trusted-device picker. Names only: no emails, no auth ids. */
export interface FamilyMember { personId: string; displayName: string; handle: string | null; provider: 'pin' | 'google'; initials: string
  /** Small cached picture (data URL) for the sign-in list, present only when family_profiles() returned photo_path. */
  photo?: string | null }

const KEY = 'bantay.family'
const THUMBS = 'bantay.avatars' // { [personId]: { path, url } } 96px pictures: the sign-in list is shown before anyone is signed in, so it cannot use signed links
const flagKey = (personId: string) => `bantay.passkey.${personId}` // '1' = this phone has a passkey for that person. No secrets.

export const initialsOf = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean)
  return ((w[0]?.[0] ?? '?') + (w.length > 1 ? w[w.length - 1]![0]! : '')).toUpperCase()
}

type Thumbs = Record<string, { path: string; url: string }>
function readThumbs(): Thumbs {
  try {
    const t = JSON.parse(localStorage.getItem(THUMBS) ?? '{}')
    return t && typeof t === 'object' && !Array.isArray(t) ? Object.fromEntries(Object.entries(t as Thumbs).filter(([, v]) => typeof v?.url === 'string' && v.url.startsWith('data:image/'))) : {}
  } catch { return {} }
}

/** Download one avatar and shrink it to a 96px jpeg data URL. null on any failure. */
async function thumbOf(path: string): Promise<string | null> {
  try {
    const { data } = await supabase!.storage.from('avatars').download(path)
    if (!data) return null
    const img = await createImageBitmap(data)
    const side = Math.min(img.width, img.height)
    const c = document.createElement('canvas')
    c.width = c.height = 96
    c.getContext('2d')?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 96, 96)
    return c.toDataURL('image/jpeg', 0.7)
  } catch { return null }
}

export function loadFamily(): FamilyMember[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(v)) return []
    // Rebuild every entry from known fields only; the cache is plain localStorage and cannot be trusted.
    const thumbs = readThumbs()
    return v.flatMap((m): FamilyMember[] =>
      m && typeof m.personId === 'string' && typeof m.displayName === 'string' && m.displayName.trim()
        ? [{ personId: m.personId, displayName: m.displayName.slice(0, 60), handle: typeof m.handle === 'string' ? m.handle.slice(0, 20) : null,
             provider: m.provider === 'pin' ? 'pin' : 'google', initials: initialsOf(m.displayName), ...(thumbs[m.personId] ? { photo: thumbs[m.personId]!.url } : {}) }]
        : [])
  } catch { return [] }
}

/** After any sign-in: remember the family on this phone (trusted device). Fails quietly; the picker just stays off. */
let generation = 0 // bumped by forgetPhone so a cacheFamily() already in flight cannot write the list back
export async function cacheFamily(): Promise<void> {
  if (!supabase) return
  const gen = generation
  try {
    const { data, error } = await supabase.rpc('family_profiles')
    if (gen !== generation || error || !Array.isArray(data) || !data.length) return
    const list: FamilyMember[] = data.map((r: { person_id: string; display_name: string; handle: string | null; provider: string; photo_path?: string | null }) => ({
      personId: r.person_id, displayName: r.display_name, handle: r.handle ?? null,
      provider: r.provider === 'pin' ? 'pin' : 'google', initials: initialsOf(r.display_name)
    }))
    localStorage.setItem(KEY, JSON.stringify(list))
    // Pictures, only when the server sent a photo_path (family_profiles() returns it once extended). A changed path is fetched again.
    const old = readThumbs(), next: Thumbs = {}
    for (const r of data as { person_id: string; photo_path?: string | null }[]) {
      if (typeof r.photo_path !== 'string' || !r.photo_path) continue
      if (old[r.person_id]?.path === r.photo_path) { next[r.person_id] = old[r.person_id]!; continue }
      const url = await thumbOf(r.photo_path)
      if (url) next[r.person_id] = { path: r.photo_path, url }
    }
    if (gen === generation) localStorage.setItem(THUMBS, JSON.stringify(next))
  } catch { /* offline or private mode */ }
}

export const hasPasskeyFlag = (personId: string) => { try { return localStorage.getItem(flagKey(personId)) === '1' } catch { return false } }
export const setPasskeyFlag = (personId: string) => { try { localStorage.setItem(flagKey(personId), '1') } catch { /* private mode */ } }
export const clearPasskeyFlag = (personId: string) => { try { localStorage.removeItem(flagKey(personId)) } catch { /* private mode */ } }

const LAST = 'bantay.lastPerson' // personId of the last person who signed in on this phone. Not a secret; names stay in bantay.family.
export const getLastPerson = (): string | null => { try { return localStorage.getItem(LAST) } catch { return null } }
export const clearLastPerson = () => { generation++; try { localStorage.removeItem(LAST) } catch { /* private mode */ } }
/** After a successful sign-in (PIN, passkey or Google all land here via AuthGate): remember who, if they are in the cached family. */
export async function rememberSignedIn(): Promise<void> {
  const gen = generation // clearLastPerson / forgetPhone bump it, so a write already in flight is dropped
  try {
    const m = await getMember()
    if (gen === generation && m?.personId && loadFamily().some((f) => f.personId === m.personId)) localStorage.setItem(LAST, m.personId)
  } catch { /* offline or private mode */ }
}

/** "Forget this phone": the picker list, the remembered person and every passkey flag. */
export function forgetPhone(): void {
  generation++
  try {
    const drop: string[] = [KEY, LAST, THUMBS]
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('bantay.passkey.')) drop.push(k) }
    drop.forEach((k) => localStorage.removeItem(k))
  } catch { /* private mode */ }
}

// Android WebView does not enable WebAuthn by default: the APK falls back to PIN.
export const passkeySupported = () => !Capacitor.isNativePlatform() && typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials

const UNAVAILABLE = 'Not available on this phone yet'

/** Set while a passkey sign-in is verifying who signed in. AuthGate waits on it so nothing runs as the wrong person. */
export let passkeyCheck: Promise<void> | null = null

let abortCeremony: AbortController | null = null
/** "Use PIN instead", Back, or asking again while a prompt is open: abort the ceremony. It rejects, the finally below clears
 *  passkeyCheck, and AuthGate never skips an identity check that is still unresolved.
 *  ponytail: if the verify POST is already in flight when we abort, AuthGate waits one round trip; on a mismatch the phone
 *  is signed out locally, which is safe and costs one PIN re-entry. */
export function abandonPasskeyWait(): void { abortCeremony?.abort() }

/** Fingerprint or face sign-in. Returns an error string or null (AuthGate takes over on success).
 *  The browser picks the passkey, so after the ceremony we check it belongs to the tapped person. On a mismatch or any
 *  error the session is dropped with scope 'local' on purpose: this phone signs out, the person's other devices stay signed in. */
export async function signInWithPasskey(expectedPersonId: string): Promise<string | null> {
  if (!supabase || !passkeySupported()) return UNAVAILABLE
  const sb = supabase
  // Register the pending check BEFORE the ceremony: SIGNED_IN can land during or right after it, and AuthGate must find this.
  let release!: () => void
  const mine = passkeyCheck = new Promise<void>((r) => { release = r })
  abortCeremony?.abort()
  const ac = abortCeremony = new AbortController()
  const fail = 'Fingerprint or face did not work. Use your PIN instead.'
  try {
    const { error } = await sb.auth.signInWithPasskey({ options: { signal: ac.signal } })
    if (error) {
      // A server-side rejection means this passkey no longer works here: stop fingerprint-first for this person.
      // A cancel or abort keeps the flag. A passkey deleted on the phone shows as NotAllowedError, so its flag stays until
      // Forget this phone (best effort).
      if (!ac.signal.aborted && !/^(NotAllowedError|AbortError)$/.test(error.name ?? '')) clearPasskeyFlag(expectedPersonId)
      return fail
    }
    try {
      const m = await getMember()
      if (m?.personId !== expectedPersonId) { await sb.auth.signOut({ scope: 'local' }); return 'That fingerprint belongs to someone else. Tap your own name.' }
      setPasskeyFlag(expectedPersonId) // a working fingerprint on this phone: keep it as the first way in
      return null
    } catch {
      await sb.auth.signOut({ scope: 'local' }).catch(() => {})
      return fail
    }
  } catch { return fail } finally {
    if (abortCeremony === ac) abortCeremony = null
    if (passkeyCheck === mine) passkeyCheck = null // every exit clears it; a newer attempt's check is left alone
    release()
  }
}

/** Register a passkey for the signed-in member on this phone, then remember that locally. */
export async function enablePasskey(personId: string): Promise<string | null> {
  if (!supabase || !passkeySupported()) return UNAVAILABLE
  try {
    const { error } = await supabase.auth.registerPasskey()
    if (error) return /cancel|abort|notallowed/i.test(`${error.name} ${error.message}`) ? 'Cancelled. Nothing was turned on.' : UNAVAILABLE
    setPasskeyFlag(personId)
    return null
  } catch { return UNAVAILABLE }
}
