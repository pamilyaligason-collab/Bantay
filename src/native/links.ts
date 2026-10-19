import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

// Maps and Play Store links belong to their own apps, not the in-app browser.
const NATIVE_APP_HOSTS = /^(maps\.google\.com|maps\.app\.goo\.gl|play\.google\.com)$/
const isMapsOrStore = (u: URL) => NATIVE_APP_HOSTS.test(u.hostname) || (/^(www\.)?google\.com$/.test(u.hostname) && u.pathname.startsWith('/maps'))

/** True for an http(s) link to a different origin than `origin` that should open in the in-app browser. tel:, mailto:, sms:, geo:, market:, hash, same-origin, Google Maps and Play Store links are false. */
export function isExternal(href: string | null | undefined, origin: string): boolean {
  if (!href) return false
  try {
    const u = new URL(href, origin)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== origin && !isMapsOrStore(u)
  } catch { return false }
}

// Native shell only: open outside links in the in-app browser instead of leaving Bantay. On web nothing is added.
if (Capacitor.isNativePlatform()) {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a')
    const href = a?.getAttribute('href')
    if (!a || !href || !isExternal(href, location.origin)) return
    e.preventDefault()
    void Browser.open({ url: new URL(href, location.origin).href })
  }, true)
}
