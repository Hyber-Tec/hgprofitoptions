/**
 * Push notification service worker, bundled by scripts/build-sw.ts into public/firebase-messaging-sw.js.
 * The server sends data-only messages; this worker shows them and opens the alert when tapped.
 */
import { initializeApp, type FirebaseOptions } from "firebase/app"
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw"

declare const self: ServiceWorkerGlobalScope
declare const __FIREBASE_CONFIG__: FirebaseOptions

self.addEventListener("install", () => {
  void self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

// Registered before Firebase's own handler so taps on our notifications open the alert.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const data = event.notification.data as { url?: string } | null
  const target = new URL(data?.url ?? "/members/alerts", self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus()
          await client.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

const messaging = getMessaging(initializeApp(__FIREBASE_CONFIG__))

onBackgroundMessage(messaging, (payload) => {
  const data = payload.data ?? {}
  const title = data.title ?? "HG Profit Options"
  void self.registration.showNotification(title, {
    body: data.body ?? "",
    icon: "/media/notification-icon.png",
    badge: "/media/notification-badge.png",
    tag: data.tag ?? data.alertId ?? "hg-alert",
    data: { url: data.url ?? "/members/alerts" },
  })
})
