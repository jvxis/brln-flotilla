import {noop, sleep} from "@welshman/lib"
import {PROFILE} from "@welshman/util"
import {Sync, User} from "@welshman/app"
import type {AppPolicy, IApp} from "@welshman/app"
import {appPolicies, thunks} from "@app/core"
import {PLATFORM_RELAYS, PROFILE_IMPORT_RELAYS} from "@app/env"

// A member who already uses Nostr arrives with a name and a picture, and having to
// type them again here reads as if their identity did not come along. Their profile
// is a signed event of their own, so it is fetched once and copied into the space.
//
// Only their own pubkey is ever asked about, and only when the space has no profile
// for them: the other members' npubs never leave the club's relay, which is the whole
// point of a closed space.
// A relay that never answers must not hold the whole thing up: the club's relay
// refuses everything to someone it has not admitted yet, and a public one can simply
// be slow. Whatever arrived by then is what gets used.
const PULL_TIMEOUT = 5000

const pullWithin = (promise: Promise<void>) => Promise.race([promise, sleep(PULL_TIMEOUT)])

const importOwnProfile = async ($app: IApp) => {
  if (PROFILE_IMPORT_RELAYS.length === 0 || PLATFORM_RELAYS.length === 0) return

  const {pubkey} = User.require($app)
  const filters = [{kinds: [PROFILE], authors: [pubkey]}]
  const known = () => $app.repository.query(filters)[0]

  await pullWithin($app.use(Sync).pull({relays: PLATFORM_RELAYS, filters}))

  if (known()) return

  await pullWithin($app.use(Sync).pull({relays: PROFILE_IMPORT_RELAYS, filters}))

  const profile = known()

  if (!profile) return

  await thunks.get().publish({event: profile, relays: PLATFORM_RELAYS}).waitForError()
}

export const profileImportPolicy: AppPolicy = $app => {
  if ($app.user) {
    importOwnProfile($app).catch(error => {
      console.info("Could not bring the profile over:", error?.message || error)
    })
  }

  return noop
}

appPolicies.push(profileImportPolicy)
