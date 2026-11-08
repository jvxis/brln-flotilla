import {now} from "@welshman/lib"
import {WRAP} from "@welshman/util"
import type {Filter} from "@welshman/util"
import {SocketEvent, isClientReq} from "@welshman/net"
import type {ClientMessage, Socket} from "@welshman/net"

// A gift wrap's date is deliberately wrong: NIP-59 backdates it by a random amount of up to two
// days, so a relay can't tell when a conversation happened. The club's own tools (the Services
// account, the bots) backdate by up to ten hours; other clients by the full two days, and the
// club's relay holds wraps to members dated 47 hours before they were sent.
//
// A relay compares a filter's `since` with that false date. So a request for wraps has to reach
// back past the whole drift, or a message that was just sent never matches it.
export const WRAP_DRIFT = 2 * 24 * 60 * 60

// sync.ts already widens the requests it makes. What it can't reach is welshman reopening a socket:
// the lifecycle policy sends every pending request again with `since` replaced by the moment the
// socket last received anything (`catchUpFilter`), drift and all forgotten. After the first
// reconnect -- and an idle socket is probed and reopened every few minutes -- the live subscription
// for direct messages asks only for wraps dated from a few minutes ago, the relay withholds every
// new one, and the inbox stays still until a reload. Seen on 08/11/2026 on the desktop chat.
//
// So every request for wraps that leaves a socket reaches back at least the drift, whoever built
// it. Lowering `since` never loses anything; the wraps it brings back again are deduplicated by id.
const widen = (filter: Filter): Filter => {
  if (!filter.kinds?.includes(WRAP) || typeof filter.since !== "number") return filter

  const floor = now() - WRAP_DRIFT

  return filter.since > floor ? {...filter, since: floor} : filter
}

export const socketPolicyWrapDrift = (socket: Socket) => {
  const onSending = (message: ClientMessage) => {
    if (!isClientReq(message)) return

    // Still in the send queue, and the queue holds this same array: it goes out on a timer,
    // after this event has been handled, so the filters can be replaced in place.
    for (let i = 2; i < message.length; i++) {
      message[i] = widen(message[i] as Filter)
    }
  }

  socket.on(SocketEvent.Sending, onSending)

  return () => {
    socket.off(SocketEvent.Sending, onSending)
  }
}
