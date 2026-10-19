import { track } from '../admin/events'
import { kvSet, subscribeAndSave, vapidKey } from './subscribe'

export { kvGet, kvSet, subscribeAndSave, urlB64ToBytes, vapidKey } from './subscribe'

export const REASK_MS = 3 * 86_400_000
/** One key for "when did we last bother the user about alerts": onboarding denial, iOS skip and the banner all use it. */
export const ASK_KEY = 'alerts.lastAsk'

export const isIosNeedsInstall = (ua: string, standalone: boolean, maxTouchPoints = 0) =>
  (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) && !standalone // iPadOS 13+ reports a Mac UA

export const reAskDue = (lastShown: number | undefined, now: number) => lastShown === undefined || now - lastShown >= REASK_MS

export const markAsked = () => kvSet(ASK_KEY, Date.now())

/** If permission is granted and a VAPID key is configured, make sure a subscription exists. */
export async function ensureSubscribed(key = vapidKey()): Promise<boolean> {
  if (!key || typeof Notification === 'undefined' || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return false
  return subscribeAndSave(await navigator.serviceWorker.ready, key)
}

/** Call from ONE user tap. Asks permission, then subscribes when a VAPID public key is configured. */
export async function enableAlerts(key = vapidKey()): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  const perm = await Notification.requestPermission()
  await markAsked()
  void track('action', perm === 'granted' ? 'alerts_on' : 'alerts_off')
  if (perm !== 'granted') return 'denied'
  if (key && 'serviceWorker' in navigator) await subscribeAndSave(await navigator.serviceWorker.ready, key)
  return 'granted'
}
