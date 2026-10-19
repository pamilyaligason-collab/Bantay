import { db, enqueue } from '../../db'

// Split from alerts.ts so the service worker (src/sw.ts) does not bundle admin/events -> auth/session and its dynamic imports:
// those make the SW build emit a shared chunk with a top-level `export`, and sw.js is registered as a classic script.
export function urlB64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export const vapidKey = (): string | undefined => import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined

export const kvGet = async <T,>(key: string) => (await db.kv.get(key))?.value as T | undefined
export const kvSet = (key: string, value: unknown) => db.kv.put({ key, value })
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

