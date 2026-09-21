<script module lang="ts">
  // Why a zap can't go through. The three read differently to a member, and only the
  // first is about the recipient having nothing set up: a failed lookup says nothing
  // about their wallet, and an address without Nostr zaps can still be paid directly.
  export type ZapperProblem = "no-address" | "no-nostr" | "unreachable"
</script>

<script lang="ts">
  import {Profiles} from "@welshman/app"
  import AltArrowLeft from "@assets/icons/alt-arrow-left.svg?dataurl"
  import Icon from "@lib/components/Icon.svelte"
  import Button from "@lib/components/Button.svelte"
  import ModalHeader from "@lib/components/ModalHeader.svelte"
  import ModalTitle from "@lib/components/ModalTitle.svelte"
  import ModalFooter from "@lib/components/ModalFooter.svelte"
  import Modal from "@lib/components/Modal.svelte"
  import ModalBody from "@lib/components/ModalBody.svelte"
  import ProfileLink from "@app/components/ProfileLink.svelte"
  import {app} from "@app/core"

  type Props = {
    url?: string
    pubkey: string
    problem: ZapperProblem
  }

  const {pubkey, problem}: Props = $props()

  // The address as the member typed it in their profile, so whoever is zapping can
  // still pay it from a wallet when the chat can't.
  const values = $app.use(Profiles).get(pubkey)?.values as Record<string, unknown> | undefined
  const address = typeof values?.lud16 === "string" ? values.lud16 : undefined

  const back = () => history.back()
</script>

<Modal>
  <ModalBody>
    <ModalHeader>
      <ModalTitle>Unable to Zap</ModalTitle>
    </ModalHeader>
    {#if problem === "no-address"}
      <p>
        Zapping <ProfileLink {pubkey} class="text-primary!" /> isn't possible because they haven't
        set up a Lightning address yet.
      </p>
    {:else if problem === "no-nostr"}
      <p>
        <ProfileLink {pubkey} class="text-primary!" /> has a Lightning address{#if address}, <strong
            >{address}</strong
          >{/if}, but it didn't confirm that it accepts Nostr zaps, so a zap here couldn't show up
        in the chat. You can still pay that address from your wallet.
      </p>
    {:else}
      <p>
        We couldn't check <ProfileLink {pubkey} class="text-primary!" />'s Lightning address right
        now. That doesn't mean they can't receive payments &mdash; try again in a moment.
      </p>
    {/if}
  </ModalBody>
  <ModalFooter>
    <Button class="button button-link" onclick={back}>
      <Icon icon={AltArrowLeft} />
      Go back
    </Button>
  </ModalFooter>
</Modal>
