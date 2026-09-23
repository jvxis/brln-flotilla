<script lang="ts">
  import {onMount} from "svelte"
  import type {PinboardReader} from "@welshman/domain"
  import AddCircle from "@assets/icons/add-circle.svg?dataurl"
  import Pen from "@assets/icons/pen.svg?dataurl"
  import TrashBin from "@assets/icons/trash-bin-2.svg?dataurl"
  import ShareCircle from "@assets/icons/share-circle.svg?dataurl"
  import Code2 from "@assets/icons/code-2.svg?dataurl"
  import {errorMessage} from "@lib/util"
  import Icon from "@lib/components/Icon.svelte"
  import Button from "@lib/components/Button.svelte"
  import Confirm from "@lib/components/Confirm.svelte"
  import EventInfo from "@app/components/EventInfo.svelte"
  import PinAdd from "@app/components/PinAdd.svelte"
  import PinboardEdit from "@app/components/PinboardEdit.svelte"
  import {deletes} from "@app/core"
  import {deriveUserIsSpaceAdmin} from "@app/management"
  import {shareEvent} from "@app/share"
  import {pushModal} from "@app/modal"
  import {pushToast} from "@app/toast"

  type Props = {
    url: string
    board: PinboardReader
    onClick: () => void
  }

  const {url, board, onClick}: Props = $props()

  const canManage = deriveUserIsSpaceAdmin(url)

  const showInfo = () => pushModal(EventInfo, {url, event: board.event})

  const share = () => shareEvent(url, "Shelf", board.event)

  const addLink = () => pushModal(PinAdd, {url, address: board.address()})

  const edit = () => pushModal(PinboardEdit, {url, board})

  const deleteBoard = async () => {
    try {
      const command = await $deletes.deleteEvent(board.event)
      const error = await command.publishAsRelay(url).then(thunk => thunk.waitForError())

      if (error) {
        pushToast({theme: "error", message: error})
      } else {
        pushToast({message: "Shelf deleted!"})
      }
    } catch (e) {
      console.error(e)
      pushToast({theme: "error", message: errorMessage(e)})
    }
  }

  const confirmDelete = () =>
    pushModal(Confirm, {
      title: "Delete Shelf",
      message: `Delete "${board.title() || "this shelf"}"?`,
      confirm: deleteBoard,
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
      Shelf details
    </Button>
  </li>
  <li>
    <Button onclick={share}>
      <Icon icon={ShareCircle} />
      Share to chat
    </Button>
  </li>
  {#if $canManage || board.collaborative()}
    <li>
      <Button onclick={addLink}>
        <Icon icon={AddCircle} />
        Add link
      </Button>
    </li>
  {/if}
  {#if $canManage}
    <li>
      <Button onclick={edit}>
        <Icon icon={Pen} />
        Edit shelf
      </Button>
    </li>
    <li>
      <Button class="text-error" onclick={confirmDelete}>
        <Icon icon={TrashBin} />
        Delete shelf
      </Button>
    </li>
  {/if}
</ul>
