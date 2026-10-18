import { describe, it, expect } from 'vitest'
import { isExternal } from './links'

const O = 'https://bantay.pages.dev'
describe('isExternal', () => {
  it('flags other-origin http(s)', () => {
    expect(isExternal('https://example.com/x', O)).toBe(true)
    expect(isExternal('http://example.com', O)).toBe(true)
  })
  it('leaves same-origin, hash, relative and other schemes alone', () => {
    for (const h of ['https://bantay.pages.dev/a', '#docs', '/safety', 'tel:+63917', 'mailto:a@b.c', 'sms:123', 'geo:1,2', 'market://details?id=x', '', null, undefined])
      expect(isExternal(h, O)).toBe(false)
  })
})
