import {Nip46Broker, Nip46Signer} from "@welshman/signer"
import type {Nip46BrokerParams} from "@welshman/signer"
import {defineSessionHandler, registerSessionHandler} from "@welshman/app"

// How often to check that the remote signer is still being listened to. Short enough that a
// dropped socket costs seconds rather than a reload, long enough to be free: a check on a
// healthy listener does nothing at all.
const WATCH_INTERVAL = 5000

// A remote signer answers on a relay, and the client hears it through one subscription opened
// when the session starts. `Nip46Receiver` never opens it again: its `onClose` only forgets the
// abort controller, so the first time that socket drops -- a blip, a phone waking up, the relay
// restarting -- the answers keep coming and nobody is listening. The signer looks alive (its
// "last used" keeps moving), while every window sits on "Authenticating" until it is reloaded.
// Measured on 23/09/2026 with the club's own signer: three devices stuck at once, the signer
// answering all of them.
//
// Calling `start()` again is safe and is exactly what a reload does: it returns immediately
// while a subscription is live, and opens a new one once the old has closed. So watch it.
const keepListening = (broker: Nip46Broker) => {
  const watch = () => {
    broker.receiver.start().catch(error => {
      console.warn("Could not listen to the remote signer:", error)
    })
  }

  watch()

  const interval = setInterval(watch, WATCH_INTERVAL)

  if (typeof window !== "undefined") {
    // Waking up is when this matters most: a phone or a laptop that slept has lost its
    // sockets, and the first thing the person does is expect the chat to work.
    window.addEventListener("online", watch)
    window.addEventListener("focus", watch)
    window.addEventListener("beforeunload", () => clearInterval(interval))
  }

  return broker
}

// Same method name as the handler it replaces, so sessions saved before this keep working.
export const nip46WithWatch = defineSessionHandler({
  method: "nip46",
  getSigner: (data: Nip46BrokerParams) => new Nip46Signer(keepListening(new Nip46Broker(data))),
})

export const useRemoteSignerWatch = () => registerSessionHandler(nip46WithWatch)
