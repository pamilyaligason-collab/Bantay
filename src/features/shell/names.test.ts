import { describe, expect, it } from 'vitest'
import { firstName } from './names'

describe('firstName', () => {
  it('capitalises the first word', () => { expect(firstName('  maria santos')).toBe('Maria'); expect(firstName('REY')).toBe('REY') })
  it('is empty for nothing', () => { expect(firstName('')).toBe(''); expect(firstName('   ')).toBe('') })
})
