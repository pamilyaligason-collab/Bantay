import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DocBundle } from './api'

const h = vi.hoisted(() => ({ cached: null as null | ((d: unknown[]) => void), server: null as null | ((r: unknown) => void) }))
vi.mock('./api', () => ({
  cachedDocs: () => new Promise((res) => { h.cached = res }),
  listConfirmedDocuments: () => new Promise((res) => { h.server = res }),
  cacheDocs: vi.fn(async () => {}),
  listConfirmedMedicines: vi.fn(), listQueue: vi.fn()
}))
import { useConfirmedDocs } from './useRecordsServer'

describe('useConfirmedDocs', () => {
  it('a slow offline copy that lands after the server answer never replaces it', async () => {
    const bundle = { doc: { id: 'd1' }, files: [] } as unknown as DocBundle
    const { result } = renderHook(() => useConfirmedDocs('me'))
    await waitFor(() => expect(h.server).toBeTruthy())
    h.server!({ ok: true, data: [bundle] })
    await waitFor(() => expect(result.current).toHaveLength(1))
    h.cached!([]) // the stale empty cache resolves last
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current).toHaveLength(1)
  })
})
