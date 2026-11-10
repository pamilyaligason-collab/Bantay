import { afterEach, describe, expect, it, vi } from 'vitest'
import { wxFlag } from './flags'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('wxFlag', () => {
  it('is on by default (no key, or an old "1") and off only when the key is "0"', () => {
    expect(wxFlag('blend')).toBe(true)
    localStorage.setItem('bantay.flag.wx.blend', '1')
    expect(wxFlag('blend')).toBe(true)
    localStorage.setItem('bantay.flag.wx.blend', '0')
    expect(wxFlag('blend')).toBe(false)
  })
  it('is on when localStorage throws (the default)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(wxFlag('blend')).toBe(true)
  })
})
