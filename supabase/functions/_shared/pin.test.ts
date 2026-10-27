// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hashResetSecret, resetCode, resetSecret, safeEqual } from './pin.ts'

describe('reset helpers', () => {
  it('code is always 4 digits and not constant', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) { const c = resetCode(); expect(c).toMatch(/^\d{4}$/); seen.add(c) }
    expect(seen.size).toBeGreaterThan(100)
  })
  it('secret is 16 random bytes in base64url (22 chars) and differs each time', () => {
    const a = resetSecret(), b = resetSecret()
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(a).not.toBe(b)
  })
  it('hash is 64 hex chars, bound to the request id and the pepper', async () => {
    const h = await hashResetSecret('p'.repeat(32), 'id1', 's')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toBe(await hashResetSecret('p'.repeat(32), 'id2', 's'))
    expect(h).not.toBe(await hashResetSecret('q'.repeat(32), 'id1', 's'))
  })
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'ab')).toBe(false)
  })
})
