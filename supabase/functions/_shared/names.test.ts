// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { NAMES_LIMIT, listNames, toEntry, type NamesPort } from './names.ts'

const port = (over: Partial<NamesPort> = {}): NamesPort => ({
  pepper: 'p'.repeat(32), tryKey: async () => 1,
  listPinMembers: async () => [{ displayName: 'Lola Rosa', handle: 'lola' }, { displayName: 'ben', handle: 'ben_k' }, { displayName: '   ', handle: 'ghost' }],
  ...over
})

describe('family-names', () => {
  it('returns only first name, initial and handle, sorted', async () => {
    const r = await listNames('1.2.3.4', port())
    expect(r).toEqual({ status: 200, body: [{ first_name: 'ben', initial: '', handle: 'ben_k' }, { first_name: 'Lola', initial: 'R', handle: 'lola' }] })
    expect(Object.keys((r.body as object[])[1]!).sort()).toEqual(['first_name', 'handle', 'initial'])
  })
  it('uses the last word for the initial', () => expect(toEntry({ displayName: 'Maria de la Cruz', handle: 'mc' })?.initial).toBe('C'))
  it('limits per address and never reads members once over', async () => {
    let read = false
    const r = await listNames('1.2.3.4', port({ tryKey: async () => NAMES_LIMIT + 1, listPinMembers: async () => { read = true; return [] } }))
    expect(r).toEqual({ status: 429, body: { ok: false } })
    expect(read).toBe(false)
  })
  it('counts under a key scoped apart from login', async () => {
    const keys: string[] = []
    await listNames('9.9.9.9', port({ tryKey: async (k) => { keys.push(k); return 1 } }))
    const { limiterKey } = await import('./pin.ts')
    expect(keys).toEqual([await limiterKey('p'.repeat(32), 'ip', 'names:9.9.9.9')])
    expect(keys[0]).not.toBe(await limiterKey('p'.repeat(32), 'ip', '9.9.9.9'))
  })
})
