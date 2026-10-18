import { describe, expect, it } from 'vitest'
import { normalizeContacts, sosDone, validPhone } from './contacts'

const fam = [{ personId: 'p1', displayName: 'Mama', handle: null, provider: 'pin' as const, initials: 'M' }]

describe('sos contacts', () => {
  it('validates phones loosely', () => {
    for (const ok of ['09171234567', '+63 917 123 4567', '0917-123-4567']) expect(validPhone(ok)).toBe(true)
    for (const bad of ['', '12345', 'abc0917123456', '+63917123456789012']) expect(validPhone(bad)).toBe(false)
  })
  it('migrates personId strings and phone strings', () => {
    expect(normalizeContacts(['p1', '09171234567'], fam)).toEqual([
      { name: 'Mama', phone: '', personId: 'p1' }, { name: 'Contact', phone: '09171234567' }])
  })
  it('keeps the new shape and caps at two', () => {
    const c = { name: 'A', phone: '09171234567' }
    expect(normalizeContacts([c, c, c], fam)).toHaveLength(2)
  })
  it('is done only with two valid phones', () => {
    const c = { name: 'A', phone: '09171234567' }
    expect(sosDone([c, c], fam)).toBe(true)
    expect(sosDone([c, { name: 'B', phone: '' }], fam)).toBe(false)
    expect(sosDone([c], fam)).toBe(false)
    expect(sosDone(['p1', 'p1'], fam)).toBe(false)
  })
})
