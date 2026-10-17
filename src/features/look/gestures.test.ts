import { describe, expect, it } from 'vitest'
import { damp, PULL_THRESHOLD, swipeDir } from './gestures'

describe('swipeDir', () => {
  it('needs distance and a mostly horizontal path', () => {
    expect(swipeDir(-80, 10)).toBe('left')
    expect(swipeDir(80, 10)).toBe('right')
    expect(swipeDir(30, 0)).toBeNull()
    expect(swipeDir(80, 70)).toBeNull()
  })
})

describe('damp', () => {
  it('rubber-bands and caps the pull', () => {
    expect(damp(100)).toBe(50)
    expect(damp(10_000)).toBe(PULL_THRESHOLD * 1.5)
  })
})
