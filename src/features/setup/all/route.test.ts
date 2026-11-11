import { describe, expect, it } from 'vitest'
import { canonicalHash, hasOwnHeader, parseHash } from '../../shell/routes'

describe('#setup/all route', () => {
  it('is a full view with no active tab, drawing its own header', () => {
    expect(parseHash('#setup/all')).toEqual({ tab: null, view: 'setup' })
    expect(canonicalHash('#setup/all')).toBe('#setup/all')
    expect(hasOwnHeader('#setup/all')).toBe(true)
  })
})
