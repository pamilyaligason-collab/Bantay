import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from './client'
import { mapOAuthError } from './urlError'

export const NATIVE_REDIRECT = 'ph.bantay.family://auth-callback'

const subs = new Set<(e: string) => void>()
export function onNativeSignInError(cb: (e: string) => void): () => void {
  subs.add(cb)
  return () => { subs.delete(cb) }
}

/** The Custom Tab sends the browser back here (PKCE). Returns an error string or null; other URLs are ignored. */
export async function handleAuthCallback(url: string): Promise<string | null> {
  if (!url.startsWith(NATIVE_REDIRECT) || !/^([?#/]|$)/.test(url.slice(NATIVE_REDIRECT.length))) return null
  try { await Browser.close() } catch { /* rejects on Android when no tab is open */ }
  const i = url.search(/[?#]/)
  const p = new URLSearchParams(i < 0 ? '' : url.slice(i + 1).replace('#', '&'))
  if (p.get('error')) return mapOAuthError(`${p.get('error')} ${p.get('error_code') ?? ''} ${(p.get('error_description') ?? '').replace(/\+/g, ' ')}`)
  const code = p.get('code')
  if (!code || !supabase) return null
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    return error ? 'Sign-in did not work. Try again.' : null
  } catch {
    return 'Sign-in did not work. Try again.'
  }
}

if (Capacitor.isNativePlatform() && supabase) {
  void App.addListener('appUrlOpen', async ({ url }) => {
    const e = await handleAuthCallback(url)
    if (e) subs.forEach((cb) => cb(e))
  })
}
