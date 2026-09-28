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
// Handing it this one instead is what lets the watch reach the sockets.
const signerPool = () => {
  const pool = new Pool()

  pool.socketPolicies = [socketPolicyConnectOnSend, socketPolicyLifecycle]

  return pool
}

// A broker and the pool it talks through, built from the saved session. The relays are narrowed
// to the ones this page can reach (see `reachableRelays`); the session itself is never touched.
const buildBroker = (data: Nip46BrokerParams) => {
  const pool = signerPool()
  const broker = new Nip46Broker({...data, relays: reachableRelays(data.relays), context: {pool}})

  return {pool, broker}
}

// How many pings in a row may go unanswered before the broker is thrown away and rebuilt.
const SILENT_PINGS_BEFORE_REBUILD = 2

// What the watch can see of a broker, logged whenever the signer goes quiet.
//
// On 27/09/2026 a tab stuck in "Authenticating" was sending NOTHING: none of its requests reached
// the pairing relay, and no socket was opened in ninety seconds of watching, while the signer and
// the relay answered the member's other devices within the second. The stall was inside the
// broker, before sending, and nothing on screen said where. These three values say it: a queue
// that grows while `processing` stays true is a sender stuck on one request; `listening` false is a
// receiver with no subscription at all.
const describe = (broker: Nip46Broker) => ({
  queued: broker.sender.queue.length,
  processing: broker.sender.processing,
  listening: Boolean(broker.receiver.abortController),
})

const watchSigner = (
  signer: Nip46Signer,
  data: Nip46BrokerParams,
  first: {pool: Pool; broker: Nip46Broker},
) => {
  let current = first

  // One ping at a time. If the signer is mute the previous one is still hanging on its
  // deadline, and firing another only piles up requests nobody will answer.
  let asking = false

  // Pings in a row with no answer.
  let silent = 0

  // Reopen the subscription on sockets that are new.
  //
  // Enough for a socket that went half open -- the server let it go, the browser still thinks it
  // alive -- which was the diagnosis behind 0.1.45. It was not enough on 27/09, because the stall
  // was not in the socket; it stays as the cheap first step, and `rebuild` below is the one that
  // ends a stall wherever it lives.
  //
  // `pool.remove` cleans a socket up and forgets it, so the next request dials again. Safe for an
  // answer already on its way: the club's pairing relay holds answers for a client that is
  // reconnecting (signerrelay/mailbox.go), and the new subscription has no `since`.
  //
  // Deliberately not `receiver.stop()`, which also does `removeAllListeners()`. Every request in
  // flight registers its own listener on the receiver and removes it when the answer arrives, so
  // stopping would strip a signature that is merely slow of the listener waiting for it -- and
  // since welshman's requests have no deadline, a slow signature would hang forever.
  const reopen = () => {
    const {broker, pool} = current

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

  // Throw the broker away and build another, doing in place what a reload does.
  //
  // A reload was the one cure that always worked, and 27/09 showed why: the stall lives in the
  // broker object, so only a new broker ends it -- new sockets under the old one did not. This is
  // the reload without the reload: the same session, a fresh broker, and the page left alone.
  //
  // The app keeps the signer it was handed, so the signer stays the same object and only what it
  // delegates to changes. `sign` and `getPubkey` read `signer.broker` on every call, but `nip04`
  // and `nip44` captured the old broker's methods when the signer was built, so they are rebound
  // too -- in place, in case something kept a reference to those objects.
  //
  // The old broker is let go, not `cleanup()`ed: aborting its listener and dropping its sockets is
  // all it needs, and the requests still waiting on it were never going to be answered.
  const rebuild = () => {
    const old = current

    current = buildBroker(data)

    signer.broker = current.broker
    signer.nip04.encrypt = current.broker.nip04Encrypt
    signer.nip04.decrypt = current.broker.nip04Decrypt
    signer.nip44.encrypt = current.broker.nip44Encrypt
    signer.nip44.decrypt = current.broker.nip44Decrypt

    current.broker.receiver.start().catch(error => {
      console.warn("Could not listen to the remote signer:", error)
    })

    try {
      old.broker.receiver.abortController?.abort()
    } catch (error) {
      console.warn("Could not abort the old remote signer listener:", error)
    }

    old.pool.clear()
  }

  const check = async () => {
    if (asking) return

    asking = true

    try {
      await withDeadline(current.broker.ping(), PING_TIMEOUT)

      if (silent > 0) {
        console.info(`The remote signer is answering again, after ${silent} silent ping(s).`)
      }

      silent = 0
    } catch {
      silent += 1

      console.warn(
        `The remote signer did not answer (${silent} in a row).`,
        describe(current.broker),
      )

      if (silent >= SILENT_PINGS_BEFORE_REBUILD) {
        console.warn("Rebuilding the remote signer connection, as a reload would.")
        rebuild()
        silent = 0
      } else {
        reopen()
      }
    } finally {
      asking = false
    }
  }

  // On the way up there is no subscription yet, so this is a plain start, not the full cycle.
  current.broker.receiver.start().catch(error => {
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

// The member's own pubkey, kept in the session once a login has learned it (see `login` in
// core.ts).
//
// Without it every page load asks the signer who the member is, and waits for the answer before
// showing anything. A signer that is another app on a phone -- Amethyst in the background on
// Android -- often doesn't answer within the fifteen seconds the restore allows, and the member was
// shown the login screen on every reload with the session still saved (fork issue #1, reported on
// 27/09/2026 and reproduced with Amethyst's own CLI signer asleep). The pubkey is public and already
// on this device, so the identity comes back at once, and the signer is only needed to sign.
export type RemoteSignerData = Nip46BrokerParams & {userPubkey?: string}

// Fired when the signer turns out to hold another key than the one remembered, so whoever owns the
// session can forget it. Signing as the wrong identity is not an option.
export const SIGNER_PUBKEY_CHANGED = "brln:signer-pubkey-changed"

const isHexPubkey = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value)

const trustRememberedPubkey = (signer: Nip46Signer, userPubkey: string) => {
  signer.pubkey = userPubkey

  // Checked in the background: nothing waits on it, and the sender does not hold other requests
  // back while a reply is pending.
  signer.broker
    .getPublicKey()
    .then(pubkey => {
      if (pubkey && pubkey !== userPubkey) {
        console.warn("The signer now holds another key than the one this session remembers.")
        signer.pubkey = pubkey
        window.dispatchEvent(new CustomEvent(SIGNER_PUBKEY_CHANGED, {detail: {pubkey}}))
      }
    })
    .catch(() => {})
}

// Same method name as the handler it replaces, so sessions saved before this keep working.
//
// The pool, the narrowed relay list and any rebuilt broker live in the runtime objects only. The
// session saved in storage is `data`, untouched, so nothing is lost from the pairing itself.
export const nip46WithWatch = defineSessionHandler({
  method: "nip46",
  getSigner: (data: RemoteSignerData) => {
    const first = buildBroker(data)
    const signer = new Nip46Signer(first.broker)

    watchSigner(signer, data, first)

    if (isHexPubkey(data.userPubkey)) {
      trustRememberedPubkey(signer, data.userPubkey)
    }

    return signer
  },
})

export const useRemoteSignerWatch = () => registerSessionHandler(nip46WithWatch)
