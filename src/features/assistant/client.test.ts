import { describe, expect, it, vi } from 'vitest'
import { ask } from './client'

const res = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('ask', () => {
  it('maps 429 to limit and 503 to the generic failure', async () => {
    expect(await ask([], 'today', 'https://x.test', res(429))).toEqual({ error: 'limit' })
    expect(await ask([], 'today', 'https://x.test', res(503, { error: 'unavailable' }))).toEqual({ error: 'failed' })
  })
})
