import { describe, expect, it } from 'vitest'
import { setupSteps } from './setupRow'

describe('setupSteps', () => {
  it('each pending step carries its own route; the first one is the row link', () => {
    expect(setupSteps(['about', 'warnings'])).toEqual([{ label: 'About me', href: '#me/about' }, { label: 'Phone warnings', href: '#me/phone' }])
    expect(setupSteps(['sos'])[0]!.href).toBe('#me/family')
    expect(setupSteps([])).toEqual([])
  })
})
