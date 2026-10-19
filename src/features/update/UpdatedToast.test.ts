import { describe, expect, it } from 'vitest'
import { canReloadNow } from './UpdatedToast'

describe('canReloadNow', () => {
  it('reloads when idle or hidden, never while typing in view or in the SOS flow', () => {
    expect(canReloadNow({ hidden: false, typing: false, inSos: false })).toBe(true)
    expect(canReloadNow({ hidden: true, typing: true, inSos: false })).toBe(true)
    expect(canReloadNow({ hidden: false, typing: true, inSos: false })).toBe(false)
    expect(canReloadNow({ hidden: true, typing: false, inSos: true })).toBe(false)
  })
})
