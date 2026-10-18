// Read OAuth errors from the URL once, at import time, BEFORE the Supabase client (client.ts imports this first) can consume or clear them.
// Supabase returns them as ?error=...&error_description=... (PKCE) or #error=... (implicit). Then clean the URL.
// The text from the URL is never shown: it is only matched against known cases and mapped to fixed strings.
const NOT_INVITED = 'This Google account is not invited yet. Ask your family admin.'

export function mapOAuthError(text: string): string {
  if (/signups? not allowed|signup_disabled|saving new user|before.user.created|processing hook|hook_(payload|timeout|failed)/i.test(text)) return NOT_INVITED
  if (/access_denied/i.test(text)) return 'Google sign-in was cancelled. Try again.'
  return 'Sign-in did not work. Try again.'
}

function read(): string | null {
  try {
    const q = new URLSearchParams(location.search)
    const h = new URLSearchParams(location.hash.replace(/^#/, ''))
    const src = q.get('error') ? q : h.get('error') ? h : null
    if (!src) return null
    const text = `${src.get('error') ?? ''} ${src.get('error_code') ?? ''} ${(src.get('error_description') ?? '').replace(/\+/g, ' ')}`
    ;['error', 'error_code', 'error_description'].forEach((k) => q.delete(k))
    const hashHadError = h.get('error') !== null
    const qs = q.toString()
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + (hashHadError ? '' : location.hash))
    return mapOAuthError(text)
  } catch {
    return null
  }
}

export const urlSignInError: string | null = read()
