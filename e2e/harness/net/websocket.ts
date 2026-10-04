import type {BrowserContext, WebSocketRoute} from "@playwright/test"
import {call, parseJson} from "@welshman/lib"
import {normalizeRelayUrl} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {ClientMessageType, RelayMessageType, isClientEvent, isClientReq} from "@welshman/net"
import type {ClientMessage, RelayMessage} from "@welshman/net"
import type {RelayConnection} from "../zooid/types"
import type {Zooid} from "../zooid/relay"
import {makeContextStore} from "./context"
import {isDevServerUrl} from "./http"

export type Direction = "toRelay" | "toClient"

export type TranscriptEntry = {
  url: string
  direction: Direction
  message: ClientMessage | RelayMessage
}

// An event the client published, and the relay it went to.
export type PublishedEvent = {
  url: string
  event: TrustedEvent
}

// A subscription the client holds open on one socket, and how to end it from the relay's side.
type OpenSubscription = {
  url: string
  id: string
  filters: unknown[]
  close: (reason: string) => void
}

type Traffic = {
  transcript: TranscriptEntry[]
  leaks: Set<string>
  forgotten: Set<string>
  silenced: Set<string>
  subscriptions: Map<string, OpenSubscription>
  dropping: Array<(url: string, message: RelayMessage) => boolean>
  rewriting: Array<(url: string, message: RelayMessage) => RelayMessage | undefined>
}

const trafficStore = makeContextStore<Traffic>("installWebSocketRoutes")

// A relay that holds nothing. REQs get an immediate EOSE and events are accepted and dropped, so a
// leak fails on the assertion that names it rather than on a timeout three layers away.
const openEmptyRelay = (): RelayConnection => {
  let listener: (message: RelayMessage) => void = () => undefined

  return {
    onMessage(f) {
      listener = f
    },
    send(message) {
      if (isClientReq(message)) {
        listener([RelayMessageType.Eose, message[1]])
      } else if (isClientEvent(message)) {
        listener([RelayMessageType.Ok, message[1].id, true, ""])
      }
    },
    close() {},
  }
}

// A relay that takes the socket and then says nothing at all: no events, no eose, no closed. It is
// the fault a client cannot see, since a request it never answers is indistinguishable from one it
// is still working on, and the only way out is the caller's own deadline.
const openSilentRelay = (): RelayConnection => ({
  onMessage() {},
  send() {},
  close() {},
})

const serve = (traffic: Traffic, zooid: Zooid, route: WebSocketRoute) => {
  const url = normalizeRelayUrl(route.url())
  const connection = call(() => {
    if (traffic.silenced.has(url)) {
      return openSilentRelay()
    }

    if (traffic.forgotten.has(url)) {
      return openEmptyRelay()
    }

    const relay = zooid.relays.get(url)

    if (relay) {
      return relay.connect()
    }

    traffic.leaks.add(url)

    return openEmptyRelay()
  })

  // Subscriptions are keyed per socket, since two sockets may reuse an id.
  const socketKey = `${url}#${Math.random()}`
  const subscriptionKey = (id: string) => `${socketKey}:${id}`

  connection.onMessage(message => {
    if (traffic.dropping.some(drop => drop(url, message))) return

    for (const rewrite of traffic.rewriting) {
      message = rewrite(url, message) ?? message
    }

    traffic.transcript.push({url, direction: "toClient", message})
    route.send(JSON.stringify(message))
  })

  route.onMessage(frame => {
    const message = parseJson<ClientMessage>(frame.toString())

    if (message) {
      traffic.transcript.push({url, direction: "toRelay", message})

      if (isClientReq(message)) {
        const [, id, ...filters] = message as unknown as [string, string, ...unknown[]]

        traffic.subscriptions.set(subscriptionKey(id), {
          url,
          id,
          filters,
          close: reason => {
            traffic.subscriptions.delete(subscriptionKey(id))
            connection.send([ClientMessageType.Close, id] as ClientMessage)
            route.send(JSON.stringify([RelayMessageType.Closed, id, reason]))
          },
        })
      } else if (message[0] === ClientMessageType.Close) {
        traffic.subscriptions.delete(subscriptionKey(message[1] as string))
      }

      connection.send(message)
    }
  })

  route.onClose(() => {
    for (const key of [...traffic.subscriptions.keys()]) {
      if (key.startsWith(`${socketKey}:`)) traffic.subscriptions.delete(key)
    }

    connection.close()
  })
}

/**
 * The single interception point for relay traffic. It goes on the context rather than a page, so
 * every page in it is covered including ones opened later, and it is safe to call before any page
 * exists.
 *
 * Vite's hmr socket is the one url left alone. Everything else is answered from this process, and
 * a url that is not one of the container's virtual relays is served by an empty relay and recorded
 * as a leak.
 */
export const installWebSocketRoutes = (context: BrowserContext, zooid: Zooid) => {
  const traffic = trafficStore.set(context, {
    transcript: [],
    leaks: new Set(),
    forgotten: new Set(),
    silenced: new Set(),
    subscriptions: new Map(),
    dropping: [],
    rewriting: [],
  })

  return context.routeWebSocket(
    url => !isDevServerUrl(url),
    route => serve(traffic, zooid, route),
  )
}

export const getTranscript = (context: BrowserContext) => trafficStore.get(context).transcript

// Every event this context put on the wire, oldest first, with the relay it went to. One event
// published to three relays is three entries.
export const getPublished = (context: BrowserContext): PublishedEvent[] =>
  getTranscript(context)
    .filter(
      ({direction, message}) => direction === "toRelay" && message[0] === ClientMessageType.Event,
    )
    .map(({url, message}) => ({url, event: message[1] as TrustedEvent}))

// The same, narrowed to one kind, which is how a spec asks what the client published rather than
// what it rendered.
export const getPublishedEvents = (context: BrowserContext, kind: number) =>
  getPublished(context)
    .filter(({event}) => event.kind === kind)
    .map(({event}) => event)

// Makes a relay answer like one that never held anything, without its url becoming a leak. `serve`
// resolves a relay once, at open, so sockets already open keep theirs and the drop takes effect on
// the next connection. A reload is what gives it one.
export const forgetRelay = (context: BrowserContext, url: string) =>
  trafficStore.get(context).forgotten.add(normalizeRelayUrl(url))

// Makes a relay answer nothing at all, without its url becoming a leak. Silence is all this relay
// is, so it needs no tenant behind it: the url never reaches the container, and naming it here is
// what says the app was meant to open it. Resolved at open, like `forgetRelay`, so a spec that
// wants a page to boot into the fault passes `silent` to `as` instead of calling this.
export const silenceRelay = (context: BrowserContext, url: string) =>
  trafficStore.get(context).silenced.add(normalizeRelayUrl(url))

// Every frame in both directions, oldest first. Attach it to a failing test to see what the client
// actually said, and to whom.
export const formatTranscript = (context: BrowserContext) =>
  getTranscript(context)
    .map(
      ({url, direction, message}) =>
        `${direction === "toRelay" ? ">>" : "<<"} ${url} ${JSON.stringify(message)}`,
    )
    .join("\n")

export const assertNoLeaks = (context: BrowserContext) => {
  const {leaks} = trafficStore.get(context)

  if (leaks.size > 0) {
    throw new Error(
      [
        `The app opened a websocket to ${leaks.size} url(s) the scenario never created:`,
        ...Array.from(leaks).map(url => `  ${url}`),
      ].join("\n"),
    )
  }
}

// The relay ends every open subscription whose filters match, with a CLOSED the client did not ask
// for, the way a relay does when it restarts a feed or sheds load. Returns how many it closed.
export const closeSubscriptions = (
  context: BrowserContext,
  matches: (filters: unknown[]) => boolean,
  reason = "error: the relay closed this subscription",
) => {
  const open = [...trafficStore.get(context).subscriptions.values()].filter(sub =>
    matches(sub.filters),
  )

  for (const sub of open) {
    sub.close(reason)
  }

  return open.length
}

// Messages from the relays that never reach the client while the returned function is not called,
// like events lost on a connection that dropped and came back.
export const dropFromRelays = (
  context: BrowserContext,
  drop: (url: string, message: RelayMessage) => boolean,
) => {
  const {dropping} = trafficStore.get(context)

  dropping.push(drop)

  return () => {
    dropping.splice(dropping.indexOf(drop), 1)
  }
}

// Messages from the relays that reach the client changed: the function returns the replacement, or
// nothing to let the message through as it was. Returns the function that stops it.
export const rewriteFromRelays = (
  context: BrowserContext,
  rewrite: (url: string, message: RelayMessage) => RelayMessage | undefined,
) => {
  const {rewriting} = trafficStore.get(context)

  rewriting.push(rewrite)

  return () => {
    rewriting.splice(rewriting.indexOf(rewrite), 1)
  }
}
