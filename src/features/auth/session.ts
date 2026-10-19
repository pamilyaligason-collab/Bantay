// Contract: docs/CONTRACT-auth-sync-admin.md. Signatures are fixed; the client is the shared one in ./client.
import { supabase } from './client'
import { clearDocsCache } from '../docs/api'

export interface Member { userId: string; personId: string | null; role: 'admin' | 'member'; handle: string | null }

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Who is signed in, with role and handle. null when signed out or when auth is not configured. */
export async function getMember(): Promise<Member | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return null
  const [role, person] = await Promise.all([
    supabase.from('app_roles').select('role, handle').eq('user_id', uid).maybeSingle(),
    supabase.from('people').select('id').eq('auth_user_id', uid).maybeSingle()
  ])
  return {
    userId: uid,
    personId: person.data?.id ?? null,
    role: role.data?.role === 'admin' ? 'admin' : 'member', // no row yet (first sign-in) means member
    handle: role.data?.handle ?? null
  }
}

export function onAuthChange(cb: () => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange(() => cb())
  return () => data.subscription.unsubscribe()
}

/** Signs out this device only; other devices stay signed in. */
export async function signOut(): Promise<void> {
  void clearDocsCache().catch(() => {})
  void import('../records/useHealthData').then((m) => m.resetPersonChoice()).catch(() => {}) // next person starts on their own records
  await supabase?.auth.signOut({ scope: 'local' })
}
