import {noop, sleep} from "@welshman/lib"
import type {AppPolicy} from "@welshman/app"
import {getTestDecryptDelay, takeTestDecryptStall} from "@lib/test/session"

// Direct messages are opened one at a time. Welshman's Wraps queue awaits each unwrap before the
// next, and a remote signer's decryption has no deadline: Nip46Sender publishes the request without
// reading the relay's OK, and Nip46Broker waits for an answer that may never come. One request lost
// on the way stalls the queue for good -- every direct message that arrives after it sits unopened,
// with no message and no unread dot, until a reload builds a new queue.
//
// On 08/11/2026 that is exactly what happened to Jaime after moving his LOS signer to another node.
// Right after a load the chat asks for a hundred decryptions a minute; the chat and the signer both
// went out through his home connection, so the signer relay's per-IP limit (120 events a minute,
// two per decryption) refused a few, and the queue stopped at the first of them: at 18:01:06 UTC the
// desktop's decryptions stopped, together with the relay's refusal, and the direct message sent at
// 18:01:00 never showed.
//
// So a decryption that has not come back in DECRYPT_DEADLINE is given up on. The unwrap fails, the
// queue moves on, and the wrap is handed back on the next catch-up (sync.ts, retryFailedUnwraps).
// A remote signer answers in well under a second, so this only ever cuts off one that is lost.
export const DECRYPT_DEADLINE = 15_000

const DECRYPTIONS = new Set(["nip04.decrypt", "nip44.decrypt"])

const withDeadline = <T>(promise: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The signer did not answer the decryption")),
      ms,
    )

    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })

export const decryptDeadlinePolicy: AppPolicy = $app => {
  if (!$app.user) return noop

  return $app.user.wrapSigner((method, thunk) => {
    if (!DECRYPTIONS.has(method)) return thunk()

    // Test-only: a decryption that is never answered, inside the deadline like a real lost one, or
    // one that takes as long as a round trip to a remote signer does.
    const delay = import.meta.env.DEV ? getTestDecryptDelay() : 0
    const answer =
      import.meta.env.DEV && takeTestDecryptStall()
        ? new Promise<never>(noop)
        : delay > 0
          ? sleep(delay).then(thunk)
          : thunk()

    return withDeadline(answer, DECRYPT_DEADLINE)
  })
}
