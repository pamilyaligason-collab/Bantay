/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { db } from './db'
import { handlePush, type NudgeState } from './features/notify/push'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// L5: push and notification click. All logic lives in features/notify (tested); this is wiring only.
self.addEventListener('push', (e) => {
  const raw = (() => { try { return e.data?.json() } catch { return undefined } })()
  e.waitUntil(
    handlePush(raw, {
      getNudge: async () => (await db.kv.get('nudge'))?.value as NudgeState | undefined,
      setNudge: async (v) => { await db.kv.put({ key: 'nudge', value: v }) },
      show: (n) => self.registration.showNotification(n.title, { body: n.body, data: n.data, tag: n.id, icon: 'icon.svg' })
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const tab = (e.notification.data as { tab?: string } | null)?.tab
  const url = new URL(tab ? `./#${tab}` : './', self.registration.scope).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (cs) => {
      const c = cs[0]
      if (c) {
        await c.focus()
        await c.navigate(url).catch(() => undefined)
      } else await self.clients.openWindow(url)
    })
  )
})
