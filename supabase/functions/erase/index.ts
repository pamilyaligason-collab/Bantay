// Edge Function: erase the data of members whose 7-day undo window has passed. POST, called by cron (ops/sql/erasure_cron.sql). Deploy with --no-verify-jwt; the secret is the gate.
// Secrets: ERASE_CRON_SECRET (32+ chars). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Never log ids, paths or names.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { json } from '../_shared/http.ts'
import { heartbeat } from '../_shared/heartbeat.ts'
import { runErase, secretOk } from './logic.ts'
import { makePort, type AdminLike } from './port.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405, {})
  if (!secretOk(req.headers.get('x-erase-secret'), Deno.env.get('ERASE_CRON_SECRET'))) return json({ ok: false }, 401, {})
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } })
  const port = makePort(admin as unknown as AdminLike)
  try {
    const s = await runErase(port)
    await heartbeat(admin, 'erase', s.failed === 0, { ...s })
    return json({ ok: true, ...s }, 200, {})
  } catch {
    await heartbeat(admin, 'erase', false, {})
    return json({ ok: false }, 500, {})
  }
})
