import {makeHttpAuth, makeHttpAuthHeader} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {BRLN_PUSH_URL, PLATFORM_URL} from "@app/env"

// Notifications with the chat closed, through the club's own push service (brln-community
// cmd/brln-push). Until 16/10/2026 the chat only notified while open, and on a phone that meant
// nothing at all: the push servers upstream uses are a third party's and cannot read the club's
// members-only relay. The browser subscribes with the service's VAPID key, and the subscription is
// handed to the service in a request signed by the member's own key (NIP-98), so only members get
// in and only for themselves. The service worker side is static/brln-push-sw.js.

export type BrlnPushState = "unavailable" | "elsewhere" | "denied" | "off" | "on"

const base64UrlToBytes = (value: string) => {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/")
  const raw = atob(padded)
  return Uint8Array.from(raw, char => char.charCodeAt(0))
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => {
  if (!a) return false
  const bytes = new Uint8Array(a)
  return bytes.length === b.length && bytes.every((byte, index) => byte === b[index])
}

const supported = () =>
  Boolean(BRLN_PUSH_URL) &&
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window

// The service lives next to chat.br-ln.com. The chat a node serves (LightningOS) runs on a
// self-signed certificate, where the browser refuses a service worker, so it points there instead.
const onPlatformOrigin = () => {
  try {
    return !PLATFORM_URL || new URL(PLATFORM_URL).origin === window.location.origin
  } catch {
    return true
  }
}

const registration = async () => {
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 5000)),
  ])
  if (!ready) throw new Error("This browser did not start the chat's background worker.")
  return ready
}

export const brlnPushState = async (): Promise<BrlnPushState> => {
  if (!BRLN_PUSH_URL) return "unavailable"
  if (!onPlatformOrigin()) return "elsewhere"
  if (!supported()) return "unavailable"
  if (Notification.permission === "denied") return "denied"
  try {
    const subscription = await (await registration()).pushManager.getSubscription()
    return subscription && Notification.permission === "granted" ? "on" : "off"
  } catch {
    return "off"
  }
}

const signedPost = async (signer: ISigner, path: string, body: unknown) => {
  const url = `${BRLN_PUSH_URL}${path}`
  const json = JSON.stringify(body)
  const auth = makeHttpAuthHeader(await signer.sign(await makeHttpAuth(url, "POST", json)))
  const response = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: auth},
    body: json,
  })
  if (!response.ok) {
    const reason = await response
      .json()
      .then(data => data?.error)
      .catch(() => "")
    throw new Error(reason || `The notification service answered ${response.status}.`)
  }
  return response.json().catch(() => ({}))
}

export const enableBrlnPush = async (signer: ISigner, rooms: string[] = []) => {
  if (!supported())
    throw new Error("This browser cannot receive notifications with the chat closed.")
  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in the browser settings and try again."
        : "The browser did not answer the request for notifications.",
    )
  }
  const reg = await registration()
  const {key} = await fetch(`${BRLN_PUSH_URL}/vapid`).then(response => response.json())
  const applicationServerKey = base64UrlToBytes(key)
  let subscription: PushSubscription | null | undefined = await reg.pushManager.getSubscription()
  // A subscription made for another key (the service was reinstalled) cannot be used.
  if (subscription && !sameKey(subscription.options.applicationServerKey, applicationServerKey)) {
    await subscription.unsubscribe()
    subscription = undefined
  }
  subscription ??= await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey})
  await signedPost(signer, "/subscribe", {subscription: subscription.toJSON(), salas: rooms})
}

// Opening the chat clears what the notifications said was waiting: the club's notifications still
// in the tray and the number on the app's icon (static/brln-push-sw.js sets it). The way a
// messaging app clears its own once it is opened.
export const watchBrlnBadge = () => {
  if (!BRLN_PUSH_URL || !onPlatformOrigin() || !supported()) return () => {}

  const clear = async () => {
    if (document.visibilityState !== "visible") return
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      for (const notification of (await reg?.getNotifications()) ?? []) {
        notification.close()
      }
      await navigator.clearAppBadge?.()
    } catch {
      // Nothing to clear, or a browser without badges: either way nothing is lost.
    }
  }

  clear()
  document.addEventListener("visibilitychange", clear)

  return () => document.removeEventListener("visibilitychange", clear)
}

// A direct message goes out as one gift wrap per recipient plus one back to the sender, and the
// service cannot tell which wrap is the sender's own copy. So, on sending, the chat tells it "I just
// sent one" and the service keeps that copy quiet for a few minutes. At most one signature every two
// minutes, sent without waiting; the chat a node serves sends it too, since its member's phone may be
// subscribed on chat.br-ln.com. A failure only means one extra notification.
let lastSentSignal = 0

export const noteBrlnDirectSent = (signer: ISigner | undefined) => {
  if (!BRLN_PUSH_URL || !signer || typeof window === "undefined") return
  const now = Date.now()
  if (now - lastSentSignal < 120_000) return
  lastSentSignal = now
  signedPost(signer, "/sent", {}).catch(() => {
    lastSentSignal = 0
  })
}

// The member's devices with notifications on, as the service sees them (it is the only one that
// sees all of them). Asked on 17/10/2026: Jaime's iPhone had kept the subscription of an earlier
// install of the chat next to the current one, and showed every notification twice.
export type BrlnPushDevice = {
  servico: "apple" | "google" | "mozilla" | "windows" | "outro"
  desde: number
  atualizado: number
  este: boolean
}

const currentEndpoint = async () => {
  try {
    return (await (await registration()).pushManager.getSubscription())?.endpoint ?? ""
  } catch {
    return ""
  }
}

export const listBrlnPushDevices = async (signer: ISigner): Promise<BrlnPushDevice[]> => {
  const data = await signedPost(signer, "/devices", {endpoint: await currentEndpoint()})
  return Array.isArray(data?.devices) ? data.devices : []
}

// Turns notifications off on every device but this one (on all of them, if this one is off).
export const turnOffOtherBrlnPushDevices = async (signer: ISigner): Promise<number> => {
  const data = await signedPost(signer, "/devices/others", {endpoint: await currentEndpoint()})
  return Number(data?.removed) || 0
}

export const disableBrlnPush = async (signer: ISigner) => {
  const subscription = await (await registration()).pushManager.getSubscription()
  if (!subscription) return
  try {
    await signedPost(signer, "/unsubscribe", {endpoint: subscription.endpoint})
  } finally {
    await subscription.unsubscribe()
  }
}
