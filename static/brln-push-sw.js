// Loaded into the service worker workbox generates (vite.config.ts, workbox.importScripts).
// Shows what the club's push service (brln-community cmd/brln-push) sends with the chat closed,
// and opens the room or the direct messages when the notification is tapped. See
// src/app/brlnPush.ts for the subscription side.

// A phone that sleeps gets what its push service kept all at once when it wakes, messages already
// read on the computer included (jvxis/brln-flotilla#3). The service limits how long a push is kept
// (1 h for a room, 24 h for a direct message, a mention or a reply) and, since 13/11/2026, says
// when the message was written (`created_at`, unix seconds). Past these ages a message is old
// news: a room's after 3 hours, the rest after 24. A payload without the time is shown as before.
const isLate = data => {
  if (typeof data.created_at !== "number") return false
  const age = Date.now() / 1000 - data.created_at
  const isRoom = typeof data.tag === "string" && data.tag.startsWith("sala-")
  return age > (isRoom ? 3 : 24) * 3600
}

const notice = data => {
  // A late push still shows something: Chrome puts up a "site updated in the background" notice
  // of its own for a push that shows nothing, and Safari cancels the subscription of a site that
  // keeps doing it (userVisibleOnly). So the late ones share a single quiet notification, each
  // replacing the one before without sound, instead of one per message.
  if (isLate(data)) {
    return {
      title: "BR⚡LN Community",
      options: {
        body: "Avisos de mais cedo chegaram só agora. Abra o chat para ver o que há de novo.",
        tag: "atrasados",
        renotify: false,
        silent: true,
        data: {url: "/"},
      },
    }
  }
  const tag = data.tag || undefined
  return {
    title: data.title || "BR⚡LN Community",
    options: {
      body: data.body || "",
      tag,
      // A new message in a room replaces the previous one quietly; a mention or reply rings.
      renotify: Boolean(tag && !tag.startsWith("sala-")),
      data: {url: data.url || "/"},
    },
  }
}

self.addEventListener("push", event => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {body: event.data ? event.data.text() : ""}
  }
  const {title, options} = notice(data)
  event.waitUntil(
    self.registration
      .showNotification(title, {
        ...options,
        icon: "/pwa-192x192.png",
        // Android draws only the alpha of the status-bar icon: a silhouette, not the colour icon.
        badge: "/brln-badge-96.png",
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
