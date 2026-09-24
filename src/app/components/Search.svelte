<script lang="ts">
  import {MESSAGE} from "@welshman/util"
  import type {TrustedEvent} from "@welshman/util"
  import {publish} from "@welshman/app"
  import Server from "@assets/icons/server.svg?dataurl"
  import Icon from "@lib/components/Icon.svelte"
  import Badge from "@lib/components/Badge.svelte"
  import Button from "@lib/components/Button.svelte"
  import Modal from "@lib/components/Modal.svelte"
  import ModalHeader from "@lib/components/ModalHeader.svelte"
  import ModalTitle from "@lib/components/ModalTitle.svelte"
  import ModalSubtitle from "@lib/components/ModalSubtitle.svelte"
  import RelayList from "@app/components/RelayList.svelte"
  import RelayName from "@app/components/RelayName.svelte"
  import SearchBody from "@app/components/SearchBody.svelte"
  import {CONTENT_KINDS} from "@app/content"
  import {app, relays, searchRelayLists, user, userSearchRelayUrls} from "@app/core"
  import {pushModal} from "@app/modal"
  import {deriveUserSpaceMembers, userSpaceUrls} from "@app/rooms"

  const filter = {kinds: [MESSAGE, ...CONTENT_KINDS]}

  // This search reaches further than the spaces it names: for people it queries the search
  // relays and keeps whatever comes back, which in a closed club means strangers from the open
  // network. So the people it offers are the members of the spaces being searched. Someone who
  // is in no space has no list to filter by, and then nothing is filtered.
  const spaceMembers = deriveUserSpaceMembers()

  const members = $derived($userSpaceUrls.length > 0 ? $spaceMembers : undefined)

  const getSpaceUrl = (event: TrustedEvent) =>
    $userSpaceUrls.find(url => $app.tracker.getRelays(event.id).has(url))

  const showRelays = () =>
    pushModal(RelayList, {
      title: "Search Relays",
      subtitle: "Relays that support searching for profiles and public notes.",
      relays: $searchRelayLists.urls($user.pubkey).$,
      addRelay: (url: string) => $searchRelayLists.addUrl(url).then(publish),
      removeRelay: (url: string) => $searchRelayLists.removeUrl(url).then(publish),
      matchRelay: (url: string) => Boolean($relays.get(url)?.hasNip(50)),
    })
</script>

<Modal class="flex flex-col gap-2">
  <ModalHeader>
    <ModalTitle>Search</ModalTitle>
    <ModalSubtitle>across all your spaces</ModalSubtitle>
  </ModalHeader>
  <SearchBody placeholder="Search your spaces..." relays={$userSpaceUrls} {filter} {members}>
    {#snippet empty()}
      {@const spaces = $userSpaceUrls.length}
      {@const extras = $userSearchRelayUrls.length}
      <div class="flex flex-col items-center gap-2 py-12 text-center">
        <p class="text-content-muted text-sm">
          Searching {spaces}
          {spaces === 1 ? "space" : "spaces"}{#if extras > 0}, plus {extras}
            extra {extras === 1 ? "relay" : "relays"} for people{/if}.
        </p>
        <Button class="button button-link button-sm" onclick={showRelays}>
          <Icon size={4} icon={Server} />
          Manage search relays
        </Button>
      </div>
    {/snippet}
    {#snippet badges(event)}
      {@const url = getSpaceUrl(event)}
      {#if url}
        <Badge variant="neutral">
          <RelayName {url} />
        </Badge>
      {/if}
    {/snippet}
  </SearchBody>
</Modal>
