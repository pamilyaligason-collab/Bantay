// Edge Function: first names of active PIN members for a fresh phone's sign-in list (D-41). GET, anonymous. Deploy with --no-verify-jwt.
// Secrets: PIN_PEPPER, ALLOWED_ORIGIN. Returns [{ first_name, initial, handle }] only: no ids, photos, roles or emails.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders, json } from '../_shared/http.ts'
import { listNames, type NamesPort } from '../_shared/names.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

const env = (k: string) => Deno.env.get(k) ?? ''

Deno.serve(async (req) => {
  const cors = corsHeaders(Deno.env.get('ALLOWED_ORIGIN'), req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'GET') return json({ ok: false }, 405, cors)
  const pepper = env('PIN_PEPPER')
  if (pepper.length < 32) return json({ ok: false }, 500, cors)

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  const port: NamesPort = {
    pepper,
    async tryKey(key, limit) {
      const { data, error } = await admin.rpc('pin_try', { k: key, lim: limit, win: '15 minutes' })
      if (error || typeof data !== 'number') throw new Error('limiter')
      return data
    },
    async listPinMembers() {
      const [roles, people, users] = await Promise.all([
        admin.from('app_roles').select('user_id, handle').eq('disabled', false).not('handle', 'is', null),
        admin.from('people').select('auth_user_id, display_name').not('auth_user_id', 'is', null).is('archived_at', null),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }) // ponytail: one page, as in admin-members
      ])
      const pinUsers = new Set(users.data.users.filter((u) => /^m-.+@members\.bantay\.invalid$/.test(u.email ?? '')).map((u) => u.id))
      const nameOf = new Map((people.data ?? []).map((p) => [p.auth_user_id as string, p.display_name as string]))
      return (roles.data ?? []).filter((r) => pinUsers.has(r.user_id) && nameOf.has(r.user_id)).map((r) => ({ displayName: nameOf.get(r.user_id)!, handle: r.handle as string }))
    }
  }
  try {
    const xff = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? xff[xff.length - 1] ?? 'unknown'
    const r = await listNames(ip, port)
    return json(r.body, r.status, cors)
  } catch {
    return json({ ok: false }, 500, cors) // limiter or read failure: the phone falls back to the handle and PIN form
  }
})
