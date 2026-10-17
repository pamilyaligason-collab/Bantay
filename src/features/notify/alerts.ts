import { db, enqueue } from '../../db'

export const REASK_MS = 3 * 86_400_000

export const isIosNeedsInstall = (ua: string, standalone: boolean) => /iPad|iPhone|iPod/.test(ua) && !standalone

export const reAskDue = (lastShown: number | undefined, now: number) => lastShown === undefined || now - lastShown >= REASK_MS

export function urlB64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export const vapidKey = (): string | undefined => import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined

export const kvGet = async <T,>(key: string) => (await db.kv.get(key))?.value as T | undefined
export const kvSet = (key: string, value: unknown) => db.kv.put({ key, value })

/** Call from ONE user tap. Asks permission, then subscribes to push when a VAPID public key is configured.
 *  The subscription is saved locally and queued for sync (outbox upsert). */
export async function enableAlerts(key = vapidKey()): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  const perm = await Notification.requestPermission()
  await kvSet('alerts.lastAsk', Date.now())
  if (perm !== 'granted') return 'denied'
  if (key && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) })).toJSON()
      await kvSet('push.sub', sub)
      await enqueue('push_subscriptions', 'upsert', sub)
    } catch {
      // Permission is on but the push service is unreachable; the banner/next launch can retry.
    }
  }
  return 'granted'
}
