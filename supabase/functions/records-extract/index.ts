// Reads a phone scan (lane L6, contract: README.md next to this file). Two callers:
//  * the app, right after it uploaded a scan: body {document_id}, the member's JWT in Authorization. The caller must be able to
//    see that document under RLS (records_editor of the person: drafts are editor-only), then the service role does the work.
//  * the cron sweep: empty body, RECORDS_EXTRACT_CRON_SECRET in the x-records-extract-secret header (pg_cron + pg_net, see
//    ops/sql/records_extract_cron.sql). Picks up scans the app never announced (no signal after the upload).
// Deploy with --no-verify-jwt: the JWT (app) or the secret (cron) is checked here. Answers 202 at once and reads in the
// background (EdgeRuntime.waitUntil); the app follows source_files.ingest_status (reading -> queued | failed).
// Every row written is a draft: nothing from a phone scan is ever confirmed by the server.
// Function secrets (set by Lloyd): OPENROUTER_API_KEY, RECORDS_EXTRACT_CRON_SECRET, ALLOWED_ORIGIN; optional OPENROUTER_MODEL,
// OPENROUTER_FALLBACK_MODEL. SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// B-7: logs hold document ids and counts only. Never page bytes, model output, names or values.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders, json } from '../_shared/http.ts'
import {
  type CatalogRow, DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL, type DocRow, type Env, extractDocument, type PageRow, parseBody, type Port, runSweep,
  sendToOpenRouter, summary, SWEEP_LIMIT, withRetry
} from './logic.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const env = (k: string) => Deno.env.get(k) ?? ''
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

/** Keep working after the reply. Outside the Supabase runtime (local tests) the work is awaited instead. */
async function background(p: Promise<unknown>) {
  const rt = typeof EdgeRuntime === 'undefined' ? undefined : EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
  else await p
}

function makePort(sb: SupabaseClient, key: string): Port {
  return {
    async claim(id) {
      const { data, error } = await sb.rpc('records_scan_claim', { p_document: id })
      if (error) throw new Error('claim')
      return Number(data ?? 0)
    },
    async due(limit) {
      const { data, error } = await sb.rpc('records_scan_due', { p_limit: limit })
      if (error) throw new Error('due')
      return ((data ?? []) as unknown[]).map((r) => (typeof r === 'string' ? r : String((r as Record<string, unknown>).records_scan_due)))
    },
    async document(id) {
      const { data, error } = await sb.from('documents').select('id,person_id,kind,status,created_by').eq('id', id).maybeSingle()
      if (error) throw new Error('read')
      return (data as DocRow | null) ?? null
    },
    async pages(id) {
      const { data, error } = await sb.from('source_files').select('id,page_no,name,mime,size_bytes,storage_path').eq('document_id', id).not('storage_path', 'is', null)
      if (error) throw new Error('read')
      return (data ?? []) as PageRow[]
    },
    async download(path) {
      const { data, error } = await sb.storage.from('records').download(path)
      return error || !data ? null : new Uint8Array(await data.arrayBuffer())
    },
    async catalog() {
      const { data, error } = await sb.from('test_catalog').select('code,name,loinc,unit,aliases,conversions')
      if (error) throw new Error('read')
      return (data ?? []) as CatalogRow[]
    },
    async insert(table, rows) {
      const { error } = await sb.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error('write')
    },
    async updateDocument(id, patch) {
      const { error } = await sb.from('documents').update(patch).eq('id', id).eq('status', 'draft')
      if (error) throw new Error('write')
    },
    async finish(id, status, err) {
      const { error } = await sb.from('source_files').update({ ingest_status: status, ingest_error: err, ingest_tries: 0 })
        .eq('document_id', id).eq('ingest_status', 'reading')
      if (error) throw new Error('write')
    },
    read: (body) => withRetry(() => sendToOpenRouter(fetch, body, key))
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(Deno.env.get('ALLOWED_ORIGIN'), req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'bad_input' }, 405, cors)

  const key = env('OPENROUTER_API_KEY').trim() // a pasted key often carries a space or line break
  const cfg: Env = { model: env('OPENROUTER_MODEL') || DEFAULT_MODEL, fallbackModel: env('OPENROUTER_FALLBACK_MODEL') || DEFAULT_FALLBACK_MODEL }
  if (!key || [cfg.model, cfg.fallbackModel].some((m) => /:free$/i.test(m))) return json({ ok: false, error: 'not_configured' }, 500, cors)

  try {
    const what = parseBody(await req.text())
    if (!what) return json({ ok: false, error: 'bad_input' }, 400, cors)
    const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), opts)
    const port = makePort(sb, key)

    if (what === 'sweep') {
      const secret = env('RECORDS_EXTRACT_CRON_SECRET')
      if (secret.length < 32) return json({ ok: false, error: 'not_configured' }, 500, cors)
      if (!same(req.headers.get('x-records-extract-secret') ?? '', secret)) return json({ ok: false, error: 'unauthorized' }, 401, cors)
      await background(runSweep(port, cfg, SWEEP_LIMIT).then((rs) => console.log(JSON.stringify({ fn: 'records-extract', mode: 'sweep', ...summary(rs) }))).catch(() => console.error('records-extract sweep failed')))
      return json({ ok: true, status: 'sweeping' }, 202, cors)
    }

    // The app: a signed-in member who may edit this document's person (drafts are invisible to everyone else under RLS).
    const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { ...opts, global: { headers: { Authorization: req.headers.get('authorization') ?? '' } } })
    const { data: u } = await caller.auth.getUser()
    if (!u.user) return json({ ok: false, error: 'unauthorized' }, 401, cors)
    const { data: seen, error } = await caller.from('documents').select('id,kind,status').eq('id', what.documentId).maybeSingle()
    if (error) return json({ ok: false, error: 'server_error' }, 500, cors)
    if (!seen) return json({ ok: false, error: 'not_found' }, 404, cors)
    if (seen.status !== 'draft' || ['id_card', 'insurance_card'].includes(seen.kind)) return json({ ok: false, error: 'not_a_scan' }, 409, cors)

    const pages = await port.claim(what.documentId)
    if (pages === 0) return json({ ok: true, status: 'waiting' }, 200, cors) // pages missing, already read, or another run has it
    // claimed here (so the reply can say so); extractDocument reads it without claiming again
    await background(
      extractDocument(port, what.documentId, cfg)
        .then((r) => console.log(JSON.stringify({ fn: 'records-extract', mode: 'one', document_id: r.document_id, status: r.status, error: r.error ?? null, pages: r.pages ?? 0, rows: r.rows ?? {} })))
        .catch(() => console.error('records-extract failed'))
    )
    return json({ ok: true, status: 'reading', pages }, 202, cors)
  } catch {
    return json({ ok: false, error: 'server_error' }, 500, cors)
  }
})
