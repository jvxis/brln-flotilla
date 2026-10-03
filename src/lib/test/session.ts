import type {Maybe} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"
import type {Session} from "@welshman/app"

// The window keys Playwright writes to (see e2e/harness/app/session.ts). Keep them in sync with
// the literals duplicated there.
export const TEST_SESSION_KEY = "__TEST_SESSION__"

export const TEST_EVENTS_KEY = "__TEST_EVENTS__"

export const TEST_DECRYPT_FAILURES_KEY = "__TEST_DECRYPT_FAILURES__"

// Called when the session is restored at startup. Yields a session only when Playwright has
// injected one, so it is a no-op for real users.
export const maybeGetTestSession = (): Maybe<Session> =>
  (globalThis as {[TEST_SESSION_KEY]?: Session})[TEST_SESSION_KEY]

// The events a returning user's client would have found in storage, loaded into the repository
// alongside the injected session so a test boots into a state the app can reach on its own.
export const getTestEvents = (): TrustedEvent[] =>
  (globalThis as {[TEST_EVENTS_KEY]?: TrustedEvent[]})[TEST_EVENTS_KEY] ?? []

// Whether the signer should refuse this nip44 decryption, standing in for a remote signer that was
// away when a direct message arrived. A test sets window.__TEST_DECRYPT_FAILURES__ to how many
// to refuse, at the moment it wants them refused; each refusal counts one down. Never for real users.
export const takeTestDecryptFailure = (): boolean => {
  const scope = globalThis as {[TEST_DECRYPT_FAILURES_KEY]?: number}
  const left = scope[TEST_DECRYPT_FAILURES_KEY] ?? 0

  if (left <= 0) return false

  scope[TEST_DECRYPT_FAILURES_KEY] = left - 1

  return true
}
