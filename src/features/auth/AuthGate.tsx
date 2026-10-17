import { useEffect, useState, type ReactNode } from 'react'
import SignIn from '../../screens/SignIn'
import { supabase } from './client'
import { cacheFamily, passkeyCheck } from './family'

const doneKey = (uid: string) => `bantay.person.${uid}`
const seen = (uid: string) => { try { return localStorage.getItem(doneKey(uid)) === '1' } catch { return false } }
const mark = (uid: string) => { try { localStorage.setItem(doneKey(uid), '1') } catch { /* private mode */ } }

/**
 * Signed out: SignIn. Signed in: make sure the member has their own people row (ensure_self_person), then the app.
 * Dev bypass: when VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are unset, children render only outside production
 * (dev, unit tests, or the e2e build made with BANTAY_ALLOW_NO_AUTH=1). A production build without them shows an alert.
 * Offline with a stored session still opens the app: the RPC is retried on the next online start.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'out' | 'in'>(supabase ? 'loading' : 'in')

  useEffect(() => {
    const sb = supabase
    if (!sb) return
    let alive = true
    const settle = async (uid: string | undefined) => {
      if (!uid) { if (alive) setState('out'); return }
      if (passkeyCheck) {
        // Passkey sign-in is still checking it is the tapped person. Wait; if the session is gone, stay signed out.
        await passkeyCheck.catch(() => {})
        const { data } = await sb.auth.getSession()
        if (data.session?.user.id !== uid) { if (alive) setState('out'); return }
      }
      if (!seen(uid)) {
        try {
          const { error } = await sb.rpc('ensure_self_person')
          if (!error) mark(uid)
        } catch { /* offline: try again next start */ }
      }
      void cacheFamily() // trusted device: remember the family picker list (quiet on failure)
      if (alive) setState('in')
    }
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setState('out')
      // Run after the callback returns; supabase-js must not be awaited inside it.
      else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(() => settle(session?.user.id), 0)
    })
    return () => { alive = false; data.subscription.unsubscribe() }
  }, [])

  if (!supabase) {
    // Dev/test bypass only. A production build without env must never open the app unlocked.
    if (import.meta.env.PROD && !__ALLOW_NO_AUTH__) return <p role="alert">Sign-in is not configured.</p>
    return <>{children}</>
  }
  if (state === 'loading') return null
  return state === 'out' ? <SignIn /> : <>{children}</>
}
