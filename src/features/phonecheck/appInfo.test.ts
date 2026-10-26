import { describe, expect, it } from 'vitest'
import { manilaDay, versionAtLeast } from './appInfo'

describe('versionAtLeast', () => {
  it('compares x.y.z numerically', () => {
    expect(versionAtLeast('2.3.0', '2.3.0')).toBe(true)
    expect(versionAtLeast('2.3.1', '2.3.0')).toBe(true)
    expect(versionAtLeast('2.10.0', '2.3.0')).toBe(true) // not a string compare
    expect(versionAtLeast('3.0.0', '2.9.9')).toBe(true)
    expect(versionAtLeast('2.2.9', '2.3.0')).toBe(false)
    expect(versionAtLeast('1.9.9', '2.0.0')).toBe(false)
  })
  it('unknown or malformed is never "new enough"', () => {
    expect(versionAtLeast(null, '2.3.0')).toBe(false)
    expect(versionAtLeast(undefined, '2.3.0')).toBe(false)
    expect(versionAtLeast('dev', '2.3.0')).toBe(false)
    expect(versionAtLeast('', '2.3.0')).toBe(false)
  })
})

describe('manilaDay', () => {
  it('is the calendar day at UTC+8', () => {
    expect(manilaDay(new Date('2026-10-20T15:59:59Z'))).toBe('2026-10-20')
    expect(manilaDay(new Date('2026-10-20T16:00:00Z'))).toBe('2026-10-21') // midnight in Manila
  })
})
