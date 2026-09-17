<script lang="ts">
  import {displayUrl} from "@welshman/lib"
  import {preventDefault} from "@lib/html"
  import Spinner from "@lib/components/Spinner.svelte"
  import Button from "@lib/components/Button.svelte"
  import Field from "@lib/components/Field.svelte"
  import LinkRound from "@assets/icons/link-round.svg?dataurl"
  import AltArrowLeft from "@assets/icons/alt-arrow-left.svg?dataurl"
  import AltArrowRight from "@assets/icons/alt-arrow-right.svg?dataurl"
  import Icon from "@lib/components/Icon.svelte"
  import Link from "@lib/components/Link.svelte"
  import Modal from "@lib/components/Modal.svelte"
  import ModalBody from "@lib/components/ModalBody.svelte"
  import ModalHeader from "@lib/components/ModalHeader.svelte"
  import ModalTitle from "@lib/components/ModalTitle.svelte"
  import ModalSubtitle from "@lib/components/ModalSubtitle.svelte"
  import ModalFooter from "@lib/components/ModalFooter.svelte"
  import {PLATFORM_ACCESS_URL, PLATFORM_NAME} from "@app/env"
  import {pushToast} from "@app/toast"
  import {Access, parseInviteLink} from "@app/access"

  type Props = {
    url: string
    callback: () => void
  }

  const {url, callback}: Props = $props()

  const access = new Access(url)

  const back = () => history.back()

  const join = async () => {
    loading = true

    try {
      const claim = parseInviteLink(value)?.claim || value
      const message = await access.attempt(claim)

      if (message) {
        return pushToast({theme: "error", message, timeout: 30_000})
      }

      callback()
    } finally {
      loading = false
    }
  }

  let value = $state("")
  let loading = $state(false)
</script>

{#if PLATFORM_ACCESS_URL}
  <Modal>
    <ModalBody>
      <ModalHeader>
        <ModalTitle>Members Only</ModalTitle>
        <ModalSubtitle
          >{displayUrl(url)} is available to {PLATFORM_NAME} members. Become a member or link your account,
          then come back here.</ModalSubtitle>
      </ModalHeader>
    </ModalBody>
    <ModalFooter>
      <Button class="button button-link" onclick={back}>
        <Icon icon={AltArrowLeft} />
        Go back
      </Button>
      <Link external href={PLATFORM_ACCESS_URL} class="button button-primary">
        Become a member
        <Icon icon={AltArrowRight} />
      </Link>
    </ModalFooter>
  </Modal>
{:else}
  <Modal tag="form" onsubmit={preventDefault(join)}>
    <ModalBody>
      <ModalHeader>
        <ModalTitle>Request Access</ModalTitle>
        <ModalSubtitle
          >Enter an invite code below to request access to {displayUrl(url)}.</ModalSubtitle>
      </ModalHeader>
      <Field>
        {#snippet label()}
          <p>Invite code*</p>
        {/snippet}
        {#snippet input()}
          <label class="input input-group flex w-full items-center gap-2">
            <Icon icon={LinkRound} />
            <input bind:value class="grow" type="text" />
          </label>
        {/snippet}
      </Field>
    </ModalBody>
    <ModalFooter>
      <Button class="button button-link" onclick={back}>
        <Icon icon={AltArrowLeft} />
        Go back
      </Button>
      <Button type="submit" class="button button-primary" disabled={loading}>
        <Spinner {loading}>Join Space</Spinner>
        <Icon icon={AltArrowRight} />
      </Button>
    </ModalFooter>
  </Modal>
{/if}
