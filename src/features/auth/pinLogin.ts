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

/** "Forgot PIN? Send a request": the server answers the same for any handle, so this only reports whether the phone could reach it. */
export async function requestPinReset(handle: string): Promise<'sent' | 'no_signal'> {
  if (!supabase) return 'no_signal'
  try {
    const { error } = await supabase.rpc('request_pin_reset', { h: handle.trim().toLowerCase() })
    return error && !error.code ? 'no_signal' : 'sent' // postgrest-js reports a network failure as an error with no code
  } catch {
    return 'no_signal'
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
