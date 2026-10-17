import { supabase } from './client'

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
    return Array.isArray(v) ? v.filter((m) => m && typeof m.personId === 'string' && typeof m.displayName === 'string') : []
  } catch { return [] }
}

/** After any sign-in: remember the family on this phone (trusted device). Fails quietly; the picker just stays off. */
export async function cacheFamily(): Promise<void> {
  if (!supabase) return
  try {
    const { data, error } = await supabase.rpc('family_profiles')
    if (error || !Array.isArray(data) || !data.length) return
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
  try {
    const drop: string[] = [KEY]
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('bantay.passkey.')) drop.push(k) }
    drop.forEach((k) => localStorage.removeItem(k))
  } catch { /* private mode */ }
}

export const passkeySupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials

const UNAVAILABLE = 'Not available on this phone yet'

/** Fingerprint or face sign-in. Returns an error string or null (AuthGate takes over on success). */
export async function signInWithPasskey(): Promise<string | null> {
  if (!supabase || !passkeySupported()) return UNAVAILABLE
  try {
    const { error } = await supabase.auth.signInWithPasskey()
    return error ? 'Fingerprint or face did not work. Use your PIN instead.' : null
  } catch { return 'Fingerprint or face did not work. Use your PIN instead.' }
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
