import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ carers: { data: [] as unknown[], error: null as unknown }, people: { data: [] as unknown[], error: null as unknown } }))
vi.mock('../auth/client', () => ({
  supabase: {
    from: (t: string) => ({
      select: () => (t === 'carers' ? { eq: async () => h.carers } : { in: async () => h.people })
    })
  }
}))
import { joinNames, loadViewers } from './viewers'

beforeEach(() => { h.carers = { data: [], error: null }; h.people = { data: [], error: null } })

describe('loadViewers', () => {
  it('display names of the linked carers', async () => {
    h.carers = { data: [{ carer_id: 'a' }, { carer_id: 'b' }], error: null }
    h.people = { data: [{ display_name: 'Papa' }, { display_name: 'Ate Joy' }], error: null }
    expect(await loadViewers('p0')).toEqual(['Papa', 'Ate Joy'])
  })
  it('no carers is an empty list (Only you), not unknown', async () => {
    expect(await loadViewers('p0')).toEqual([])
  })
  it('a name hidden from this phone, or any error, is unknown (null), never a shorter list', async () => {
    h.carers = { data: [{ carer_id: 'a' }, { carer_id: 'b' }], error: null }
    h.people = { data: [{ display_name: 'Papa' }], error: null }
    expect(await loadViewers('p0')).toBeNull()
    h.carers = { data: [], error: { message: 'x' } }
    expect(await loadViewers('p0')).toBeNull()
  })
})

describe('joinNames', () => {
  it('reads like a sentence', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['Papa'])).toBe('Papa')
    expect(joinNames(['Papa', 'Ate Joy'])).toBe('Papa and Ate Joy')
    expect(joinNames(['Papa', 'Ate Joy', 'Kuya Ben'])).toBe('Papa, Ate Joy and Kuya Ben')
  })
})
