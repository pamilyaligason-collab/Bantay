import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const tok = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('../auth/session', () => ({ getAccessToken: async () => tok.value }))

import { ask, assistantUrl } from './client'

const res = (status: number, body: unknown = {}) => vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>

describe('ask', () => {
  beforeEach(async () => { tok.value = null; await db.kv.clear() })
  it('maps 429 to limit and 503 to the generic failure', async () => {
    expect(await ask([], 'today', 'https://x.test', res(429))).toEqual({ error: 'limit' })
    expect(await ask([], 'today', 'https://x.test', res(503, { error: 'unavailable' }))).toEqual({ error: 'failed' })
  })
  it('sends the session access token as a Bearer header, and none when signed out', async () => {
    tok.value = 'jwt-1'
    const f = res(429)
    await ask([], 'today', 'https://x.test', f)
    expect((f.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer jwt-1' })
    tok.value = null
    const g = res(429)
    await ask([], 'today', 'https://x.test', g)
    expect((g.mock.calls[0]![1] as RequestInit).headers).not.toHaveProperty('Authorization')
  })
  it('privacy.ai off: no request is made at all (not even the token read), and the result is off', async () => {
    await db.kv.put({ key: 'privacy.ai', value: false })
    tok.value = 'jwt-1'
    const f = res(200, { text: 'hi', cards: [] })
    expect(await ask([{ role: 'user', content: 'hello' }], 'today', 'https://x.test', f)).toEqual({ error: 'off' })
    expect(f).not.toHaveBeenCalled()
    await db.kv.put({ key: 'privacy.ai', value: true })
    await ask([], 'today', 'https://x.test', f)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('picks the provider from VITE_ASSISTANT_PROVIDER, n8n by default', () => {
    const env = { VITE_ASSISTANT_URL: 'https://n8n.test/hook', VITE_SUPABASE_URL: 'https://x.supabase.co/' }
    expect(assistantUrl(env)).toBe('https://n8n.test/hook')
    expect(assistantUrl({ ...env, VITE_ASSISTANT_PROVIDER: 'n8n' })).toBe('https://n8n.test/hook')
    expect(assistantUrl({ ...env, VITE_ASSISTANT_PROVIDER: 'edge' })).toBe('https://x.supabase.co/functions/v1/ask')
    expect(assistantUrl({ VITE_ASSISTANT_PROVIDER: 'edge' })).toBeUndefined()
    expect(assistantUrl({})).toBeUndefined()
  })
})
