import { afterEach, describe, expect, it, vi } from 'vitest'
import { wxFlag } from './flags'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('wxFlag', () => {
  it('is off by default and on when the key is "1"', () => {
    expect(wxFlag('blend')).toBe(false)
    localStorage.setItem('bantay.flag.wx.blend', '1')
    expect(wxFlag('blend')).toBe(true)
  })
  it('is off when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(wxFlag('blend')).toBe(false)
  })
})
