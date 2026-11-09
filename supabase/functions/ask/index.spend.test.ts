// @vitest-environment node
// index.ts spend wiring (makePort -> assistant_spend_get / assistant_spend_add), no network: Deno.serve, supabase-js and fetch are stubbed.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpcCalls: [] as [string, unknown][], getResult: { data: 0 as unknown, error: null as unknown }, addResult: { data: null as unknown, error: null as unknown } }))

vi.mock('npm:@supabase/supabase-js@2.118.0', () => {
  const rows = { data: [], error: null }
  const chain: unknown = new Proxy(() => chain, { get: (_t, k) => (k === 'then' ? (r: (v: unknown) => unknown) => r(rows) : k === 'maybeSingle' ? async () => ({ data: { id: 'p1' }, error: null }) : chain), apply: () => chain })
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      rpc: async (fn: string, args?: unknown) => {
        h.rpcCalls.push([fn, args])
        return fn === 'assistant_take' ? { data: [{ allowed: true }], error: null } : fn === 'assistant_spend_get' ? h.getResult : fn === 'assistant_spend_add' ? h.addResult : rows
      },
      from: () => chain
    })
  }
})

const secrets: Record<string, string | undefined> = { OPENROUTER_CHAT_KEY: 'test', SUPABASE_URL: 'http://stub.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' }
let handler: ((r: Request) => Promise<Response>) | null = null
let sent: { model: string }[] = []
let errors: string[] = []
const ask = () => handler!(new Request('http://stub.test/ask', { method: 'POST', body: JSON.stringify({ screen: 'health', messages: [{ role: 'user', content: 'should I eat more fruit for my sugar' }] }) }))
const reset = (get: { data: unknown; error: unknown }, add: { data: unknown; error: unknown } = { data: null, error: null }) => { h.rpcCalls.length = 0; sent = []; errors = []; h.getResult = get; h.addResult = add }

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (k: string) => secrets[k] }, serve: (fn: typeof handler) => { handler = fn } })
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ choices: [{ message: { content: 'Fruit is fine in small amounts.' } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0042 } })) }))
  vi.spyOn(console, 'error').mockImplementation((m: string) => { errors.push(String(m)) })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await import('./index.ts')
})
afterAll(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('index.ts spend wiring', () => {
  it('reads the month spend as a number: 0 routes strong, 8 of the 10 cap routes fast', async () => {
    reset({ data: 0, error: null })
    expect((await ask()).status).toBe(200)
    expect(sent[0]!.model).toBe('anthropic/claude-sonnet-5.5')
    reset({ data: '8', error: null })
    await ask()
    expect(sent[0]!.model).toBe('anthropic/claude-haiku-5.5')
  })
  it('null or error spend is cheap (fast), and an error logs only a fixed field', async () => {
    reset({ data: null, error: null })
    await ask()
    expect(sent[0]!.model).toBe('anthropic/claude-haiku-5.5')
    expect(errors).toEqual([])
    reset({ data: null, error: { message: 'secret detail 12345' } })
    expect((await ask()).status).toBe(200)
    expect(sent[0]!.model).toBe('anthropic/claude-haiku-5.5')
    expect(errors).toEqual(['{"fn":"ask","spend_get_failed":true}'])
  })
  it('adds the real cost with assistant_spend_add', async () => {
    reset({ data: 0, error: null })
    await ask()
    expect(h.rpcCalls.filter(([f]) => f === 'assistant_spend_add')).toEqual([['assistant_spend_add', { p_usd: 0.0042 }]])
  })
  it('a failed add logs spend_add_failed with no error text and the answer still comes', async () => {
    reset({ data: 0, error: null }, { data: null, error: { message: 'secret detail 98765' } })
    expect((await ask()).status).toBe(200)
    expect(errors).toEqual(['{"fn":"ask","spend_add_failed":true}'])
  })
  it('without the service role key: no spend rpc, fast model only', async () => {
    const key = secrets.SUPABASE_SERVICE_ROLE_KEY
    secrets.SUPABASE_SERVICE_ROLE_KEY = undefined
    try {
      reset({ data: 0, error: null })
      expect((await ask()).status).toBe(200)
      expect(h.rpcCalls.filter(([f]) => f.startsWith('assistant_spend'))).toEqual([])
      expect(sent[0]!.model).toBe('anthropic/claude-haiku-5.5')
    } finally {
      secrets.SUPABASE_SERVICE_ROLE_KEY = key
    }
  })
})
