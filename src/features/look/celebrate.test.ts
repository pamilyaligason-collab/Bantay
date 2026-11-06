import { describe, expect, it, vi } from 'vitest'
import { celebrate, makeLimiter } from './celebrate'

describe('rate limiter', () => {
  it('allows once per gap per kind', () => {
    let t = 0
    const allow = makeLimiter(600_000, () => t)
    expect(allow('goal')).toBe(true)
    expect(allow('goal')).toBe(false)
    expect(allow('streak')).toBe(true)
    t = 599_999
    expect(allow('goal')).toBe(false)
    t = 600_000
    expect(allow('goal')).toBe(true)
  })
})

describe('celebrate', () => {
  it('under reduced motion nothing fires', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    try { expect(celebrate('allDone')).toBe(false) } finally { vi.unstubAllGlobals() }
  })
})
