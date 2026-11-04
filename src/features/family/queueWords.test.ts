import { describe, expect, it } from 'vitest'
import { queueKicker, queueWords } from './queueWords'

describe('queueWords', () => {
  it('names both numbers', () => {
    const q = { count: 12, byPerson: { me: 2 } }
    expect(queueWords(q, 'me')).toBe('12 to confirm · 2 yours')
    expect(queueKicker(q)).toBe('12 in the family')
  })
  it('says nothing waiting when empty', () => expect(queueWords({ count: 0, byPerson: {} }, 'me')).toBe('Nothing waiting'))
})
