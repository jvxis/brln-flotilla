import {AuthStateEvent, AuthStatus, SocketEvent, SocketStatus} from "@welshman/net"
import type {Socket} from "@welshman/net"

// A relay asks for authentication (NIP-42) once per connection, and welshman signs it once. If that
// signature fails, the socket is meant to go to `DeniedSignature`. It never gets there, and that is
// the whole of the "Authenticating" that only a reload cured, since 20/09/2026.
//
// `AuthState.doAuth` does `await tryCatch(() => sign(template), logError)` and, when that comes back
// empty, marks `DeniedSignature`. But welshman's `tryCatch` attaches its handler to the promise and
// then RETURNS THE SAME PROMISE, still rejecting. So the error is logged -- "Failed to sign auth
// event: Signing timed out" -- and then thrown again at the `await`, `doAuth` rejects before the
// line that would mark the refusal, and the rejection escapes as "Uncaught (in promise) Signing
// timed out". The socket stays in `PendingSignature` for good: nothing concludes it, nothing refuses
// it, and nothing asks again, because a relay only sends a challenge on a new connection.
//
// A signature fails that way whenever it takes longer than the thirty seconds `signWithOptions`
// allows. For a remote signer that is any hiccup: its node restarting -- a LightningOS upgrade, on
// 27/09 -- or the path to it breaking just when the relay asks. And the watch on the signer
// (remoteSigner.ts) cannot beat it: it needs up to forty seconds to notice a broken path, thirty to
// the next ping and ten for its deadline.
//
// Reproduced in a harness with the chat's own code, before this was written: a relay requiring
// authentication, the signer's path frozen while it asked, then restored. The console showed the
// two lines members had been sending in screenshots, the signer signed normally again in 206 ms,
// and the authentication was still `pending_signature` two and a half minutes later.
//
// So a signature that outlives the timeout is treated as failed, and the socket asks again: back to
// `Requested` -- exactly what welshman's own `retryAuth` does first -- and the app's auth policy,
// which already decides whether this socket authenticates and with which signer, signs again.
// Staying out of `DeniedSignature` is on purpose: in `PendingSignature` welshman keeps the requests
// made while waiting and sends them once authenticated, so the rooms fill in by themselves; a
// denial would throw them away.
//
// A real `DeniedSignature`, should one ever arrive, is asked again too, waiting longer each time.

// Longer than the thirty seconds a signature is given, so a signature that is merely slow is left
// alone and only one that has already failed is replaced.
const STUCK_SIGNATURE = 35_000

// How long to wait after a refused signature before asking again, doubling up to the ceiling.
const FIRST_RETRY = 5_000
const LAST_RETRY = 60_000

export const makeSocketPolicyAuthRetry =
  (shouldRetry: (socket: Socket) => boolean) => (socket: Socket) => {
    let delay = FIRST_RETRY
    let timer: ReturnType<typeof setTimeout> | undefined

    const cancel = () => {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
    }

    // Ask again, but only if the socket is still where it was left: a new challenge, a close or an
    // answer arriving in the meantime has already moved it along.
    const askAgainIf = (expected: AuthStatus) => () => {
      timer = undefined

      if (socket.auth.status !== expected || !socket.auth.challenge) return

      if (expected === AuthStatus.DeniedSignature) {
        delay = Math.min(delay * 2, LAST_RETRY)
      }

      console.info(
        `Authenticating to ${socket.url} again (the last signature was left ${expected}).`,
      )

      socket.auth.request = undefined
      socket.auth.details = undefined
      socket.auth.setStatus(AuthStatus.Requested)
    }

    // Reads the socket's CURRENT status rather than the one the event carries. Welshman emits one
    // status from inside another -- `Requested` makes the auth policy sign, which emits
    // `PendingSignature` before `Requested` has reached every listener -- so the events can arrive
    // out of order, and the last to arrive would be the stale one. Seen in the harness: acting on the
    // event's own status, the late `Requested` cancelled the timer the earlier `PendingSignature`
    // had just set, and nothing ever retried.
    const onAuthChange = () => {
      const status = socket.auth.status

      cancel()

      if (status === AuthStatus.Ok) {
        delay = FIRST_RETRY
        return
      }

      if (!shouldRetry(socket)) return

      if (status === AuthStatus.PendingSignature) {
        timer = setTimeout(askAgainIf(AuthStatus.PendingSignature), STUCK_SIGNATURE)
      }

      if (status === AuthStatus.DeniedSignature) {
        timer = setTimeout(askAgainIf(AuthStatus.DeniedSignature), delay)
      }
    }

    // A closed socket forgets its authentication, and the next connection gets a new challenge,
    // so there is nothing left to retry.
    const onSocketStatus = (status: SocketStatus) => {
      if (status === SocketStatus.Closed || status === SocketStatus.Error) {
        cancel()
        delay = FIRST_RETRY
      }
    }

    socket.auth.on(AuthStateEvent.Status, onAuthChange)
    socket.on(SocketEvent.Status, onSocketStatus)

    return () => {
      cancel()
      socket.auth.off(AuthStateEvent.Status, onAuthChange)
      socket.off(SocketEvent.Status, onSocketStatus)
    }
  }
