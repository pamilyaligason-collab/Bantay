import { describe, expect, it } from 'vitest'
import { makeLimiter } from './celebrate'

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
