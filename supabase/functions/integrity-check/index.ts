// Nightly data integrity check (S30, L2): duplicates, impossible values, unit mismatches and day totals that disagree, over every reading, lab result and activity row.
// FINDINGS ONLY into public.integrity_findings (admins read them in System health); nothing is deleted or changed. The heartbeat row 'integrity-check' carries counts only.
// Not public: callable only with INTEGRITY_CRON_SECRET in the x-secret header (pg_cron + pg_net, ops/sql/integrity_check_cron.sql). Deploy with --no-verify-jwt; the secret is the gate.
// Function secrets (set by the owner): INTEGRITY_CRON_SECRET (32+ characters), ALLOWED_ORIGIN. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { heartbeat } from '../_shared/heartbeat.ts'
import { corsHeaders, json } from '../_shared/http.ts'
import { MAX_ROWS, type OpenRef, type Port, runIntegrity } from './run.ts'

const PAGE = 1000 // PostgREST returns at most 1000 rows a request

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

Deno.serve(async (req) => {
  const cors = corsHeaders(Deno.env.get('ALLOWED_ORIGIN'), req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'bad_input' }, 405, cors)
  const secret = Deno.env.get('INTEGRITY_CRON_SECRET')
  if (!secret || secret.length < 32) return json({ ok: false, error: 'not_configured' }, 500, cors) // before any other work
  if (!same(req.headers.get('x-secret') ?? '', secret)) return json({ ok: false, error: 'unauthorized' }, 401, cors)

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  // Every page is read with the same order, so a row is never read twice or skipped between pages.
  async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await read(from, from + PAGE - 1)
      if (error) throw new Error('read')
      out.push(...(data ?? []))
      if (!data || data.length < PAGE) return out
      if (out.length >= MAX_ROWS) throw new Error('too_many_rows')
    }
  }
  const port: Port = {
    readings: () => pages((a, b) => sb.from('readings').select('id,person_id,taken_at,test,value,unit').is('deleted_at', null).order('id').range(a, b)),
    labs: () => pages((a, b) => sb.from('lab_results').select('id,person_id,test_code,name_raw,value_num,unit_raw,collected_at,status').order('id').range(a, b)),
    activity: () => pages((a, b) => sb.from('activity').select('id,person_id,kind,minutes,steps,started_at,source').order('id').range(a, b)),
    async logged() { return new Set((await pages<{ row_id: string }>((a, b) => sb.from('records_dedupe_log').select('row_id').order('id').range(a, b))).map((r) => r.row_id)) },
    openRefs: () => pages<OpenRef>((a, b) => sb.from('integrity_findings').select('id,kind,table_name,row_ref').eq('status', 'open').order('id').range(a, b)),
    async upsert(rows) {
      const { error } = await sb.from('integrity_findings').upsert(rows, { onConflict: 'kind,table_name,row_ref' })
      if (error) throw new Error('write')
    },
    async resolve(ids, at) {
      const { error } = await sb.from('integrity_findings').update({ status: 'resolved', checked_at: at }).in('id', ids)
      if (error) throw new Error('write')
    },
    async trim(cutoff) {
      const { error } = await sb.from('integrity_findings').delete().eq('status', 'resolved').lt('checked_at', cutoff)
      if (error) throw new Error('write')
    }
  }
  const r = await runIntegrity(port, Date.now())
  // counts only (heartbeat B-7): never a name, a value or a record id
  await heartbeat(sb, 'integrity-check', r.ok, { dupes: r.dupes, impossible: r.impossible, mismatched: r.mismatched, checked: r.checked })
  return json({ ok: r.ok, dupes: r.dupes, impossible: r.impossible, mismatched: r.mismatched, checked: r.checked, resolved: r.resolved }, r.ok ? 200 : 502, cors)
})
