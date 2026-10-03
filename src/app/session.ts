import {sleep} from "@welshman/lib"
import type {ClientOptions} from "@pomade/core"
import type {Wallet} from "@welshman/util"
import {nip01, nip07, nip46, nip55, pomade, toSession} from "@welshman/app"
import type {Session} from "@welshman/app"
import {getTestEvents, maybeGetTestSession, takeTestDecryptFailure} from "@lib/test/session"
import {app, login, session} from "@app/core"
import {wallet} from "@app/lightning"
import {kv, ss, storage} from "@app/storage"
import {deactivateCurrentPomadeSession} from "@app/pomade"
import {SIGNER_PUBKEY_CHANGED, useRemoteSignerWatch} from "@app/remoteSigner"
import {Push} from "@app/push"

// Registered before any session is restored, so a remote signer session gets the watched
// broker rather than the stock one.
useRemoteSignerWatch()

// Sessions used to be a Record<pubkey, session> keyed by an active pubkey, and carried their
// pubkey plus method-specific fields inline. Convert one so upgrading doesn't log people out.
type LegacySession = {
  method: string
  pubkey: string
  secret?: string
  signer?: string
  email?: string
  clientOptions?: ClientOptions
  handler?: {pubkey: string; relays: string[]}
  wallet?: Wallet
}

const toCurrentSession = (legacy: LegacySession): Session | undefined => {
  switch (legacy.method) {
    case "nip01":
      return legacy.secret ? toSession(nip01, {secret: legacy.secret}) : undefined
    case "nip07":
      return toSession(nip07, {})
    case "nip46":
      return legacy.secret && legacy.handler
        ? toSession(nip46, {
            clientSecret: legacy.secret,
            signerPubkey: legacy.handler.pubkey,
            relays: legacy.handler.relays,
            userPubkey: legacy.pubkey,
          })
        : undefined
    case "nip55":
      return legacy.signer
        ? toSession(nip55, {pubkey: legacy.pubkey, signer: legacy.signer})
        : undefined
    case "pomade":
      return legacy.clientOptions && legacy.email
        ? toSession(pomade, {clientOptions: legacy.clientOptions, email: legacy.email})
        : undefined
  }
}

const readLegacySession = async () => {
  const pubkey = await kv.get<string>("pubkey")
  const sessions = await ss.get<Record<string, LegacySession>>("sessions")
  const legacy = pubkey ? sessions?.[pubkey] : undefined

  if (legacy?.wallet) {
    wallet.set(legacy.wallet)
  }

  return legacy ? toCurrentSession(legacy) : undefined
}

// The session is derived from the app's user, so it can't be synced to storage directly —
// read it back once at startup, then persist it whenever the identity changes.
// Long enough for a slow phone and a sleepy signer, short enough that nobody
// stares at a blank screen wondering whether it is broken.
const RESTORE_TIMEOUT = 15000

export const restoreSession = async () => {
  // Test-only: when Playwright has injected window.__TEST_SESSION__, that identity wins over
  // whatever is in storage. No-op for real users; stripped from production builds.
  const testSession = import.meta.env.DEV ? maybeGetTestSession() : undefined
  const $session = testSession ?? (await ss.get<Session>("session")) ?? (await readLegacySession())

  if ($session) {
    // A remote signer answers over the network, or does not answer at all: welshman
    // asks it for the pubkey and waits forever if nobody is home. Waiting forever
    // here means the interface never renders, so give up after a while and let the
    // app come up. The session is kept, so reopening with the signer awake works.
    const restored = await Promise.race([
      login($session).then(() => true),
      sleep(RESTORE_TIMEOUT).then(() => false),
    ])

    if (!restored) {
      console.warn("The signer did not answer in time; starting without it.")
    }
  }

  // Logging in builds a fresh app, so the test's cached events go into its repository afterwards,
  // the same way storage loads what the last session left behind. Storage gets there first and
  // loads with Repository.load, which clears the repository before inserting, so these have to
  // wait for it or they are wiped before anything reads them.
  if (testSession) {
    app
      .get()
      .user?.wrapSigner((method, thunk) =>
        method === "nip44.decrypt" && takeTestDecryptFailure()
          ? Promise.reject(new Error("test: the signer is away"))
          : thunk(),
      )

    await storage.get()?.ready

    for (const event of getTestEvents()) {
      app.get().repository.publish(event)
    }
  }

  // The signer now holds another key than the one remembered: forget it and start over, so the
  // next load asks the signer who the member is instead of showing the wrong identity.
  const onPubkeyChanged = () => {
    const $current = session.get()

    if ($current?.method === "nip46") {
      const data = {...($current.data as Record<string, unknown>)}

      delete data.userPubkey

      ss.set("session", {...$current, data}).then(() => window.location.reload())
    }
  }

  window.addEventListener(SIGNER_PUBKEY_CHANGED, onPubkeyChanged)

  const unsubscribe = session.subscribe($session => {
    if ($session) {
      ss.set("session", $session)
    }
  })

  return () => {
    window.removeEventListener(SIGNER_PUBKEY_CHANGED, onPubkeyChanged)
    unsubscribe()
  }
}

export const logout = async () => {
  await deactivateCurrentPomadeSession()
  await Push.disable()
  await kv.clear()
  await ss.clear()
  await storage.get()?.clear()

  app.get().cleanup()
  localStorage.clear()

  window.location.href = "/"
}
