import {uniq} from "@welshman/lib"
import {
  APP_DATA,
  BLOCKED_RELAYS,
  BLOSSOM_SERVERS,
  FOLLOWS,
  MESSAGING_RELAYS,
  MUTES,
  PROFILE,
  RELAYS,
  ROOMS,
  SEARCH_RELAYS,
} from "@welshman/util"
import type {Command} from "@welshman/app"
import {PLATFORM_RELAYS} from "@app/env"

// The kinds that say who a person is and how to reach them: their profile, the relays they read,
// write and receive messages on, who they follow and mute, and the preferences the app restores
// on a fresh browser.
const IDENTITY_KINDS = new Set([
  APP_DATA,
  BLOCKED_RELAYS,
  BLOSSOM_SERVERS,
  FOLLOWS,
  MESSAGING_RELAYS,
  MUTES,
  PROFILE,
  RELAYS,
  ROOMS,
  SEARCH_RELAYS,
])

// Publishing sends an event to the relays the author's own relay list (kind 10002) names, which
// is right on the open network and wrong for a club: someone who arrived with a Nostr identity
// from years ago has a list naming only strangers' relays, and the club ends up holding none of
// their profile, mailbox or preferences. Finding them then depends on a relay nobody here runs,
// and a member's first login on a fresh browser depends on it too. So an event that says who
// someone is goes to the club's relays as well as wherever else it was headed. Everything else
// -- messages, articles, reactions -- is routed exactly as before. Where no platform relay is
// configured this changes nothing.
export const publish = (command: Command) =>
  command.publishToRelays(
    IDENTITY_KINDS.has(command.event.kind)
      ? uniq([...command.relays, ...PLATFORM_RELAYS])
      : command.relays,
  )
