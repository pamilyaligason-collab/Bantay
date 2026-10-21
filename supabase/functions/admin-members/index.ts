// Edge Function: admin-only member management (contract: docs/CONTRACT-auth-sync-admin.md). Deploy with --no-verify-jwt:
// the caller's JWT is verified here (auth.getUser) and is_admin() is checked with the caller's own client, then the service role acts.
// Secrets: PIN_PEPPER, ALLOWED_ORIGIN. Never log request bodies, PINs or derived passwords.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders, json } from '../_shared/http.ts'
import { lockState, runAction, type Member, type Port, type Role } from '../_shared/members.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

const env = (k: string) => Deno.env.get(k) ?? ''
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

Deno.serve(async (req) => {
  const cors = corsHeaders(Deno.env.get('ALLOWED_ORIGIN'), req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'bad_input' }, 405, cors)

  const pepper = env('PIN_PEPPER')
  if (pepper.length < 32) return json({ ok: false, error: 'server_error' }, 500, cors)

  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { ...opts, global: { headers: { Authorization: authHeader } } })
    const { data: u } = await caller.auth.getUser()
    const { data: isAdmin } = u.user ? await caller.rpc('is_admin') : { data: false }
    if (!u.user || isAdmin !== true) return json({ ok: false, error: 'not_admin' }, 200, cors)

    const raw = await req.text()
    const body = raw.length <= 4096 ? JSON.parse(raw) : null
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), opts)
    return json(await runAction(body, adapt(admin, pepper), u.user.id), 200, cors)
  } catch {
    return json({ ok: false, error: 'server_error' }, 500, cors)
  }
})

type Admin = ReturnType<typeof createClient>

function adapt(admin: Admin, pepper: string): Port {
  return {
    pepper,
    async createAuthUser(email, password, displayName) {
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { display_name: displayName },
        app_metadata: { created_by_admin: true } // the Before User Created hook trusts this; clients cannot set app_metadata
      })
      return error || !data.user ? null : data.user.id
    },
    async deleteAuthUser(userId) { await admin.auth.admin.deleteUser(userId) },
    async getAuthEmail(userId) {
      const { data } = await admin.auth.admin.getUserById(userId)
      return data.user?.email ?? null
    },
    async setPassword(userId, password) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      return !error
    },
    async setBanned(userId, banned) {
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: banned ? '876000h' : 'none' })
      return !error
    },
    async deletePushSubscriptions(userId) {
      const { error } = await admin.from('push_subscriptions').delete().eq('user_id', userId)
      return !error
    },
    async revokeSessions(userId) {
      const { error } = await admin.rpc('revoke_sessions', { uid: userId })
      return !error
    },
    async clearPinLock(userId) {
      const { error } = await admin.from('pin_attempts').delete().eq('user_id', userId)
      return !error
    },
    async insertRole(userId, role, handle) {
      const { error } = await admin.from('app_roles').insert({ user_id: userId, role, handle })
      return !error ? 'ok' : error.code === '23505' ? 'handle_taken' : 'error'
    },
    async updateRole(userId, patch) {
      const { data, error } = await admin.from('app_roles').update(patch).eq('user_id', userId).select('user_id')
      if (error) return error.code === '23505' ? 'handle_taken' : 'not_found'
      return data && data.length > 0 ? 'ok' : 'not_found'
    },
    async insertPerson(userId, displayName, createdBy) {
      const { data, error } = await admin.from('people').insert({ auth_user_id: userId, display_name: displayName, created_by: createdBy }).select('id').single()
      return error || !data ? null : data.id
    },
    async updatePerson(personId, patch) {
      const { data, error } = await admin.from('people').update(patch).eq('id', personId).select('id')
      if (error) return 'error'
      return data && data.length > 0 ? 'ok' : 'not_found'
    },
    async getPersonLogin(personId) {
      const { data, error } = await admin.from('people').select('auth_user_id, display_name').eq('id', personId).maybeSingle()
      if (error) throw new Error('read') // an unreadable row must not look like "no such person"
      return data ? { authUserId: (data.auth_user_id as string | null) ?? null, displayName: data.display_name as string } : null
    },
    async attachPerson(personId, userId) {
      // .is(auth_user_id, null) keeps two admins from attaching two logins to one person
      const { data, error } = await admin.from('people').update({ auth_user_id: userId, archived_at: null, archived_by: null }).eq('id', personId).is('auth_user_id', null).select('id')
      if (error) return 'error'
      return data && data.length > 0 ? 'ok' : 'not_found'
    },
    async addInvite(email, by) {
      const { error } = await admin.from('invites').upsert({ email, invited_by: by })
      return !error
    },
    async removeInvite(email) {
      const { error } = await admin.from('invites').delete().eq('email', email)
      return !error
    },
    async listMembers() {
      // ponytail: one page of 1000 auth users; a family never gets near it. Paginate if that changes.
      const [roles, people, users, locks] = await Promise.all([
        admin.from('app_roles').select('user_id, role, handle, disabled'),
        admin.from('people').select('id, auth_user_id, display_name, photo_path, phone, birthdate, blood_type, allergies, conditions, medicines, archived_at').not('auth_user_id', 'is', null),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin.from('pin_attempts').select('user_id, fails, locked_until')
      ])
      // A failed select must not look like "everyone has no name" (e.g. deployed before migration 0010): fail the call, the handler answers server_error.
      if (roles.error || people.error || users.error || locks.error) throw new Error('list_failed')
      const byUser = new Map(users.data.users.map((x) => [x.id, x]))
      const lockOf = new Map((locks.data ?? []).map((l) => [l.user_id as string, l]))
      const personOf = new Map((people.data ?? []).map((p) => [p.auth_user_id as string, p]))
      return (roles.data ?? []).map((r): Member => {
        const au = byUser.get(r.user_id)
        const p = personOf.get(r.user_id)
        return {
          ...lockState(lockOf.get(r.user_id)),
          userId: r.user_id, personId: p?.id ?? null, displayName: p?.display_name ?? '', handle: r.handle,
          role: r.role as Role, disabled: r.disabled, lastSignInAt: au?.last_sign_in_at ?? null, provider: (au?.app_metadata?.provider as string | undefined) ?? null, archivedAt: p?.archived_at ?? null,
          profile: p ? { photoPath: p.photo_path, phone: p.phone, birthdate: p.birthdate, bloodType: p.blood_type, allergies: p.allergies ?? [], conditions: p.conditions ?? [], medicines: p.medicines ?? [] } : null
        }
      })
    }
  }
}
