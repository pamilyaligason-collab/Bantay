import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ select: vi.fn() }))
vi.mock('../../auth/client', () => ({ supabase: { from: () => ({ select: (c: string) => ({ order: () => h.select(c) }) }) } }))

import { loadPeople } from './people'

const ROW = { id: 'p1', display_name: 'Rey Villar', auth_user_id: null, photo_path: null }

describe('loadPeople', () => {
  beforeEach(() => { h.select.mockReset() })

  it('reads kind when the server has it', async () => {
    h.select.mockResolvedValue({ data: [{ ...ROW, kind: 'shared' }], error: null })
    expect(await loadPeople()).toEqual([{ ...ROW, kind: 'shared' }])
    expect(h.select).toHaveBeenCalledTimes(1)
    expect(h.select.mock.calls[0]![0]).toContain('kind')
  })
  it('before 0046 falls back to the list without kind', async () => {
    h.select.mockImplementation(async (c: string) => (c.includes('kind') ? { data: null, error: { code: '42703' } } : { data: [ROW], error: null }))
    expect(await loadPeople()).toEqual([ROW])
    expect(h.select).toHaveBeenCalledTimes(2)
    expect(h.select.mock.calls[1]![0]).toContain('archived_at')
  })
  it('throws when every read fails', async () => {
    h.select.mockResolvedValue({ data: null, error: { code: 'x' } })
    await expect(loadPeople()).rejects.toThrow('not_connected')
    expect(h.select).toHaveBeenCalledTimes(3)
  })
})
