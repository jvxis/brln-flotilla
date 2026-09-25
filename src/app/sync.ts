import {page} from "$app/stores"
import type {Unsubscriber} from "svelte/store"
import {ago, call, noop, now, poll, sleep, MONTH, WEEK} from "@welshman/lib"
import {AuthStatus, SocketStatus} from "@welshman/net"
import type {Maybe} from "@welshman/lib"
import {
  APP_DATA,
  FOLLOWS,
  MESSAGE,
  MUTES,
  PIN,
  PINBOARD,
  POLL_RESPONSE,
  RELAY_ADD_MEMBER,
  RELAY_MEMBERS,
  RELAY_REMOVE_MEMBER,
  RELAY_ROLE,
  ROOM_ADD_MEMBER,
  ROOM_ADMINS,
  ROOM_CREATE_PERMISSION,
  ROOM_DELETE,
  ROOM_JOIN,
  ROOM_LEAVE,
  ROOM_MEMBERS,
  ROOM_META,
  ROOM_PINS,
  ROOM_REMOVE_MEMBER,
  ROOMS,
  WRAP,
  outbox,
  unionFilters,
} from "@welshman/util"
import type {Filter} from "@welshman/util"
import type {FollowListReader, RoomListReader} from "@welshman/domain"
import {merged, synced, withGetter} from "@welshman/store"
import {
  FollowLists,
  MessagingRelayLists,
  RelayLists,
  RoomLists,
  Sync,
  makeRoomKey,
} from "@welshman/app"
import {
  app,
  blockedRelayLists,
  blossomServerLists,
  deriveUserItem,
  followLists,
  messagingRelayLists,
  muteLists,
  network,
  profiles,
  relayLists,
  relays,
  roomLists,
  router,
} from "@app/core"
import {LIVEKIT_PARTICIPANTS} from "@app/call"
import {REACTION_KINDS, CONTENT_KINDS, makeCommentFilter} from "@app/content"
import {INDEXER_RELAYS, PLATFORM_RELAYS} from "@app/env"
import {ligaOsGuardioes, relaysDoEspaco} from "@app/mirrors"
import {FEATURED_CONTENT_D} from "@app/featured"
import {decodeRelay} from "@app/relays"
import {Settings} from "@app/settings"
import {kv} from "@app/storage"
import {hasBlossomSupport} from "@app/uploads"

// Whether to sync gift wraps. Unwrapping itself is unconditional, so this is the only
// thing keeping a signer from being asked to decrypt the user's entire DM history.
export const shouldUnwrap = withGetter(
  synced({key: "shouldUnwrap", storage: kv, defaultValue: false}),
)

// Utils

type SyncOpts = {
  url: string
  signal: AbortSignal
  filters: Filter[]
}

// How many times in a row the live subscription may be lost without the relay ever serving it
// before we stop asking. Being served resets the count, so a long session that rides out many
// dropped connections keeps listening.
const LISTEN_ATTEMPTS = 5

// How far back a subscription reaches from the moment the listener started waiting to ask, so
// that nothing published around that moment goes missing.
const LISTEN_OVERLAP = 60

// A refusal that only says we asked before authenticating. `auth-required` is the one the relay
// sends; `restricted` is what a closed relay answers to a socket that hasn't authenticated yet,
// and is only this when the socket really hadn't.
const isRefusedBeforeAuth = (reason: string, url: string) =>
  reason.startsWith("auth-required") ||
  (reason.startsWith("restricted") && app.get().pool.get(url).auth.status !== AuthStatus.Ok)

// A gift wrap's timestamp is deliberately wrong. NIP-59 backdates it by a random amount of up
// to 100,000 seconds -- about 28 hours -- so a relay can't tell when a conversation happened.
// A live subscription that reaches back one minute therefore never matches a wrap that was
// just published: the relay compares the filter against that false date and withholds the
// event. The message only appeared on the next page load, when the pull runs with no lower
// bound. So a filter that asks for wraps reaches back past the whole drift.
const WRAP_DRIFT = 100_000

const listenSince = (filter: Filter, since: number) =>
  Math.max(filter.since || 0, filter.kinds?.includes(WRAP) ? since - WRAP_DRIFT : since)

const withoutLimit = (filter: Filter) => {
  const copy = {...filter}

  delete copy.limit

  return copy
}

// Wait until a subscription can be served: the socket open and, where the relay asks for it, the
// authentication settled. A relay that asks for none never sends a challenge, and after a short
// wait we go ahead. Nothing here throws, and leaving the space (the signal) ends the wait.
const waitUntilListenable = async (url: string, signal: AbortSignal) => {
  const socket = app.get().pool.get(url)

  while (!signal.aborted && socket.status !== SocketStatus.Open) {
    socket.attemptToOpen()

    await poll({
      signal: AbortSignal.timeout(5000),
      condition: () => signal.aborted || socket.status === SocketStatus.Open,
    })
  }

  await poll({
    signal: AbortSignal.timeout(3000),
    condition: () => signal.aborted || socket.auth.status !== AuthStatus.None,
  })

  if (socket.auth.status === AuthStatus.None) return

  await poll({
    signal: AbortSignal.timeout(30_000),
    condition: () =>
      signal.aborted ||
      [AuthStatus.Ok, AuthStatus.Forbidden, AuthStatus.DeniedSignature].includes(
        socket.auth.status,
      ),
  })
}

// The live half of pullAndListen. It used to ask right away, once, and new messages stopped
// arriving while the screen kept saying "Connected". Measured in production on 22/09/2026:
//
// - Everything the page asks a closed relay before authenticating is refused with
//   `auth-required`. Welshman hides that refusal from the caller and replays the request after
//   authenticating, but it only holds on to the last 50 messages (`socketPolicyAuthBuffer`). A
//   member with a slow signer sent about 70; the live request went out among the first, fell off
//   the buffer and was never sent again -- and, the refusal being hidden, nothing here knew.
// - A socket that drops comes back without the subscriptions it carried.
//
// So the listener waits for the socket to authenticate before asking, reaching back to when it
// started waiting so nothing published meanwhile is missed, and asks again the same way whenever
// the subscription is lost.
const listen = ({url, signal, filters}: SyncOpts) => {
  let failures = 0

  const subscribe = (since: number) => {
    if (signal.aborted) return

    const controller = new AbortController()
    const abort = () => controller.abort()
    let lost = false

    signal.addEventListener("abort", abort)

    const resubscribe = () => {
      if (lost || signal.aborted) return

      lost = true
      failures += 1

      signal.removeEventListener("abort", abort)
      controller.abort()

      if (failures <= LISTEN_ATTEMPTS) {
        start(1000)
      }
    }

    network.get().request({
      relays: [url],
      signal: controller.signal,
      filters: unionFilters(
        filters.map(filter => ({
          ...withoutLimit(filter),
          since: listenSince(filter, since),
        })),
      ),
      onEose: () => {
        failures = 0
      },
      onClosed: reason => {
        if (isRefusedBeforeAuth(reason, url)) {
          resubscribe()
        }
      },
      onDisconnect: resubscribe,
    })
  }

  const start = async (delay = 0) => {
    const since = now() - LISTEN_OVERLAP

    if (delay) {
      await sleep(delay)
    }

    await waitUntilListenable(url, signal)

    subscribe(since)
  }

  start()
}

const pullAndListen = async ({url, signal, filters}: SyncOpts) => {
  if (signal.aborted) return

  listen({url, signal, filters})

  // The pull used to go out the moment the socket opened, which is before the relay has
  // authenticated the connection -- and a closed relay refuses what it is asked before that,
  // silently, because the refusal never reaches the caller. The listener learned to wait in
  // 22/09; the pull had not, and it is the pull that carries the small things nobody asks for
  // a second time. The relay roles were missing from every screen for exactly this reason: the
  // member list only survived because the space layout fetches it outright.
  await waitUntilListenable(url, signal)

  if (signal.aborted) return

  app
    .get()
    .use(Sync)
    .pull({relays: [url], filters})
}

const userRoomList = deriveUserItem(RoomLists)

const userRelayList = deriveUserItem(RelayLists)

const userFollowList = deriveUserItem(FollowLists)

const userMessagingRelayList = deriveUserItem(MessagingRelayLists)

const getSpaceUrls = ($roomList: Maybe<RoomListReader>) =>
  PLATFORM_RELAYS.length > 0 ? PLATFORM_RELAYS : ($roomList?.urls() ?? [])

// Relays

const syncRelays = () => {
  for (const url of INDEXER_RELAYS) {
    relays.get().load(url)
  }

  const unsubscribePage = page.subscribe($page => {
    if ($page.params.relay) {
      const url = decodeRelay($page.params.relay)

      relays.get().load(url)
      hasBlossomSupport(url)
    }
  })

  const unsubscribeSpaceUrls = userRoomList.subscribe($roomList => {
    for (const url of $roomList?.urls() ?? []) {
      relays.get().load(url)
    }
  })

  return () => {
    unsubscribePage()
    unsubscribeSpaceUrls()
  }
}

// User data

const syncUserSpaceMembership = (url: string) => {
  const $pubkey = app.get().user?.pubkey
  const controller = new AbortController()

  if ($pubkey) {
    pullAndListen({
      url,
      signal: controller.signal,
      filters: [
        {kinds: [RELAY_ADD_MEMBER], "#p": [$pubkey], limit: 1},
        {kinds: [RELAY_REMOVE_MEMBER], "#p": [$pubkey], limit: 1},
        {kinds: [ROOM_CREATE_PERMISSION], "#p": [$pubkey], limit: 1},
      ],
    })
  }

  return () => controller.abort()
}

const syncUserRoomMembership = (url: string, h: string) => {
  const $pubkey = app.get().user?.pubkey
  const controller = new AbortController()

  if ($pubkey) {
    pullAndListen({
      url,
      signal: controller.signal,
      filters: [
        {kinds: [ROOM_ADD_MEMBER], "#p": [$pubkey], "#h": [h], limit: 1},
        {kinds: [ROOM_REMOVE_MEMBER], "#p": [$pubkey], "#h": [h], limit: 1},
      ],
    })
  }

  return () => controller.abort()
}

const syncUserData = () => {
  const unsubscribersByKey = new Map<string, Unsubscriber>()
  const $pubkey = app.get().user?.pubkey

  const syncRoomList = ($roomList: Maybe<RoomListReader>) => {
    if ($roomList) {
      const keys = new Set<string>()

      for (const url of getSpaceUrls($roomList)) {
        if (!unsubscribersByKey.has(url)) {
          unsubscribersByKey.set(url, syncUserSpaceMembership(url))
        }

        keys.add(url)

        for (const h of $roomList.roomsForUrl(url)) {
          const key = makeRoomKey(url, h)

          if (!unsubscribersByKey.has(key)) {
            unsubscribersByKey.set(key, syncUserRoomMembership(url, h))
          }

          keys.add(key)
        }
      }

      for (const [key, unsubscribe] of unsubscribersByKey.entries()) {
        if (!keys.has(key)) {
          unsubscribersByKey.delete(key)
          unsubscribe()
        }
      }
    }
  }

  const syncUserLists = () => {
    if ($pubkey) {
      blossomServerLists.get().load($pubkey)
      blockedRelayLists.get().load($pubkey)
      followLists.get().load($pubkey)
      roomLists.get().load($pubkey)

      // The room list (kind 10009) is what says whether this person has already joined a
      // space, and the plugin above only looks for it on the author's own write relays. In a
      // closed club it lives on the club's relay, which nobody asks: a fresh browser of
      // someone who is already in the space is shown "Join Space" again, with the room left
      // empty behind it (reproduced in every e2e run since 20/09/2026). So ask the space's
      // own relay for it too.
      if (PLATFORM_RELAYS.length > 0) {
        network.get().load({
          relays: PLATFORM_RELAYS,
          filters: [{kinds: [ROOMS], authors: [$pubkey]}],
        })
      }
      muteLists.get().load($pubkey)
      profiles.get().load($pubkey)
      app.get().use(Settings).load($pubkey)
    }
  }

  const syncFollowNetwork = async ($followList: Maybe<FollowListReader>) => {
    const authors = $followList?.pubkeys() ?? []

    if (authors.length > 0) {
      const scenario = await router.get().resolve(authors.map(author => outbox(author)))

      network.get().load({
        filters: [{kinds: [FOLLOWS, MUTES], authors}],
        relays: scenario.limit(8).getUrls(),
      })
    }
  }

  if ($pubkey) {
    relayLists.get().load($pubkey)
  }

  const unsubscribeRoomList = userRoomList.subscribe(syncRoomList)
  const unsubscribeRelayList = userRelayList.subscribe(syncUserLists)
  const unsubscribeFollowList = userFollowList.subscribe(syncFollowNetwork)

  return () => {
    unsubscribersByKey.forEach(call)
    unsubscribeRoomList()
    unsubscribeRelayList()
    unsubscribeFollowList()
  }
}

// Spaces

const syncSpace = (spaceUrl: string) => {
  const controller = new AbortController()

  // Um espaço pode ser feito de mais de um relay: o do clube e os guardiões, que guardam a
  // mesma conversa. Pedir a todos é o que faz a conversa continuar aparecendo quando um deles
  // não responde -- e é o motivo de os guardiões existirem. Os eventos são os mesmos, com o
  // mesmo id, então o que chega repetido se funde sozinho.
  for (const url of relaysDoEspaco(spaceUrl)) {
    sincronizaUmRelayDoEspaco(url, controller.signal)
  }

  return () => controller.abort()
}

const sincronizaUmRelayDoEspaco = (url: string, signal: AbortSignal) => {
  // Low cardinality we want everything for
  pullAndListen({
    url,
    signal,
    filters: [
      {kinds: [RELAY_MEMBERS, RELAY_ROLE]},
      {kinds: [APP_DATA], "#d": [FEATURED_CONTENT_D]},
    ],
  })

  // Higher cardinality stuff we want as much as we can get
  pullAndListen({
    url,
    signal,
    filters: [
      {
        kinds: [
          ROOM_META,
          ROOM_ADMINS,
          ROOM_MEMBERS,
          ROOM_DELETE,
          LIVEKIT_PARTICIPANTS,
          PINBOARD,
          ROOM_PINS,
        ],
      },
    ],
  })

  // Recent stuff, best effort
  pullAndListen({
    url,
    signal,
    filters: [
      {kinds: [...CONTENT_KINDS, MESSAGE, PIN, ROOM_JOIN, ROOM_LEAVE], since: ago(MONTH)},
      {kinds: [...REACTION_KINDS, POLL_RESPONSE], since: ago(WEEK)},
      makeCommentFilter(CONTENT_KINDS, {since: ago(WEEK)}),
    ],
  })

  // Which sections a space offers is a question about its whole history rather than about the
  // recent window above — a space whose newest poll is a year old still has polls. One event
  // per kind answers it. Like everything else here it waits for the socket to authenticate:
  // a closed relay refuses what it is asked before that, and the refusal is hidden from the
  // caller by the auth buffer, so the answer simply never comes.
  void (async () => {
    await waitUntilListenable(url, signal)

    if (signal.aborted) return

    network.get().load({
      relays: [url],
      signal,
      filters: CONTENT_KINDS.map(kind => ({kinds: [kind], limit: 1})),
    })
  })()
}

const syncSpaces = () => {
  const unsubscribersByUrl = new Map<string, Unsubscriber>()

  const unsubscribe = merged([userRoomList, page]).subscribe(([$roomList, $page]) => {
    const urls = new Set(getSpaceUrls($roomList))
    const currentUrl = $page.params.relay ? decodeRelay($page.params.relay) : undefined

    if (currentUrl) {
      urls.add(currentUrl)
    }

    // Stop syncing removed spaces
    for (const [url, unsubscribe] of unsubscribersByUrl.entries()) {
      if (!urls.has(url)) {
        unsubscribersByUrl.delete(url)
        unsubscribe()
      }
    }

    // Start syncing for new spaces
    for (const url of urls) {
      if (!unsubscribersByUrl.has(url)) {
        unsubscribersByUrl.set(url, syncSpace(url))
      }
    }
  })

  return () => {
    for (const unsubscriber of unsubscribersByUrl.values()) {
      unsubscriber()
    }

    unsubscribe()
  }
}

// DMs

const syncDMRelay = (url: string, pubkey: string) => {
  const controller = new AbortController()

  pullAndListen({
    url,
    signal: controller.signal,
    filters: [{kinds: [WRAP], "#p": [pubkey]}],
  })

  return () => controller.abort()
}

const syncDMs = () => {
  const unsubscribersByUrl = new Map<string, Unsubscriber>()

  let currentPubkey: string | undefined
  let currentShouldUnwrap = false

  const unsubscribeAll = () => {
    for (const [url, unsubscribe] of unsubscribersByUrl.entries()) {
      unsubscribersByUrl.delete(url)
      unsubscribe()
    }
  }

  const subscribeAll = (pubkey: string, urls: string[]) => {
    // Start syncing newly added relays
    for (const url of urls) {
      if (!unsubscribersByUrl.has(url)) {
        unsubscribersByUrl.set(url, syncDMRelay(url, pubkey))
      }
    }

    // Stop syncing removed spaces
    for (const [url, unsubscribe] of unsubscribersByUrl.entries()) {
      if (!urls.includes(url)) {
        unsubscribersByUrl.delete(url)
        unsubscribe()
      }
    }
  }

  const syncPubkey = async ($pubkey: Maybe<string>, $shouldUnwrap: boolean) => {
    if ($pubkey !== currentPubkey) {
      unsubscribeAll()
    }

    currentPubkey = $pubkey
    currentShouldUnwrap = $shouldUnwrap

    if ($pubkey && $shouldUnwrap) {
      await relayLists.get().load($pubkey).catch(noop)
      await messagingRelayLists.get().load($pubkey).catch(noop)

      if (currentPubkey === $pubkey && currentShouldUnwrap === $shouldUnwrap) {
        subscribeAll($pubkey, messagingRelayLists.get().urls($pubkey).get())
      }
    }
  }

  const syncList = () => {
    const $pubkey = app.get().user?.pubkey

    if ($pubkey && shouldUnwrap.get()) {
      subscribeAll($pubkey, messagingRelayLists.get().urls($pubkey).get())
    }
  }

  const unsubscribeUser = merged([app, shouldUnwrap]).subscribe(([$app, $shouldUnwrap]) => {
    syncPubkey($app.user?.pubkey, $shouldUnwrap)
  })

  const unsubscribeList = userMessagingRelayList.subscribe(syncList)

  return () => {
    unsubscribeAll()
    unsubscribeUser()
    unsubscribeList()
  }
}

// Merge all synchronization functions

let unsubscribe: Unsubscriber | undefined

export const syncApplicationData = () => {
  unsubscribe?.()

  // A ponte dos guardiões vem primeiro: ela precisa estar ouvindo antes que o primeiro evento
  // chegue por um deles, senão esse evento fica marcado só com o guardião e não aparece.
  const unsubscribers = [ligaOsGuardioes(), syncRelays(), syncUserData(), syncSpaces(), syncDMs()]

  unsubscribe = () => unsubscribers.forEach(call)

  return () => {
    unsubscribe?.()
    unsubscribe = undefined
  }
}
