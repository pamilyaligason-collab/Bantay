import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../auth/client', () => ({ supabase: { rpc: h.rpc } }))
import { exportMyData, requestErasure } from './data'

beforeEach(() => h.rpc.mockReset())

describe('request_erasure errors', () => {
  it('the owner refused by the server is told the real reason, not a network problem', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'hand over ownership first' } })
    expect(await requestErasure()).toEqual({ ok: false, error: 'As the family owner you cannot delete your account until you hand over ownership.' })
  })
  it('any other failure still reads as no signal', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not allowed' } })
    expect(((await requestErasure()) as { error: string }).error).toMatch(/^Could not reach the server/)
    h.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    expect(((await requestErasure()) as { error: string }).error).toMatch(/^Could not reach the server/)
  })
  it('the same words from another call are not mistaken for the owner refusal', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'hand over ownership first' } })
    expect(((await exportMyData()) as { error: string }).error).toMatch(/^Could not reach the server/)
  })
  it('a good answer passes through', async () => {
    h.rpc.mockResolvedValue({ data: '2026-11-12T00:00:00Z', error: null })
    expect(await requestErasure()).toEqual({ ok: true, value: '2026-11-12T00:00:00Z' })
  })
})
