<script lang="ts">
  import {onMount} from "svelte"
  import type {Snippet} from "svelte"
  import type {TrustedEvent} from "@welshman/util"
  import {COMMENT} from "@welshman/util"
  import GalleryWide from "@assets/icons/gallery-wide.svg?dataurl"
  import ShareCircle from "@assets/icons/share-circle.svg?dataurl"
  import Code2 from "@assets/icons/code-2.svg?dataurl"
  import TrashBin2 from "@assets/icons/trash-bin-2.svg?dataurl"
  import Danger from "@assets/icons/danger.svg?dataurl"
  import Button from "@lib/components/Button.svelte"
  import Confirm from "@lib/components/Confirm.svelte"
  import Icon from "@lib/components/Icon.svelte"
  import EventInfo from "@app/components/EventInfo.svelte"
  import Report from "@app/components/Report.svelte"
  import EventDeleteConfirm from "@app/components/EventDeleteConfirm.svelte"
  import PinboardSelect from "@app/components/PinboardSelect.svelte"
  import {shareEvent} from "@app/share"
  import {deriveUserIsSpaceAdmin} from "@app/management"
  import {pushModal} from "@app/modal"
  import {pushToast} from "@app/toast"
  import {Pinboards} from "@welshman/app"
  import {app, relayManagement, relays, user} from "@app/core"

  type Props = {
    url: string
    noun: string
    event: TrustedEvent
    onClick: () => void
    customActions?: Snippet
  }

  const {url, noun, event, onClick, customActions}: Props = $props()

  const isRoot = event.kind !== COMMENT
  const userIsAdmin = deriveUserIsSpaceAdmin(url)

  // A shelf tagged "collaborative" takes links from anyone in the space, so the action is
  // offered to members too -- on a curated shelf only an admin can ask the relay to sign.
  const spaceRelay = $relays.one(url)
  const spaceBoards = $derived($app.use(Pinboards).forAuthor($spaceRelay?.self ?? "").$)
  const spaceTakesLinks = $derived($spaceBoards.some(board => board.collaborative()))

  const report = () => pushModal(Report, {url, event})

  const showInfo = () => pushModal(EventInfo, {url, event})

  const addToLibrary = () => pushModal(PinboardSelect, {url, event})

  const share = () => shareEvent(url, noun, event)

  const showDelete = () => pushModal(EventDeleteConfirm, {url, event})

  const showAdminDelete = () =>
    pushModal(Confirm, {
      title: `Delete ${noun}`,
      message: `Are you sure you want to delete this ${noun.toLowerCase()} from the space?`,
      confirm: async () => {
        const {error} = await $relayManagement.forUrl(url).banEvent(event.id)

        if (error) {
          pushToast({theme: "error", message: error})
        } else {
          pushToast({message: "Event has successfully been deleted!"})
          $app.repository.removeEvent(event.id)
          history.back()
        }
      },
    })

  let ul: Element

  onMount(() => {
    ul.addEventListener("click", onClick)
  })
</script>

<ul class="menu whitespace-nowrap rounded-2xl bg-surface p-2" bind:this={ul}>
  <li>
    <Button onclick={showInfo}>
      <Icon size={4} icon={Code2} />
      {noun} Details
    </Button>
  </li>
  {#if isRoot}
    <li>
      <Button onclick={share}>
        <Icon size={4} icon={ShareCircle} />
        Share to Chat
      </Button>
    </li>
  {/if}
  {#if $userIsAdmin || spaceTakesLinks}
    <li>
      <Button onclick={addToLibrary}>
        <Icon size={4} icon={GalleryWide} />
        Add to Library
      </Button>
    </li>
  {/if}
  {@render customActions?.()}
  {#if event.pubkey === $user.pubkey}
    <li>
      <Button onclick={showDelete} class="text-error">
        <Icon size={4} icon={TrashBin2} />
        Delete {noun}
      </Button>
    </li>
  {:else}
    <li>
      <Button class="text-error" onclick={report}>
        <Icon size={4} icon={Danger} />
        Report Content
      </Button>
    </li>
    {#if $userIsAdmin}
      <li>
        <Button class="text-error" onclick={showAdminDelete}>
          <Icon size={4} icon={TrashBin2} />
          Delete {noun}
        </Button>
      </li>
    {/if}
  {/if}
</ul>
