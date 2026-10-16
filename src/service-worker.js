// This is the worker the app registers (src/routes/+layout.svelte), and it takes the "/" scope
// from the workbox one vite-pwa generates. So the club's push handlers load here too: without
// them a push reached the browser and nothing showed (16/10/2026). See static/brln-push-sw.js.
self.importScripts("/brln-push-sw.js")

self.addEventListener("install", event => {
  self.skipWaiting()
})

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim())
})
