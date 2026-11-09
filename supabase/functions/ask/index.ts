// Ask (Jack): the assistant chat, replacing the n8n webhook on the Alfred VPS. Contract and rollout: docs/ASSISTANT.md.
// Deploy with --no-verify-jwt: the JWT is checked here (auth.getUser), the same way records-extract does it.
// Function secrets (set by Lloyd): OPENROUTER_CHAT_KEY (NOT OPENROUTER_API_KEY, which is the scan key), ALLOWED_ORIGIN;
// optional OPENROUTER_FAST_MODEL (default anthropic/claude-haiku-5.5; OPENROUTER_CHAT_MODEL still works as its old name), OPENROUTER_STRONG_MODEL (default anthropic/claude-sonnet-5.5),
// OPENROUTER_CHAT_FALLBACK (default google/gemini-3.5-flash-lite), ASSISTANT_MONTHLY_CAP_USD (default 10; the router steps down at 70% and 90% of it, router.ts).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform. Every read of the person's data runs as the caller;
// the service role is used only for the monthly spend counter (assistant_spend, migration 0062). Without it the router uses the fast model only.
// B-7: the log line holds counts, latency, model id and cost. Never a message, a reply, a record value, a name or a snippet.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders, json } from '../_shared/http.ts'
import { assembleOwn, makeMedline, medsQuery, type Reader } from './context.ts'
import { DEFAULT_CAP_USD, DEFAULT_FALLBACK, DEFAULT_MODEL, DEFAULT_STRONG, handleAsk, parseCompletion, type Knowledge, type Port } from './logic.ts'

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }

const env = (k: string) => Deno.env.get(k) ?? ''
const medline = makeMedline(fetch)

function makePort(req: Request, key: string): Port {
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: req.headers.get('authorization') ?? '' } } })
  const reader: Reader = {
    async person() {
      const { data: u } = await sb.auth.getUser()
      if (!u.user) return null
      const { data } = await sb.from('people').select('id').eq('auth_user_id', u.user.id).maybeSingle()
      return (data as { id: string } | null)?.id ?? null
    },
    async meds(pid) {
      const { data, error } = await medsQuery(sb, pid)
      if (error) throw new Error('read')
      return data ?? []
    },
    async labs(pid) {
      const { data, error } = await sb.from('lab_results').select('test_code,name_raw,value_num,value_text,unit_raw,flag,ref_low,ref_high,collected_at').eq('person_id', pid).eq('status', 'confirmed').order('collected_at', { ascending: false, nullsFirst: false }).limit(30)
      if (error) throw new Error('read')
      return data ?? []
    },
    async catalog() {
      const { data, error } = await sb.from('test_catalog').select('code,name,loinc,aliases')
      if (error) throw new Error('read')
      return data ?? []
    },
    async allergies(pid) {
      const { data, error } = await sb.from('allergies').select('substance').eq('person_id', pid).eq('status', 'confirmed').limit(10)
      if (error) throw new Error('read')
      return (data ?? []).map((r: { substance: string }) => r.substance).filter((s: string) => s && s !== 'none')
    }
  }
  const url = env('SUPABASE_URL')
  const admin = env('SUPABASE_SERVICE_ROLE_KEY') ? createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } }) : null
  return {
    async spendUsd() {
      if (!admin) return null
      const { data, error } = await admin.rpc('assistant_spend_get')
      const n = Number(data)
      if (error) console.error(JSON.stringify({ fn: 'ask', spend_get_failed: true })) // fixed field only, never the error text (B-7)
      return error || data === null || !Number.isFinite(n) ? null : n
    },
    async addSpend(usd) {
      if (!admin) return
      const { error } = await admin.rpc('assistant_spend_add', { p_usd: usd })
      if (error) console.error(JSON.stringify({ fn: 'ask', spend_add_failed: true }))
    },
    async user() { const { data } = await sb.auth.getUser(); return data.user?.id ?? null },
    async takeSlot(limit) {
      const { data, error } = await sb.rpc('assistant_take', { p_limit: limit })
      if (error) return null
      const row = (Array.isArray(data) ? data[0] : data) as { allowed?: unknown } | null
      return typeof row?.allowed === 'boolean' ? row.allowed : null
    },
    async knowledge(q) {
      const { data, error } = await sb.rpc('search_knowledge', { q, max_rows: 3 })
      return error ? [] : ((data ?? []) as Knowledge[])
    },
    own: (q) => assembleOwn(reader, q),
    medline,
    async chat(model, body, timeoutMs) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (!res.ok) throw Object.assign(new Error('http'), { status: res.status })
      return parseCompletion(await res.json())
    },
    now: () => Date.now()
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(Deno.env.get('ALLOWED_ORIGIN'), req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'bad_input' }, 405, cors)

  const key = env('OPENROUTER_CHAT_KEY').trim() // a pasted key often carries a space or line break
  const model = env('OPENROUTER_FAST_MODEL') || env('OPENROUTER_CHAT_MODEL') || DEFAULT_MODEL
  const strong = env('OPENROUTER_STRONG_MODEL') || DEFAULT_STRONG
  const fallback = env('OPENROUTER_CHAT_FALLBACK') || DEFAULT_FALLBACK
  const capUsd = Number(env('ASSISTANT_MONTHLY_CAP_USD')) > 0 ? Number(env('ASSISTANT_MONTHLY_CAP_USD')) : DEFAULT_CAP_USD
  if (!key || [model, strong, fallback].some((m) => /:free$/i.test(m))) return json({ error: 'unavailable' }, 503, cors)

  try {
    const out = await handleAsk(makePort(req, key), { model, strong, fallback, capUsd }, await req.text())
    const m = out.meta
    console.log(JSON.stringify({ fn: 'ask', status: m.status, emergency: m.emergency ?? null, lang: m.lang ?? null, model: m.model ?? null, tier: m.tier ?? null, fallback: m.fallback ?? false, ms: m.latencyMs ?? null, hits: m.hits ?? 0, tokens_in: m.usage?.tokensIn ?? null, tokens_out: m.usage?.tokensOut ?? null, cost: m.usage?.cost ?? null }))
    // Proves the gate path never reached a model (scripts/jack-gate-live.mjs). meta.model is set only after a model call.
    return json(out.body, out.status, { ...cors, 'x-bantay-model-called': m.model ? '1' : '0', 'Access-Control-Expose-Headers': 'x-bantay-model-called' })
  } catch {
    console.error('ask failed')
    return json({ error: 'unavailable' }, 503, cors)
  }
})
