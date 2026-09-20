import {noop, sleep} from "@welshman/lib"
import {PROFILE} from "@welshman/util"
import type {Filter} from "@welshman/util"
import {Network, User} from "@welshman/app"
import type {AppPolicy, IApp} from "@welshman/app"
import {appPolicies, thunks} from "@app/core"
import {waitUntilRelayCanAnswer} from "@app/access"
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
const REQUEST_TIMEOUT = 5000

// A plain REQ, not a negentropy sync. purplepag.es announces NIP-77 in its NIP-11 and
// then answers NEG-OPEN with "failed to parse envelope: unknown envelope label", so a
// reconciliation there fetches nothing at all, quietly. Every relay serves a REQ.
const askFor = ($app: IApp, relays: string[], filters: Filter[]) =>
  Promise.race([
    $app.use(Network).request({relays, filters, autoClose: true}),
    sleep(REQUEST_TIMEOUT),
  ])

const importOwnProfile = async ($app: IApp) => {
  if (PROFILE_IMPORT_RELAYS.length === 0 || PLATFORM_RELAYS.length === 0) return

  const {pubkey} = User.require($app)
  const filters = [{kinds: [PROFILE], authors: [pubkey]}]
  const known = () => $app.repository.query(filters)[0]

  // Nao perguntar ao relay do clube antes de autenticar: num relay fechado a
  // pergunta e recusada com auth-required, e a recusa custa mais do que a resposta
  // valeria -- ela ajuda a matar o proprio socket antes de a autenticacao fechar.
  // Ver waitUntilRelayCanAnswer em access.ts.
  await Promise.all(PLATFORM_RELAYS.map(waitUntilRelayCanAnswer))

  await askFor($app, PLATFORM_RELAYS, filters)

  if (known()) return

  await askFor($app, PROFILE_IMPORT_RELAYS, filters)

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
