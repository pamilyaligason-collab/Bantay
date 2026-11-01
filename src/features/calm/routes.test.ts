import { describe, expect, it } from 'vitest'
import { hasOwnHeader, parseHash } from '../shell/routes'
describe('#calm', () => {
  it('is a Today view', () => expect(parseHash('#calm')).toEqual({ tab: 'today', view: 'calm' }))
  it('draws its own header (TopBar and JackFab off)', () => expect(hasOwnHeader('#calm')).toBe(true))
  it('does not swallow neighbours', () => { expect(parseHash('#calmx')).toEqual({ tab: 'today', view: null }); expect(hasOwnHeader('#today')).toBe(false) })
})
