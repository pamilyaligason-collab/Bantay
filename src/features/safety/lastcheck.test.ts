import { describe, expect, it } from 'vitest'
import { lastCheck, type Alert } from './alerts'

describe('lastCheck', () => {
  const row = { checkedAt: '2026-11-01T08:00:00Z' } as Alert
  it('takes the later of the saved pull time and the newest row', () => {
    expect(lastCheck([row], '2026-11-01T09:00:00Z')).toBe('2026-11-01T09:00:00Z')
    expect(lastCheck([row], '2026-11-01T07:00:00Z')).toBe('2026-11-01T08:00:00Z')
    expect(lastCheck([], '2026-11-01T09:00:00Z')).toBe('2026-11-01T09:00:00Z')
    expect(lastCheck([], null)).toBeNull()
    expect(lastCheck([], ['not a string'])).toBeNull()
  })
})
