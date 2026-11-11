import { describe, expect, it } from 'vitest'
import '../../../../public/get/detect.js' // plain ES5 file the /get page loads; it hangs BantayGet on the global

type Get = {
  platform(ua: string, touch: number, o?: { standalone?: boolean; native?: boolean }): string
  inAppBrowser(ua: string): boolean
  apkUrl(l: unknown): string
  intentUrl(apk: string): string
}
const G = (globalThis as unknown as { BantayGet: Get }).BantayGet

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141 Safari/537.36'
const APK = 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.9.0/bantay-2.9.0.apk'

describe('/get platform', () => {
  it('tells the phones and the computer apart', () => {
    expect(G.platform(ANDROID, 5)).toBe('android')
    expect(G.platform(IPHONE, 5)).toBe('ios')
    expect(G.platform(MAC, 5)).toBe('ios') // iPadOS Safari sends a Mac user agent with touch points
    expect(G.platform(MAC, 0)).toBe('desktop') // a real Mac has none
    expect(G.platform(WIN, 0)).toBe('desktop')
  })
  it('inside the app or the installed web app wins over the phone kind', () => {
    expect(G.platform(ANDROID, 5, { native: true })).toBe('app')
    expect(G.platform(IPHONE, 5, { standalone: true })).toBe('app')
    expect(G.platform(WIN, 0, { standalone: false, native: false })).toBe('desktop')
  })
  it('names the browsers that cannot hand off to the app', () => {
    expect(G.inAppBrowser('Mozilla/5.0 (Linux; Android 15) Chrome/141 Mobile [FBAN/Messenger;FBAV/480.0]')).toBe(true)
    expect(G.inAppBrowser(ANDROID)).toBe(false)
  })
})

describe('/get intent link', () => {
  it('builds the exact Chrome intent with the encoded fallback', () => {
    expect(G.intentUrl(APK)).toBe(
      'intent://setup#Intent;scheme=ph.bantay.family;package=ph.bantay.family;S.browser_fallback_url=https%3A%2F%2Fgithub.com%2Fpamilyaligason-collab%2FBantay%2Freleases%2Fdownload%2Fv2.9.0%2Fbantay-2.9.0.apk;end'
    )
  })
  it('falls back to the latest-release file unless latest.json names the family release file', () => {
    expect(G.apkUrl({ url: APK })).toBe(APK)
    const LATEST = 'https://github.com/pamilyaligason-collab/Bantay/releases/latest/download/bantay.apk'
    expect(G.apkUrl({ url: 'https://evil.test/bantay.apk' })).toBe(LATEST)
    expect(G.apkUrl({ url: 'x' })).toBe(LATEST)
    expect(G.apkUrl(null)).toBe(LATEST)
    expect(G.apkUrl({})).toBe(LATEST)
  })
})
