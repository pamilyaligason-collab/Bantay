import { describe, expect, it } from 'vitest'
import { tempTint } from './tempTint'

describe('tempTint', () => {
  it('cool is blue, hot is red, in order', () => {
    expect(tempTint(24)).toBe('--tint-blue-ink')
    expect(tempTint(34)).toBe('--tint-red-ink')
    const all = [20, 26, 30, 32, 36].map(tempTint)
    expect(new Set(all).size).toBe(5)
  })
})
