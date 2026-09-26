import {Nip46Broker, Nip46Signer} from "@welshman/signer"
import type {Nip46BrokerParams} from "@welshman/signer"
import {defineSessionHandler, registerSessionHandler} from "@welshman/app"

// A remote signer answers on a relay, and the client hears it through one subscription opened
// when the session starts. `Nip46Receiver` never opens it again: its `onClose` only forgets the
// abort controller, so the first time that socket drops -- a blip, a phone waking up, the relay
// restarting -- the answers keep coming and nobody is listening. The signer looks alive (its
// "last used" keeps moving), while every window sits on "Authenticating" until it is reloaded.
// Reported as `coracle-social/welshman` #61; still present in the installed 0.10.9.
//
// The first version of this watch called `start()` on a timer. It was not enough, and 26/09/2026
// showed why: `start()` **returns immediately while the subscription is live**. A subscription
// that is alive and deaf -- the relay dropped it on its side, or the socket is half open -- is
// never reopened by it. The watch called a no-op every five seconds while a member sat stuck for
// twenty-six minutes, reading fine and unable to write.
//
// Asking "does the subscription exist?" is a proxy, and the proxy is what lied. The question
// that matters is "do you answer me?", and only a ping asks it: it crosses the whole path --
// send, relay, signer, relay, receive. Nothing short of that distinguishes a live listener from
// a deaf one.

// How often to ask. A ping is a real round trip, so it is not free the way the empty call was;
// thirty seconds is nothing against the twenty-six minutes it cost, and rare enough not to weigh.
const PING_INTERVAL = 30_000

// How long to wait for the answer. Welshman's requests carry no deadline of their own: a signer
// that is closed leaves the promise pending forever -- the same defect that left the page blank
// in patch 12. So the deadline is ours, or the watch hangs along with what it watches.
const PING_TIMEOUT = 10_000

const withDeadline = <T>(promise: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no answer")), ms)
    const clear = () => clearTimeout(timer)

    promise.then(
      value => {
        clear()
        resolve(value)
      },
      error => {
        clear()
        reject(error)
      },
    )
  })

const keepListening = (broker: Nip46Broker) => {
  // One ping at a time. If the signer is mute the previous one is still hanging on its
  // deadline, and firing another only piles up requests nobody will answer.
  let asking = false

  // Reopen the subscription for real.
  //
  // Deliberately not `receiver.stop()`, which also does `removeAllListeners()`. Every request in
  // flight registers its own listener on the receiver and removes it when the answer arrives, so
  // stopping would strip a signature that is merely slow of the listener waiting for it -- and
  // since welshman's requests have no deadline, that turns a slow signature into one that hangs
  // forever. Aborting the controller and clearing it does the one thing needed: `start()` sees no
  // controller and opens a fresh subscription, while every listener stays where it was.
  const reopen = () => {
    try {
      broker.receiver.abortController?.abort()
    } catch (error) {
      console.warn("Could not abort the remote signer listener:", error)
    }

    broker.receiver.abortController = undefined

    broker.receiver.start().catch(error => {
      console.warn("Could not listen to the remote signer:", error)
    })
  }

  const check = async () => {
    if (asking) return

    asking = true

    try {
      await withDeadline(broker.ping(), PING_TIMEOUT)
    } catch {
      // Could be the deaf subscription, could be the signer asleep. Reopening serves both, and
      // costs nothing when things were fine.
      console.warn("The remote signer did not answer; reopening the listener.")
      reopen()
    } finally {
      asking = false
    }
  }

  // On the way up there is no subscription yet, so this is a plain start, not the full cycle.
  broker.receiver.start().catch(error => {
    console.warn("Could not listen to the remote signer:", error)
  })

  const interval = setInterval(check, PING_INTERVAL)

  if (typeof window !== "undefined") {
    // Waking up is when this matters most: a phone or a laptop that slept has lost its
    // sockets, and the first thing the person does is expect the chat to work.
    window.addEventListener("online", check)
    window.addEventListener("focus", check)
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
