// Loaded into the service worker workbox generates (vite.config.ts, workbox.importScripts).
// Shows what the club's push service (brln-community cmd/brln-push) sends with the chat closed,
// and opens the room or the direct messages when the notification is tapped. See
// src/app/brlnPush.ts for the subscription side.

self.addEventListener("push", event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {body: event.data ? event.data.text() : ""}
  }
  const title = data.title || "BR⚡LN Community"
  const tag = data.tag || undefined
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag,
      // A new message in a room replaces the previous one quietly; a mention or reply rings.
      renotify: Boolean(tag && !tag.startsWith("sala-")),
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      data: {url: data.url || "/"},
    }),
  )
})

self.addEventListener("notificationclick", event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({type: "window", includeUncontrolled: true}).then(windows => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client
            .focus()
            .then(focused => (focused && "navigate" in focused ? focused.navigate(url) : focused))
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
