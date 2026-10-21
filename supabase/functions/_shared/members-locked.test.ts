// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { lockState } from './members.ts'

const NOW = Date.parse('2026-10-21T10:00:00Z')

describe('lockState', () => {
  it('no row: not locked, 0 tries', () => expect(lockState(undefined, NOW)).toEqual({ lockedUntil: null, fails: 0 }))
  it('future lock: ISO time and the count', () => expect(lockState({ fails: 5, locked_until: '2026-10-21T10:15:00+00:00' }, NOW)).toEqual({ lockedUntil: '2026-10-21T10:15:00.000Z', fails: 5 }))
  it('lapsed window: null and 0, the stale count is not shown', () => expect(lockState({ fails: 4, locked_until: '2026-10-21T09:00:00Z' }, NOW)).toEqual({ lockedUntil: null, fails: 0 }))
  it('null columns and null fails never become NaN', () => {
    expect(lockState({ fails: null, locked_until: null }, NOW)).toEqual({ lockedUntil: null, fails: 0 })
    expect(lockState({ fails: null, locked_until: '2026-10-21T11:00:00Z' }, NOW).fails).toBe(0)
  })
})
