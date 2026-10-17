// Edge Function: handle + 6-digit PIN -> Supabase session. Deploy with --no-verify-jwt (callers are signed out by definition).
// Secrets: PIN_PEPPER, ALLOWED_ORIGIN. SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Never log request bodies, PINs, derived passwords or tokens.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders, json } from '../_shared/http.ts'
import { attemptLogin, type LoginPort } from '../_shared/login.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

const env = (k: string) => Deno.env.get(k) ?? ''
const WINDOW = '15 minutes'

Deno.serve(async (req) => {
  const cors = corsHeaders(Deno.env.get('ALLOWED_ORIGIN'), req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'bad_credentials', message: 'Handle or PIN is not right' }, 405, cors)

  const pepper = env('PIN_PEPPER')
  if (pepper.length < 32) return json({ ok: false, error: 'server_error' }, 500, cors) // refuse to run with a weak or missing pepper

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })

  const port: LoginPort = {
    pepper,
    async tryKey(key, limit) {
      const { data, error } = await admin.rpc('pin_try', { k: key, lim: limit, win: WINDOW })
      if (error || typeof data !== 'number') throw new Error('limiter')
      return data
    },
    async clearKey(key) {
      await admin.from('pin_attempts').delete().eq('user_id', key)
    },
    async findUser(handle) {
      const { data: role } = await admin.from('app_roles').select('user_id, disabled').eq('handle', handle).maybeSingle()
      if (!role) return null
      const { data } = await admin.auth.admin.getUserById(role.user_id)
      return data.user?.email ? { userId: role.user_id, email: data.user.email, disabled: role.disabled } : null
    },
    async signIn(email, password) {
      const { data, error } = await anon.auth.signInWithPassword({ email, password })
      if (error || !data.session) return null
      const s = data.session
      return { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, token_type: s.token_type }
    }
  }

  try {
    const raw = await req.text()
    const body = raw.length <= 1024 ? JSON.parse(raw) : null
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const r = await attemptLogin(body, ip, port)
    return json(r.body, r.status, cors)
  } catch {
    // Parse errors and limiter failures fail closed with the same generic text.
    return json({ ok: false, error: 'bad_credentials', message: 'Handle or PIN is not right' }, 401, cors)
  }
})
