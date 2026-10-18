import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { supabase, supabaseUrl, supabasePublishableKey } from './client'
import { NATIVE_REDIRECT } from './nativeOAuth'

export const SIGN_IN_ERROR = 'Handle or PIN is not right'

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
    return 'Could not reach sign-in. Check your connection and try again.'
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
