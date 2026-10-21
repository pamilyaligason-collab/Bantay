/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { subscribeAndSave, vapidKey } from './features/notify/subscribe'
import { claimNudge, handlePush } from './features/notify/push'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/admin/] })) // /admin is its own page (web admin), never the app shell

// L5: push, click and resubscribe. All logic lives in features/notify (tested); this is wiring only.
self.addEventListener('push', (e) => {
  const raw = (() => { try { return e.data?.json() } catch { return undefined } })()
  e.waitUntil(
    handlePush(raw, {
      claimNudge,
      show: (n) => self.registration.showNotification(n.title, { body: n.body, data: n.data, tag: n.tag, icon: 'icon.svg', ...(n.silent ? { silent: true } : {}) })
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
