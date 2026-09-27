import {Nip46Broker, Nip46Signer} from "@welshman/signer"
import type {Nip46BrokerParams} from "@welshman/signer"
import {Pool, socketPolicyConnectOnSend, socketPolicyLifecycle} from "@welshman/net"
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

// The pool the signer talks through, built the way welshman builds its default one.
//
// The broker falls back to a pool of its own, created once and hidden inside @welshman/signer.
// Handing it this one instead is what lets the watch reach the sockets, which is the whole fix
// of 27/09/2026: see `reopen` below.
const signerPool = () => {
  const pool = new Pool()

  pool.socketPolicies = [socketPolicyConnectOnSend, socketPolicyLifecycle]

  return pool
}

const keepListening = (broker: Nip46Broker, pool: Pool) => {
  // One ping at a time. If the signer is mute the previous one is still hanging on its
  // deadline, and firing another only piles up requests nobody will answer.
  let asking = false

  // Reopen the subscription for real, on sockets that are new.
  //
  // The version of 26/09 reopened the SUBSCRIPTION and kept the SOCKET, and on 27/09 the console
  // showed what that costs: "the remote signer did not answer; reopening the listener", every
  // thirty seconds, for as long as the page stayed open. A socket to the club's pairing relay
  // had gone half open -- the server had let it go, the browser still thought it alive -- and
  // each fresh subscription went down the same dead line, followed by the ping that was meant to
  // detect it. Only a reload made new sockets, which is why a reload was the only cure.
  //
  // `pool.remove` cleans the socket up and forgets it, so the next request dials again. It is
  // safe for an answer already on its way: the club's pairing relay holds answers for a client
  // that is reconnecting (signerrelay/mailbox.go), and the new subscription has no `since`, so it
  // receives what was held. It is also harmless for a relay that never connects -- the node's
  // own one, behind a certificate the browser does not trust -- which fails as it already did.
  //
  // Deliberately not `receiver.stop()`, which also does `removeAllListeners()`. Every request in
  // flight registers its own listener on the receiver and removes it when the answer arrives, so
  // stopping would strip a signature that is merely slow of the listener waiting for it -- and
  // since welshman's requests have no deadline, that turns a slow signature into one that hangs
  // forever. Aborting the controller and clearing it does the one thing needed: `start()` sees no
  // controller and opens a fresh subscription, while every listener stays where it was.
  const reopen = () => {
    for (const url of broker.params.relays) {
      pool.remove(url)
    }

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

// Addresses that only exist inside someone's own network.
const isPrivateHost = (host: string) => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "")

  if (h === "localhost" || /\.(local|lan|internal|home\.arpa)$/.test(h)) return true

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)

  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]

    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }

  return h === "::1" || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

// The relays this page can actually reach.
//
// A signer on a node puts the node's own pairing relay in the pairing link, first, next to the
// club's: the chat served by that same node reaches it without leaving the house. A chat served
// from a public address never does. The node answers with a self-signed certificate, and a
// browser refuses that on a WebSocket opened from another origin, with no prompt and no way to
// accept it -- accepting the warning on the signer page does not carry over, which was measured
// on 27/09/2026. So from here that relay was dialed on every start and every reopen, and failed
// every time, filling the console with "wss://192.168.68.92:4448/pairing failed".
//
// Dropped only when the page is public and something else is left: a pairing whose only relay
// is private keeps it, and fails as it did, rather than being left with none.
const reachableRelays = (relays: string[]) => {
  if (typeof window === "undefined" || isPrivateHost(window.location.hostname)) return relays

  const reachable = relays.filter(url => !isPrivateHost(hostOf(url)))

  return reachable.length > 0 ? reachable : relays
}

// Same method name as the handler it replaces, so sessions saved before this keep working.
//
// The pool and the narrowed relay list go into the broker's runtime params only. The session
// saved in storage is `data`, untouched, so nothing is lost from the pairing itself.
export const nip46WithWatch = defineSessionHandler({
  method: "nip46",
  getSigner: (data: Nip46BrokerParams) => {
    const pool = signerPool()
    const relays = reachableRelays(data.relays)

    return new Nip46Signer(keepListening(new Nip46Broker({...data, relays, context: {pool}}), pool))
  },
})

export const useRemoteSignerWatch = () => registerSessionHandler(nip46WithWatch)
