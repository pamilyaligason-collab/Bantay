// Read OAuth errors from the URL once, at import time, BEFORE the Supabase client (client.ts imports this first) can consume or clear them.
// Supabase returns them as ?error=...&error_description=... (PKCE) or #error=... (implicit). Then clean the URL.
const NOT_INVITED = 'This Google account is not invited yet. Ask your family admin.'

function read(): string | null {
  try {
    const q = new URLSearchParams(location.search)
    const h = new URLSearchParams(location.hash.replace(/^#/, ''))
    const src = q.get('error') ? q : h.get('error') ? h : null
    if (!src) return null
    const desc = (src.get('error_description') ?? '').replace(/\+/g, ' ')
    const text = `${desc} ${src.get('error_code') ?? ''}`
    ;['error', 'error_code', 'error_description'].forEach((k) => q.delete(k))
    const hashHadError = h.get('error') !== null
    const qs = q.toString()
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + (hashHadError ? '' : location.hash))
    if (/signups? not allowed|signup_disabled|saving new user|before.user.created|hook/i.test(text)) return NOT_INVITED
    return desc ? desc.slice(0, 140) : 'Sign-in did not work. Try again.'
  } catch {
    return null
  }
}

export const urlSignInError: string | null = read()
