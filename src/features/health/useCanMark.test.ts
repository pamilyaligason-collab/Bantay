import { describe, expect, it } from 'vitest'
import { canMarkFor } from './useCanMark'

describe('canMarkFor', () => {
  it('own person can mark', () => expect(canMarkFor('p1', 'p1', [])).toBe(true))
  it('a can_write carer can mark', () => expect(canMarkFor('p2', 'p1', ['p2'])).toBe(true))
  it('someone else without a writable carer link cannot (admin role is irrelevant)', () => expect(canMarkFor('p3', 'p1', ['p2'])).toBe(false))
  it('no person chosen cannot mark', () => expect(canMarkFor('', '', [])).toBe(false))
})
