import { describe, expect, it } from 'vitest'
import { makeLimiter } from './celebrate'
import { swipeDir } from './gestures'

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

describe('swipeDir', () => {
  it('needs distance and a mostly horizontal path', () => {
    expect(swipeDir(-80, 10)).toBe('left')
    expect(swipeDir(80, 10)).toBe('right')
    expect(swipeDir(30, 0)).toBeNull()
    expect(swipeDir(80, 70)).toBeNull()
  })
})
