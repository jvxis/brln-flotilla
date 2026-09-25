<script lang="ts">
  import {Pin} from "@welshman/domain"
  import {Pinboards, publishAsRelay, publishToRelays} from "@welshman/app"
  import PinForm, {type PinFormValues} from "@app/components/PinForm.svelte"
  import {app, command, writer} from "@app/core"
  import {setPinReference} from "@app/pinboards"
  import {relaysDoEspaco} from "@app/mirrors"

  type Props = {
    url: string
    address: string
    reference?: string
  }

  const {url, address, reference}: Props = $props()

  // A shelf tagged "collaborative" takes links from anyone in the space, each signed by
  // whoever added it. That is what lets a member add a link and still be the only one who
  // can change or remove it: a link is replaceable per author, so nobody can touch someone
  // else's. A curated shelf keeps the old behaviour, where the relay signs it and only an
  // admin of the space may ask for that.
  const board = $derived($app.use(Pinboards).get(address))
  const collaborative = $derived(Boolean(board?.collaborative()))

  const refusalMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    if (/unauthorized|restricted|not allowed|forbidden/i.test(message)) {
      return "Only admins of this space can add to the Library. Share the link in a room and an admin can add it."
    }

    return message || "The relay did not add this link."
  }

  const submit = async ({title, topics, value, content}: PinFormValues) => {
    const eventWriter = writer(Pin).setIdentifier().addBoard(address)

    if (!setPinReference(eventWriter, value)) {
      return "Please enter a valid URL or nostr link."
    }

    eventWriter.setTitle(title).setTopics(topics).setContent(content)

    // The library is curated: an item is published with the relay's own key, through the
    // NIP-86 `signevent` method, which only an admin of the space may use. Anyone else gets
    // a refusal thrown from publishAsRelay, and before this it was never caught -- the
    // button simply spun forever (reported by a member on 23/09/2026).
    try {
      const thunk = collaborative
        ? await command(eventWriter).then(publishToRelays(relaysDoEspaco(url)))
        : await command(eventWriter).then(publishAsRelay(url))

      return thunk.waitForError()
    } catch (error) {
      return refusalMessage(error)
    }
  }
</script>

<PinForm
  {url}
  heading="Add Link"
  action="Add link"
  successMessage="Link added!"
  values={{value: reference}}
  {submit} />
