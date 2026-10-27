// The erase function's database, storage and Auth calls, split from index.ts so a mocked admin client can test them.
import { erasedEmail, type ErasePort } from './logic.ts'

type Res = Promise<{ data?: unknown; error: unknown }>
export interface AdminLike {
  rpc(fn: string, args?: Record<string, unknown>): Res
  storage: { from(bucket: string): { remove(paths: string[]): Res } }
  auth: { admin: { updateUserById(id: string, attrs: Record<string, unknown>): Res } }
}

export function makePort(admin: AdminLike): ErasePort {
  return {
    async due() {
      const { data, error } = await admin.rpc('erasure_due')
      if (error) throw new Error('due')
      return ((data ?? []) as { user_id: string; erased: boolean }[]).map((r) => ({ userId: r.user_id, erased: r.erased === true }))
    },
    async paths(userId) {
      const { data, error } = await admin.rpc('erasure_paths', { p_user: userId })
      if (error) throw new Error('paths')
      return (data ?? []) as { bucket: string; path: string }[]
    },
    async removeObjects(bucket, paths) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100)) // removing a missing object is not an error
        if (error) return false
      }
      return true
    },
    async eraseUser(userId) {
      const { error } = await admin.rpc('erase_user_data', { p_user: userId })
      return !error
    },
    // After the data is gone: no session, no sign-in by any method (erasure_scrub_identities also empties the user metadata: the Auth API merges it key by key). The email goes last, because erasure_due() reads it as "auth step finished".
    async lockAuth(userId) {
      if ((await admin.rpc('revoke_sessions', { uid: userId })).error) return false
      if ((await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })).error) return false // as admin-members does for a disable
      if ((await admin.rpc('erasure_scrub_identities', { p_user: userId })).error) return false
      return !(await admin.auth.admin.updateUserById(userId, { email: erasedEmail(userId), email_confirm: true, user_metadata: {} })).error
    }
  }
}
