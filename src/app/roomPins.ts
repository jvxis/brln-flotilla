import {derived, readable} from "svelte/store"
import type {Readable} from "svelte/store"
import {getIdFilters, getIdOrAddress, sortEventsDesc} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {network, roomPinLists} from "@app/core"
import {deriveEventsForUrl} from "@app/repository"

export const deriveRoomPinnedEvents = (url: string, h: string): Readable<TrustedEvent[]> =>
  readable<TrustedEvent[]>([], set => {
    const controller = new AbortController()

    roomPinLists.get().loadForRoom(url, h, controller.signal)

    const unsubscribe = derived<Readable<string[]>, TrustedEvent[]>(
      roomPinLists.get().pins(url, h).$,
      ($pins, setEvents) => {
        if ($pins.length === 0) {
          setEvents([])

          return () => {}
        }

        const filters = getIdFilters($pins)

        network.get().load({relays: [url], filters, signal: controller.signal})

        return deriveEventsForUrl(url, filters).subscribe($events => {
          const byPin = new Map(
            $events.flatMap(event => [
              [event.id, event],
              [getIdOrAddress(event), event],
            ]),
          )

          // Newest first, rather than in the order things were pinned. A room's pins are
          // announcements, and the one that matters is the last one: the banner opens on it and
          // the list reads like the room does, from the top.
          setEvents(
            sortEventsDesc(
              $pins.flatMap(pin => {
                const event = byPin.get(pin)

                return event ? [event] : []
              }),
            ),
          )
        })
      },
    ).subscribe(set)

    return () => {
      controller.abort()
      unsubscribe()
    }
  })
