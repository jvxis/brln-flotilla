<script lang="ts">
  import {onMount} from "svelte"
  import type {PinReader} from "@welshman/domain"
  import Pen from "@assets/icons/pen.svg?dataurl"
  import TrashBin from "@assets/icons/trash-bin-2.svg?dataurl"
  import ShareCircle from "@assets/icons/share-circle.svg?dataurl"
  import Code2 from "@assets/icons/code-2.svg?dataurl"
  import {errorMessage} from "@lib/util"
  import Icon from "@lib/components/Icon.svelte"
  import Button from "@lib/components/Button.svelte"
  import Confirm from "@lib/components/Confirm.svelte"
  import EventInfo from "@app/components/EventInfo.svelte"
  import PinEdit from "@app/components/PinEdit.svelte"
  import {deletes, user} from "@app/core"
  import {deriveUserIsSpaceAdmin} from "@app/management"
  import {shareEvent} from "@app/share"
  import {pushModal} from "@app/modal"
  import {pushToast} from "@app/toast"

  type Props = {
    url: string
    pin: PinReader
    onClick: () => void
  }

  const {url, pin, onClick}: Props = $props()

  const canManage = deriveUserIsSpaceAdmin(url)

  // On a collaborative shelf a link is signed by whoever added it, and only that person can
  // replace or delete it -- the relay enforces that by itself, since a link is replaceable
  // per author. So the menu offers those actions to the owner as well as to an admin.
  const isOwn = $derived(pin.author() === $user?.pubkey)

  const showInfo = () => pushModal(EventInfo, {url, event: pin.event})

  const share = () => shareEvent(url, "Link", pin.event)

  const edit = () => pushModal(PinEdit, {url, pin})

  const deletePin = async () => {
    try {
      const command = await $deletes.deleteEvent(pin.event)
      const thunk = isOwn ? await command.publishToRelays([url]) : await command.publishAsRelay(url)

      const error = await thunk.waitForError()

      if (error) {
        pushToast({theme: "error", message: error})
      } else {
        pushToast({message: "Link deleted!"})
      }
    } catch (e) {
      console.error(e)
      pushToast({theme: "error", message: errorMessage(e)})
    }
  }

  const confirmDelete = () =>
    pushModal(Confirm, {
      title: "Delete Link",
      message: "Delete this link?",
      confirm: deletePin,
    })

  let ul: Element

  onMount(() => {
    ul.addEventListener("click", onClick)
  })
</script>

<ul class="menu whitespace-nowrap rounded-2xl bg-surface p-2" bind:this={ul}>
  <li>
    <Button onclick={showInfo}>
      <Icon icon={Code2} />
      Event details
    </Button>
  </li>
  <li>
    <Button onclick={share}>
      <Icon icon={ShareCircle} />
      Share to chat
    </Button>
  </li>
  {#if $canManage || isOwn}
    <li>
      <Button onclick={edit}>
        <Icon icon={Pen} />
        Edit link
      </Button>
    </li>
    <li>
      <Button class="text-error" onclick={confirmDelete}>
        <Icon icon={TrashBin} />
        Delete link
      </Button>
    </li>
  {/if}
</ul>
