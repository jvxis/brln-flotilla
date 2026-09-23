<script lang="ts">
  import {Pin} from "@welshman/domain"
  import {publishAsRelay} from "@welshman/app"
  import PinForm, {type PinFormValues} from "@app/components/PinForm.svelte"
  import {command, writer} from "@app/core"
  import {setPinReference} from "@app/pinboards"

  type Props = {
    url: string
    address: string
    reference?: string
  }

  const {url, address, reference}: Props = $props()

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
      const thunk = await command(eventWriter).then(publishAsRelay(url))

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
