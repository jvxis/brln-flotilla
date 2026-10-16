import {removeUndefined} from "@welshman/lib"
import type {EventContent, TrustedEvent} from "@welshman/util"
import {app, deletes, reactions, relays, wraps} from "@app/core"
import {noteBrlnDirectSent} from "@app/brlnPush"

export type ReactionTarget = {
  url?: string
  h?: string
  // Where to publish, when it isn't just the space's own relay.
  urls?: string[]
}

// A reaction has to travel the same way as the event it's about — protected on relays that
// enforce NIP-70, and tagged into the room the event lives in.
export const publishReaction = async (
  event: TrustedEvent,
  {content, tags}: EventContent,
  {url, h, urls}: ReactionTarget,
) => {
  const protect = url ? await relays.get().hasNip(url, 70) : false
  const command = await reactions.get().react(event, content, writer => {
    writer.addTags(...tags).setProtected(protect)

    if (url && h) {
      writer.setRoom(url, h)
    }
  })

  return command.publishToRelays(urls ?? removeUndefined([url]))
}

export const retractReaction = async (reaction: TrustedEvent, {url, urls}: ReactionTarget) => {
  const protect = url ? await relays.get().hasNip(url, 70) : false
  const command = await deletes.get().deleteEvent(reaction, writer => writer.setProtected(protect))

  return command.publishToRelays(urls ?? removeUndefined([url]))
}

// Chat reactions go out gift-wrapped to the conversation rather than to a relay.
export const publishWrappedReaction = async (
  event: TrustedEvent,
  {content, tags}: EventContent,
  pubkeys: string[],
) => {
  const command = await reactions.get().react(event, content, writer => writer.addTags(...tags))

  noteBrlnDirectSent(app.get().user?.signer)

  return wraps.get().publish({event: command.event, recipients: pubkeys, pow: 16})
}

export const retractWrappedReaction = async (reaction: TrustedEvent, pubkeys: string[]) => {
  const command = await deletes.get().deleteEvent(reaction)

  noteBrlnDirectSent(app.get().user?.signer)

  return wraps.get().publish({event: command.event, recipients: pubkeys, pow: 16})
}
