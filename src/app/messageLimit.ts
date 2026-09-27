import {SocketEvent, isClientEvent, isClientNegOpen, isClientReq} from "@welshman/net"
import type {ClientMessage, RelayMessage, Socket} from "@welshman/net"

// A relay reads at most 512 KB in one message (khatru's default, and so every relay the club
// runs), and one that is sent more does not refuse it: it drops the connection with a 1009. Welshman
// keeps the request as pending and sends it again as soon as the socket reopens, so the relay drops
// that connection too, and the status goes round Not Connected, Connecting, Authenticating and
// Connected every two seconds for as long as the page stays open — only a reload lets go of it.
//
// That is what happened on 27/09/2026: back in a room the browser already held thousands of
// messages for, the chat asked for all their reactions and replies in a single request, the club's
// relay logged a new connection from the member every 2.5 s for four minutes, each lasting about a
// second, and a request of 523 KB sent to it by hand came back closed with 1009 in 1.2 s.
//
// A message that size is a bug where it is built (feeds.ts splits its context requests now), but
// the loop it causes is worse than the bug, so nothing that size leaves the socket: it is dropped
// before sending, and whoever is waiting on it is told, as a relay would have told them.
export const MAX_MESSAGE_BYTES = 500_000

const encoder = new TextEncoder()

const sizeOf = (message: ClientMessage) => {
  const json = JSON.stringify(message)

  // A character is at most four bytes, so most messages don't need encoding to be measured
  return json.length * 4 <= MAX_MESSAGE_BYTES ? json.length : encoder.encode(json).length
}

export const socketPolicyMessageLimit = (socket: Socket) => {
  const onSending = (message: ClientMessage) => {
    const size = sizeOf(message)

    if (size <= MAX_MESSAGE_BYTES) return

    // Still in the queue: it goes out on a timer, after this event has been handled
    socket._sendQueue.remove(message)

    console.warn(
      `Not sending a ${Math.round(size / 1024)} KB ${message[0]} to ${socket.url}: ` +
        `the relay would drop the connection over it, again on every reconnect.`,
    )

    const reason = "error: message too large to send"

    if (isClientReq(message) || isClientNegOpen(message)) {
      socket._recvQueue.push(["CLOSED", message[1], reason] as RelayMessage)
    }

    if (isClientEvent(message)) {
      socket._recvQueue.push(["OK", message[1].id, false, reason] as RelayMessage)
    }
  }

  socket.on(SocketEvent.Sending, onSending)

  return () => {
    socket.off(SocketEvent.Sending, onSending)
  }
}
