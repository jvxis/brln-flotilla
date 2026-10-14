import {derived, readable} from "svelte/store"
import type {Unsubscriber} from "svelte/store"
import {call, filter, first, on, spec} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {matchFilters, sortEventsDesc} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"
import type {Repository, RepositoryUpdate, Tracker} from "@welshman/net"
import * as store from "@welshman/store"
import {Network, Relays} from "@welshman/app"
import {app, fromApp} from "@app/core"

// Events

export const deriveEvent = (idOrAddress: string, relays: string[] = []) =>
  fromApp($app =>
    store.makeDeriveEvent({
      repository: $app.repository,
      includeDeleted: true,
      onDerive: (filters: Filter[], hints: string[]) =>
        $app.use(Network).load({filters, relays: hints}),
    })(idOrAddress, relays),
  )

export const deriveEventsById = (filters: Filter[] = [{}]) =>
  fromApp($app => store.deriveEventsById({repository: $app.repository, filters}))

export const deriveEvents = (filters: Filter[] = [{}]) =>
  store.deriveEventsDesc(deriveEventsById(filters))

export const deriveIsDeleted = (event: TrustedEvent) =>
  fromApp($app => store.deriveIsDeleted($app.repository, event))

// Events on a relay

type ForUrl = {
  url: string
  filters: Filter[]
  tracker: Tracker
  repository: Repository
  includeDeleted?: boolean
}

// A filter the repository can answer from one of its small indexes: an author or a single-letter
// tag, and no limit, which would have to be counted among this relay's events rather than all of them.
const isNarrow = (filter: Filter) =>
  !filter.limit &&
  !filter.ids &&
  (Boolean(filter.authors?.length) ||
    Object.keys(filter).some(key => key.length === 2 && key.startsWith("#")))

// The events on one relay that match the filters. Welshman asks the repository for "these filters,
// among every id this relay ever sent", and the repository answers an `ids` filter first: it gathers
// all of the relay's events, sorts them and checks each one for a deletion before it even looks at
// the rest of the filter. Every message on screen asks this for its own threads (RoomItem), so a
// room of a few hundred messages paid for the whole history the tab had loaded, again on every
// room switch; switching rooms went from 0.2 s to 1.7 s after a few laps on the test VM (14/10/2026),
// and only a reload brought it back. A narrow filter asks the repository through its own index and
// keeps what came from this relay, which is the same answer; anything else goes the welshman way.
const queryForUrl = ({url, filters, tracker, repository, includeDeleted}: ForUrl) => {
  if (!filters.every(isNarrow)) {
    return store.getEventsByIdForUrl({url, filters, tracker, repository, includeDeleted})
  }

  const eventsById = new Map<string, TrustedEvent>()

  for (const event of repository.query(filters, {includeDeleted})) {
    if (tracker.hasRelay(event.id, url)) {
      eventsById.set(event.id, event)
    }
  }

  return eventsById
}

// welshman's deriveEventsByIdForUrl, answering its first query and every reset with queryForUrl.
const deriveForUrl = (options: ForUrl) => {
  const {url, filters, tracker, repository, includeDeleted} = options
  let eventsById = queryForUrl(options)

  return readable(eventsById, set => {
    const reset = () => {
      eventsById = queryForUrl(options)
      set(eventsById)
    }

    reset()

    const unsubscribers = [
      on(repository, "update", ({added, removed}: RepositoryUpdate) => {
        let dirty = false

        for (const event of added) {
          if (tracker.hasRelay(event.id, url) && matchFilters(filters, event)) {
            eventsById.set(event.id, event)
            dirty = true
          }
        }

        if (!includeDeleted) {
          for (const id of removed) {
            if (eventsById.delete(id)) {
              dirty = true
            }
          }
        }

        if (dirty) {
          set(eventsById)
        }
      }),
      on(tracker, "add", (id: string, trackedUrl: string) => {
        if (trackedUrl === url) {
          const event = repository.getEvent(id)

          if (event && tracker.hasRelay(id, trackedUrl) && matchFilters(filters, event)) {
            eventsById.set(id, event)
            set(eventsById)
          }
        }
      }),
      on(tracker, "remove", (id: string, trackedUrl: string) => {
        if (trackedUrl === url && eventsById.delete(id)) {
          set(eventsById)
        }
      }),
      on(tracker, "load", reset),
      on(tracker, "clear", reset),
    ]

    return () => unsubscribers.forEach(call)
  })
}

export const getEventsForUrl = (url: string, filters: Filter[] = [{}]) =>
  queryForUrl({url, filters, tracker: app.get().tracker, repository: app.get().repository}).values()

export const deriveEventsByIdForUrl = (url: string, filters: Filter[] = [{}]) =>
  fromApp($app => deriveForUrl({url, filters, tracker: $app.tracker, repository: $app.repository}))

export const deriveEventsForUrl = (url: string, filters: Filter[] = [{}]) =>
  store.deriveArray(deriveEventsByIdForUrl(url, filters))

export const deriveEventsByIdByUrl = (filters: Filter[] = [{}]) =>
  fromApp($app =>
    store.deriveEventsByIdByUrl({filters, tracker: $app.tracker, repository: $app.repository}),
  )

export const deriveRelaySignedEvents = (url: string, filters: Filter[] = [{}]) =>
  derived(
    [fromApp($app => $app.use(Relays).one(url)), deriveEventsForUrl(url, filters)],
    ([$relay, $events]) => filter(spec({pubkey: $relay?.self}), $events as TrustedEvent[]),
  )

// The most recent event held from one author.

const latestByPubkey = new Map<string, Maybe<TrustedEvent>>()

const latestSubscribers = new Map<string, Set<(event: Maybe<TrustedEvent>) => void>>()

let latestUnsubscriber: Maybe<Unsubscriber>

const readLatest = (pubkey: string) =>
  first(sortEventsDesc(app.get().repository.query([{authors: [pubkey]}])))

export const deriveLatestEvent = (pubkey: string) =>
  readable<Maybe<TrustedEvent>>(undefined, set => {
    let subscribers = latestSubscribers.get(pubkey)

    if (!subscribers) {
      subscribers = new Set()
      latestSubscribers.set(pubkey, subscribers)
      latestByPubkey.set(pubkey, readLatest(pubkey))
    }

    subscribers.add(set)
    set(latestByPubkey.get(pubkey))

    latestUnsubscriber ??= on(app.get().repository, "update", ({added, removed}) => {
      const touched = new Set<string>()

      for (const event of added) {
        if (latestSubscribers.has(event.pubkey)) {
          const current = latestByPubkey.get(event.pubkey)

          if (!current || event.created_at > current.created_at) {
            latestByPubkey.set(event.pubkey, event)
            touched.add(event.pubkey)
          }
        }
      }

      // A removal can take the very event a row is showing, so that author has to be looked up
      // again rather than just dropped
      for (const [author, event] of latestByPubkey) {
        if (event && removed.has(event.id)) {
          latestByPubkey.set(author, readLatest(author))
          touched.add(author)
        }
      }

      for (const author of touched) {
        for (const subscriber of latestSubscribers.get(author) || []) {
          subscriber(latestByPubkey.get(author))
        }
      }
    })

    return () => {
      subscribers.delete(set)

      if (subscribers.size === 0) {
        latestSubscribers.delete(pubkey)
        latestByPubkey.delete(pubkey)

        if (latestSubscribers.size === 0) {
          latestUnsubscriber?.()
          latestUnsubscriber = undefined
        }
      }
    }
  })
