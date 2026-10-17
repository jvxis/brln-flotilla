// Loaded into the service worker workbox generates (vite.config.ts, workbox.importScripts).
// Shows what the club's push service (brln-community cmd/brln-push) sends with the chat closed,
// and opens the room or the direct messages when the notification is tapped. See
// src/app/brlnPush.ts for the subscription side.

self.addEventListener("push", event => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {body: event.data ? event.data.text() : ""}
  }
  const title = data.title || "BR⚡LN Community"
  const tag = data.tag || undefined
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body: data.body || "",
        tag,
        // A new message in a room replaces the previous one quietly; a mention or reply rings.
        renotify: Boolean(tag && !tag.startsWith("sala-")),
        icon: "/pwa-192x192.png",
        // Android draws only the alpha of the status-bar icon: a silhouette, not the colour icon.
        badge: "/brln-badge-96.png",
        data: {url: data.url || "/"},
      })
      .then(updateAppBadge),
  )
})

// The number on the app's icon (home screen on iPhone and Android, the dock or taskbar on a
// computer): how many of the club's notifications are waiting. Notifications that share a tag
// collapse into one, so a busy room counts once. The chat clears it when it is opened
// (src/app/brlnPush.ts, watchBrlnBadge).
const updateAppBadge = () =>
  self.registration
    .getNotifications()
    .then(open => {
      if (!self.navigator.setAppBadge) return
      return open.length > 0
        ? self.navigator.setAppBadge(open.length)
        : self.navigator.clearAppBadge()
    })
    .catch(() => {})

self.addEventListener("notificationclose", event => {
  event.waitUntil(updateAppBadge())
})

self.addEventListener("notificationclick", event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(updateAppBadge())
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
