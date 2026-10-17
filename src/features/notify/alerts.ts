import { db, enqueue } from '../../db'
import { track } from '../admin/events'

export const REASK_MS = 3 * 86_400_000
/** One key for "when did we last bother the user about alerts": onboarding denial, iOS skip and the banner all use it. */
export const ASK_KEY = 'alerts.lastAsk'

export const isIosNeedsInstall = (ua: string, standalone: boolean, maxTouchPoints = 0) =>
  (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) && !standalone // iPadOS 13+ reports a Mac UA

export const reAskDue = (lastShown: number | undefined, now: number) => lastShown === undefined || now - lastShown >= REASK_MS

export function urlB64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export const vapidKey = (): string | undefined => import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined

export const kvGet = async <T,>(key: string) => (await db.kv.get(key))?.value as T | undefined
export const kvSet = (key: string, value: unknown) => db.kv.put({ key, value })
export const markAsked = () => kvSet(ASK_KEY, Date.now())

/** Reuse the browser's subscription or create one, then save it locally and queue an upsert when it is new.
 *  Safe to call on every launch. Also used by the service worker on pushsubscriptionchange. */
export async function subscribeAndSave(reg: { pushManager: PushManager }, key: string): Promise<boolean> {
  try {
    const sub = (
      (await reg.pushManager.getSubscription?.()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) }))
    ).toJSON()
    if ((await kvGet<{ endpoint?: string }>('push.sub'))?.endpoint !== sub.endpoint) {
      await kvSet('push.sub', sub)
      await enqueue('push_subscriptions', 'upsert', sub)
    }
    return true
  } catch {
    return false // push service unreachable; the next launch retries
  }
}

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
