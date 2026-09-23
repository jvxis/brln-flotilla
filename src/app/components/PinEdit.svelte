<script lang="ts">
  import {Pin} from "@welshman/domain"
  import {publishAsRelay, publishToRelays} from "@welshman/app"
  import type {PinReader} from "@welshman/domain"
  import PinForm, {type PinFormValues} from "@app/components/PinForm.svelte"
  import {command, user, writer} from "@app/core"
  import {pinToReference, setPinReference} from "@app/pinboards"

  type Props = {
    url: string
    pin: PinReader
  }

  const {url, pin}: Props = $props()

  const submit = async ({title, topics, value, content}: PinFormValues) => {
    const eventWriter = writer(Pin, pin)

    if (!setPinReference(eventWriter, value)) {
      return "Please enter a valid URL or nostr link."
    }

    eventWriter.setTitle(title).setTopics(topics).setContent(content)

    // A link on a collaborative shelf belongs to whoever added it, and is replaced with
    // that same key; the relay-signed ones stay with the relay.
    const thunk = await command(eventWriter).then(
      pin.author() === $user?.pubkey ? publishToRelays([url]) : publishAsRelay(url),
    )

    return thunk.waitForError()
  }
</script>

<PinForm
  {url}
  heading="Edit Link"
  action="Save changes"
  successMessage="Link updated!"
  values={{
    title: pin.title(),
    topics: pin.topics(),
    value: pinToReference(pin),
    content: pin.content(),
  }}
  {submit} />
