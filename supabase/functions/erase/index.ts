// Edge Function: erase the data of members whose 7-day undo window has passed. POST, called by cron (ops/sql/erasure_cron.sql). Deploy with --no-verify-jwt; the secret is the gate.
// Secrets: ERASE_CRON_SECRET (32+ chars). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Never log ids, paths or names.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { json } from '../_shared/http.ts'
import { heartbeat } from '../_shared/heartbeat.ts'
import { runErase, secretOk, type ErasePort } from './logic.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405, {})
  if (!secretOk(req.headers.get('x-erase-secret'), Deno.env.get('ERASE_CRON_SECRET'))) return json({ ok: false }, 401, {})
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } })
  const port: ErasePort = {
    async due() {
      const { data, error } = await admin.rpc('erasure_due')
      if (error) throw new Error('due')
      return (data ?? []).map((r: { user_id: string }) => ({ userId: r.user_id }))
    },
    async paths(userId) {
      const { data, error } = await admin.rpc('erasure_paths', { p_user: userId })
      if (error) throw new Error('paths')
      return data ?? []
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
    }
  }
  try {
    const s = await runErase(port)
    await heartbeat(admin, 'erase', s.failed === 0, { ...s })
    return json({ ok: true, ...s }, 200, {})
  } catch {
    await heartbeat(admin, 'erase', false, {})
    return json({ ok: false }, 500, {})
  }
})
