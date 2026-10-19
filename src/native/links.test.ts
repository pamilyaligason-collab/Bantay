import { describe, it, expect } from 'vitest'
import { isExternal } from './links'

const O = 'https://bantay.pages.dev'
describe('isExternal', () => {
  it('flags other-origin http(s)', () => {
    expect(isExternal('https://example.com/x', O)).toBe(true)
    expect(isExternal('http://example.com', O)).toBe(true)
  })
  it('lets Google Maps and Play Store links go to their own apps', () => {
    for (const h of ['https://www.google.com/maps/dir/?api=1&destination=1,2', 'https://google.com/maps?q=x', 'https://maps.google.com/?q=1,2', 'https://maps.app.goo.gl/abc', 'https://play.google.com/store/apps/details?id=x'])
      expect(isExternal(h, O)).toBe(false)
    expect(isExternal('https://www.google.com/search?q=maps', O)).toBe(true)
  })
  it('leaves same-origin, hash, relative and other schemes alone', () => {
    for (const h of ['https://bantay.pages.dev/a', '#docs', '/safety', 'tel:+63917', 'mailto:a@b.c', 'sms:123', 'geo:1,2', 'market://details?id=x', '', null, undefined])
      expect(isExternal(h, O)).toBe(false)
  })
})
