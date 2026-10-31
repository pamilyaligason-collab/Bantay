import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { ackStamp, ackWarning, isAcked } from './warnAck'

const A = { id: 'q1', kind: 'quake', level: 'Magnitude 5.1', issuedAt: '2026-10-30T01:00:00Z' } as Alert

describe('warnAck', () => {
  it('stamps issuedAt, level and kind', () => expect(ackStamp(A)).toBe('2026-10-30T01:00:00Z|Magnitude 5.1|quake'))
  it('a closed warning is acked until it is reissued or its level changes', () => {
    const m = ackWarning({}, A, [A])
    expect(isAcked(m, A)).toBe(true)
    expect(isAcked(m, { ...A, level: 'Magnitude 6.0' })).toBe(false)
    expect(isAcked(m, { ...A, issuedAt: '2026-10-30T03:00:00Z' })).toBe(false)
    expect(isAcked(null, A)).toBe(false)
  })
  it('a missing level stamps as empty, so a later level re-shows', () => {
    const b = { ...A, level: null }
    expect(ackStamp(b)).toBe('2026-10-30T01:00:00Z||quake')
    expect(isAcked(ackWarning({}, b, [b]), { ...b, level: 'Signal No. 2' })).toBe(false)
  })
  it('trims to live ids and ignores junk values', () => {
    const m = ackWarning({ old: 'x', q1: 'old', bad: 5 as unknown as string }, A, [A])
    expect(Object.keys(m)).toEqual(['q1'])
    expect(ackWarning({ keep: 'k' }, A, [A, { id: 'keep' }])).toEqual({ keep: 'k', q1: ackStamp(A) })
  })
})
