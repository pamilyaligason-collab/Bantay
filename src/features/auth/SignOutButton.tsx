import { supabase } from './client'
import { signOut } from './session'

/** For the Family screen (orchestrator mounts it). Renders nothing when auth is not configured. */
export function SignOutButton() {
  if (!supabase) return null
  return <button className="btn2" onClick={() => signOut()}>Sign out</button>
}
