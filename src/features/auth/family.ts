import { supabase } from './client'
import { getMember } from './session'

/** One face on the trusted-device picker. Names only: no emails, no auth ids. */
export interface FamilyMember { personId: string; displayName: string; handle: string | null; provider: 'pin' | 'google'; initials: string }

const KEY = 'bantay.family'
const flagKey = (personId: string) => `bantay.passkey.${personId}` // '1' = this phone has a passkey for that person. No secrets.

export const initialsOf = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean)
  return ((w[0]?.[0] ?? '?') + (w.length > 1 ? w[w.length - 1]![0]! : '')).toUpperCase()
}

export function loadFamily(): FamilyMember[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(v)) return []
    // Rebuild every entry from known fields only; the cache is plain localStorage and cannot be trusted.
    return v.flatMap((m): FamilyMember[] =>
      m && typeof m.personId === 'string' && typeof m.displayName === 'string' && m.displayName.trim()
        ? [{ personId: m.personId, displayName: m.displayName.slice(0, 60), handle: typeof m.handle === 'string' ? m.handle.slice(0, 20) : null,
             provider: m.provider === 'pin' ? 'pin' : 'google', initials: initialsOf(m.displayName) }]
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
    const list: FamilyMember[] = data.map((r: { person_id: string; display_name: string; handle: string | null; provider: string }) => ({
      personId: r.person_id, displayName: r.display_name, handle: r.handle ?? null,
      provider: r.provider === 'pin' ? 'pin' : 'google', initials: initialsOf(r.display_name)
    }))
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch { /* offline or private mode */ }
}

export const hasPasskeyFlag = (personId: string) => { try { return localStorage.getItem(flagKey(personId)) === '1' } catch { return false } }
export const setPasskeyFlag = (personId: string) => { try { localStorage.setItem(flagKey(personId), '1') } catch { /* private mode */ } }

/** "Forget this phone": the picker list and every passkey flag. */
export function forgetPhone(): void {
  generation++
  try {
    const drop: string[] = [KEY]
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('bantay.passkey.')) drop.push(k) }
    drop.forEach((k) => localStorage.removeItem(k))
  } catch { /* private mode */ }
}

export const passkeySupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials

const UNAVAILABLE = 'Not available on this phone yet'

/** Set while a passkey sign-in is verifying who signed in. AuthGate waits on it so nothing runs as the wrong person. */
export let passkeyCheck: Promise<void> | null = null

/** Fingerprint or face sign-in. Returns an error string or null (AuthGate takes over on success).
 *  The browser picks the passkey, so after the ceremony we check it belongs to the tapped person. On a mismatch or any
 *  error the session is dropped with scope 'local' on purpose: this phone signs out, the person's other devices stay signed in. */
export async function signInWithPasskey(expectedPersonId: string): Promise<string | null> {
  if (!supabase || !passkeySupported()) return UNAVAILABLE
  const sb = supabase
  // Register the pending check BEFORE the ceremony: SIGNED_IN can land during or right after it, and AuthGate must find this.
  let release!: () => void
  const mine = passkeyCheck = new Promise<void>((r) => { release = r })
  const fail = 'Fingerprint or face did not work. Use your PIN instead.'
  try {
    const { error } = await sb.auth.signInWithPasskey()
    if (error) return fail
    try {
      const m = await getMember()
      if (m?.personId !== expectedPersonId) { await sb.auth.signOut({ scope: 'local' }); return 'That fingerprint belongs to someone else. Tap your own name.' }
      return null
    } catch {
      await sb.auth.signOut({ scope: 'local' }).catch(() => {})
      return fail
    }
  } catch { return fail } finally {
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
