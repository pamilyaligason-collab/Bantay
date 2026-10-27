// Edge Function: handle + 6-digit PIN -> Supabase session. Deploy with --no-verify-jwt (callers are signed out by definition).
// Secrets: PIN_PEPPER, ALLOWED_ORIGIN. SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Never log request bodies, PINs, derived passwords or tokens.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders, json } from '../_shared/http.ts'
import { attemptLogin, resetComplete, resetStart, type LoginPort, type ResetPort } from '../_shared/login.ts'

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

  const reset: ResetPort = {
    pepper,
    async tryKey(key, limit, win) {
      const { data, error } = await admin.rpc('pin_try', { k: key, lim: limit, win })
      if (error || typeof data !== 'number') throw new Error('limiter')
      return data
    },
    findUser: port.findUser,
    async createRequest(r) {
      await admin.from('pin_reset_requests').update({ used_at: new Date().toISOString() }).eq('user_id', r.userId).is('used_at', null)
      const { error } = await admin.from('pin_reset_requests').insert({
        id: r.id, user_id: r.userId, method: r.method, code: r.code, secret_hash: r.secretHash,
        ...(r.approved ? { approved_by: r.userId, approved_at: new Date().toISOString() } : {})
      })
      if (error) throw new Error('create')
    },
    async notifyApprovers(requestId, userId) {
      const { data: me } = await admin.from('people').select('id').eq('auth_user_id', userId).maybeSingle()
      if (!me) return
      const { data: members } = await admin.from('app_roles').select('user_id').eq('disabled', false).neq('user_id', userId)
      const rows = (members ?? []).map((m) => ({ person_id: me.id, carer_user_id: m.user_id, kind: 'pin_approve', template: 'pin_approve', ref: requestId }))
      for (const row of rows) await admin.from('carer_alerts').insert(row) // one by one: a duplicate (kind, ref, carer) fails alone
      // Best effort: web push for PWA approvers now instead of at the next 15 minute run. Needs the dose-watch cron secret (ML-29: redeploy on rotation).
      const secret = env('DOSE_WATCH_CRON_SECRET')
      if (secret) {
        try {
          await fetch(`${env('SUPABASE_URL')}/functions/v1/dose-watch`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dose-watch-secret': secret },
            body: JSON.stringify({ mode: 'flush' }), signal: AbortSignal.timeout(3000)
          })
        } catch { /* the 15 minute run delivers it */ }
      }
    },
    async verifyGoogle(token) {
      const { data } = await admin.auth.getUser(token)
      const u = data.user
      return u && (u.identities ?? []).some((i) => i.provider === 'google') ? u.id : null
    },
    async getRequest(id) {
      const { data } = await admin.from('pin_reset_requests').select('id, user_id, secret_hash, approved_at, used_at, expires_at').eq('id', id).maybeSingle()
      return data ? { id: data.id, userId: data.user_id, secretHash: data.secret_hash, approvedAt: data.approved_at, usedAt: data.used_at, expiresAt: data.expires_at } : null
    },
    async claim(id) {
      const now = new Date().toISOString()
      const { data } = await admin.from('pin_reset_requests').update({ used_at: now }).eq('id', id).is('used_at', null).not('approved_at', 'is', null).gt('expires_at', now).select('id')
      return (data ?? []).length === 1
    },
    async release(id) {
      await admin.from('pin_reset_requests').update({ used_at: null }).eq('id', id)
    },
    async setPin(userId, password) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      return !error
    },
    async afterReset(userId, requestId) {
      // The PIN has changed; none of these may fail the reset. Old sessions end, the lock clears, the owner is told in Bantay, the change is logged.
      const { data: person } = await admin.from('people').select('id').eq('auth_user_id', userId).maybeSingle()
      const { data: req } = await admin.from('pin_reset_requests').select('approved_by').eq('id', requestId).maybeSingle()
      const steps = [
        admin.rpc('revoke_sessions', { uid: userId }),
        admin.from('pin_attempts').delete().eq('user_id', userId),
        admin.from('audit_log').insert({ actor: req?.approved_by ?? null, tbl: 'app_roles', row_id: null, person_id: person?.id ?? null, action: 'pin_reset', fields: null }),
        ...(person ? [admin.from('carer_alerts').insert({ person_id: person.id, carer_user_id: userId, kind: 'pin_changed', template: 'pin_changed', ref: requestId })] : [])
      ]
      await Promise.allSettled(steps)
    }
  }

  try {
    const raw = await req.text()
    const body = raw.length <= 6144 ? JSON.parse(raw) : null // reset_start may carry a Google access token
    // The first x-forwarded-for hop is client-supplied; the last one is added by the platform proxy.
    const xff = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? xff[xff.length - 1] ?? 'unknown'
    const action = typeof body === 'object' && body !== null ? (body as { action?: unknown }).action : undefined
    if (action === 'reset_start') { const r = await resetStart(body, ip, reset); return json(r.body, r.status, cors) }
    if (action === 'reset_complete') { const r = await resetComplete(body, ip, reset); return json(r.body, r.status, cors) }
    if (typeof body === 'object' && body !== null && raw.length > 1024) throw new Error('too long') // sign-in bodies stay small
    const r = await attemptLogin(body, ip, port)
    return json(r.body, r.status, cors)
  } catch {
    // Parse errors and limiter failures fail closed with the same generic text.
    return json({ ok: false, error: 'bad_credentials', message: 'Handle or PIN is not right' }, 401, cors)
  }
})
