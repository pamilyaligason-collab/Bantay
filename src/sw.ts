/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { subscribeAndSave, vapidKey } from './features/notify/subscribe'
import { claimNudge, handlePush } from './features/notify/push'
import { initZone } from './features/time/zone'
import { iconUrl, refreshIcons } from './features/update/iconVersion'

declare let self: ServiceWorkerGlobalScope

initZone() // S30 L8: quiet hours and the nudge day follow this phone's zone, here as in the app
self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/admin/] })) // /admin is its own page (web admin), never the app shell

// D-181: offline barangay packs. Cache-first, JSON answers only (the host answers a missing file with index.html and 200), newest ~100 tiles kept.
// workbox-strategies / workbox-expiration are not direct dependencies, so this uses the Cache API. index.json and the two home tiles are fetched at install; the glob precache is vite config, left alone.
const PACKS = 'barangay-packs-v1'
const PACKS_MAX = 100
const HOME_PACKS = ['/geo/barangays/index.json', '/geo/barangays/9_123.json', '/geo/barangays/6_125.json']
const isJson = (r: Response) => r.ok && /json/i.test(r.headers.get('content-type') ?? '')
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PACKS).then(async (c) => { for (const u of HOME_PACKS) { try { const r = await fetch(u); if (isJson(r)) await c.put(u, r) } catch { /* offline at install: the runtime route fills it later */ } } }))
})
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/geo/barangays/') && url.pathname.endsWith('.json'),
  async ({ request }) => {
    const c = await caches.open(PACKS)
    // index.json is network-first so a rebuilt pack set reaches phones; tiles stay cache-first (Opus S28 release review)
    if (new URL(request.url).pathname.endsWith('/index.json')) {
      try { const r = await fetch(request); if (isJson(r)) { await c.put(request, r.clone()); return r } } catch { /* offline: the cached index below */ }
      return (await c.match(request)) ?? fetch(request)
    }
    const hit = await c.match(request)
    if (hit) return hit
    const r = await fetch(request)
    if (isJson(r)) {
      await c.put(request, r.clone())
      const keys = await c.keys()
      for (const k of keys.slice(0, Math.max(0, keys.length - PACKS_MAX))) await c.delete(k)
    }
    return r
  }
)

// S31 L2: a new icon set (new file names) is fetched into its own cache when the app updates; older icon caches are dropped.
self.addEventListener('install', (e) => { e.waitUntil(refreshIcons(caches, (u) => fetch(u))) })

// L5: push, click and resubscribe. All logic lives in features/notify (tested); this is wiring only.
self.addEventListener('push', (e) => {
  const raw = (() => { try { return e.data?.json() } catch { return undefined } })()
  e.waitUntil(
    handlePush(raw, {
      claimNudge,
      show: (n) => self.registration.showNotification(n.title, { body: n.body, data: n.data, tag: n.tag, icon: iconUrl('icon-192'), ...(n.silent ? { silent: true } : {}) })
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const tab = (e.notification.data as { tab?: string } | null)?.tab
  const scope = self.registration.scope
  const url = new URL(tab ? `./#${tab}` : './', scope).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (cs) => {
      const c = cs.find((w) => w.url.startsWith(scope))
      try {
        if (!c) throw 0
        await c.focus()
        await c.navigate(url)
      } catch {
        await self.clients.openWindow(url)
      }
    })
  )
})

self.addEventListener('pushsubscriptionchange', (e) => {
  const key = vapidKey()
  if (key) (e as ExtendableEvent).waitUntil(subscribeAndSave(self.registration, key))
})
