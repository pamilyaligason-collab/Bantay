import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { supabase, supabaseUrl, supabasePublishableKey } from './client'
import { NATIVE_REDIRECT } from './nativeOAuth'

export const SIGN_IN_ERROR = 'Handle or PIN is not right'
export const NO_SIGNAL = 'No signal. Try again when you have data.'

/** Handle + PIN through the pin-login Edge Function, then hand the session to supabase-js. Returns an error string or null. */
export async function signInWithPin(handle: string, pin: string): Promise<string | null> {
  if (!supabase || !supabaseUrl || !supabasePublishableKey) return 'Sign-in is not set up yet.'
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/pin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabasePublishableKey, Authorization: `Bearer ${supabasePublishableKey}` },
      body: JSON.stringify({ handle: handle.trim().toLowerCase(), pin })
    })
    const body = await res.json().catch(() => null)
    if (res.status === 200 && body?.ok && body.session) {
      const { error } = await supabase.auth.setSession({ access_token: body.session.access_token, refresh_token: body.session.refresh_token })
      return error ? SIGN_IN_ERROR : null
    }
    if (res.status === 401 || res.status === 429) return SIGN_IN_ERROR
    return 'Could not reach sign-in. Check your connection and try again.'
  } catch {
    return NO_SIGNAL // fetch throws a TypeError when there is no network
  }
}

/** Wrong-PIN wait (start-wrong): five misses in a row make the phone wait one minute, then it unlocks by itself. Fingerprint stays available.
 *  Counting is pinAttempts (kv pin.fail.<handle>); this only turns the count into a one-minute wait. */
export const WAIT_MS = 60_000
export type WrongState = { kind: 'tries'; left: number } | { kind: 'wait'; until: number }
export function wrongState(f: { n: number; lastAt: number } | undefined, now: number, limit = 5): WrongState {
  if (!f) return { kind: 'tries', left: limit }
  if (f.n >= limit) return now < f.lastAt + WAIT_MS ? { kind: 'wait', until: f.lastAt + WAIT_MS } : { kind: 'tries', left: 1 } // after the wait one try at a time; a miss waits again
  return { kind: 'tries', left: limit - f.n }
}

/** Family invite link (start-invite): https://bantay.pages.dev/#join/<token>. Returns the token or null. */
export const INVITE_RE = /^[A-Za-z0-9_-]{8,64}$/
export function inviteFromHash(hash: string): string | null {
  const m = /^#join\/([^/?#]+)/.exec(hash)
  return m && INVITE_RE.test(m[1]!) ? m[1]! : null
}

export interface NameEntry { first_name: string; initial: string; handle: string }
/** 'invite': the link itself is refused. why: used (claimed or replaced), ended (past 7 days), tries (5 claim tries used), bad (unknown). */
export type InviteWhy = 'used' | 'ended' | 'tries' | 'bad'
export type NamesResult = { kind: 'ok'; names: NameEntry[] } | { kind: 'offline' } | { kind: 'error' } | { kind: 'invite'; why: InviteWhy }

/** Fresh phone (D-41) or invite link (M6): first names of active PIN members from the family-names Edge Function. A network failure is 'offline'; anything else is 'error'. */
export async function fetchFamilyNames(invite?: string | null): Promise<NamesResult> {
  if (!supabaseUrl || !supabasePublishableKey) return { kind: 'error' }
  try {
    const q = invite && INVITE_RE.test(invite) ? `?invite=${encodeURIComponent(invite)}` : '' // invite mode (D-81): the one name on that link
    const res = await fetch(`${supabaseUrl}/functions/v1/family-names${q}`, { headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${supabasePublishableKey}` } })
    if (q && res.status === 404) { // the link is refused; the body says why (used, ended, tries), anything else counts as unknown
      const why = (await res.json().catch(() => null))?.why
      return { kind: 'invite', why: why === 'used' || why === 'ended' || why === 'tries' ? why : 'bad' }
    }
    const body = res.ok ? await res.json().catch(() => null) : null
    if (!Array.isArray(body)) return { kind: 'error' }
    const names = body.flatMap((r): NameEntry[] =>
      r && typeof r.first_name === 'string' && r.first_name.trim() && typeof r.handle === 'string' && /^[a-z][a-z0-9_]{2,19}$/.test(r.handle)
        ? [{ first_name: r.first_name.slice(0, 30), initial: typeof r.initial === 'string' ? r.initial.slice(0, 1) : '', handle: r.handle }]
        : [])
    return { kind: 'ok', names }
  } catch {
    return { kind: 'offline' }
  }
}

/** Claiming a name from a personal invite link (D-81): pin-login action join_claim. The link names the member, so only the token and the new PIN go up.
 *  429 is 'too_many' (10 an hour per address); a network failure is 'no_signal'; any other refusal reads as an unusable link. */
export type JoinResult = { ok: true } | { ok: false; why: 'no_signal' | 'bad_invite' | 'taken' | 'bad_pin' | 'too_many' }
export async function joinPort(o: { invite: string; handle?: string; pin: string }): Promise<JoinResult> {
  if (!supabaseUrl || !supabasePublishableKey) return { ok: false, why: 'no_signal' }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/pin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabasePublishableKey, Authorization: `Bearer ${supabasePublishableKey}` },
      body: JSON.stringify({ action: 'join_claim', token: o.invite, pin: o.pin })
    })
    const body = await res.json().catch(() => null)
    if (res.status === 200 && body?.ok === true) return { ok: true }
    if (res.status === 429) return { ok: false, why: 'too_many' }
    if (res.status >= 500) return { ok: false, why: 'no_signal' }
    return { ok: false, why: body?.why === 'taken' || body?.why === 'bad_pin' ? body.why : 'bad_invite' }
  } catch {
    return { ok: false, why: 'no_signal' }
  }
}

export async function signInWithGoogle(): Promise<string | null> {
  if (!supabase) return 'Sign-in is not set up yet.'
  if (Capacitor.isNativePlatform()) {
    const FAIL = 'Could not start Google sign-in. Try again.'
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true } })
    if (error || !data?.url) return FAIL
    try { await Browser.open({ url: data.url }) } catch { return FAIL }
    return null
  }
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
  return error ? 'Could not start Google sign-in. Try again.' : null
}
