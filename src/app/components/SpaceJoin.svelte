<script lang="ts">
  import {onDestroy, onMount} from "svelte"
  import {maybe, sleep} from "@welshman/lib"
  import {preventDefault} from "@lib/html"
  import AltArrowLeft from "@assets/icons/alt-arrow-left.svg?dataurl"
  import AltArrowRight from "@assets/icons/alt-arrow-right.svg?dataurl"
  import Icon from "@lib/components/Icon.svelte"
  import Button from "@lib/components/Button.svelte"
  import Link from "@lib/components/Link.svelte"
  import Spinner from "@lib/components/Spinner.svelte"
  import Modal from "@lib/components/Modal.svelte"
  import ModalBody from "@lib/components/ModalBody.svelte"
  import ModalFooter from "@lib/components/ModalFooter.svelte"
  import RelaySummary from "@app/components/RelaySummary.svelte"
  import SpaceAccessRequest from "@app/components/SpaceAccessRequest.svelte"
  import SpaceJoinNotifications from "@app/components/SpaceJoinNotifications.svelte"
  import SpaceJoinStatus from "@app/components/SpaceJoinStatus.svelte"
  import {Access, membersOnly} from "@app/access"
  import {PLATFORM_ACCESS_URL} from "@app/env"
  import {pushModal} from "@app/modal"
  import {pushToast} from "@app/toast"
  import {goToSpace} from "@app/routes"

  type Props = {
    url: string
  }

  const {url}: Props = $props()

  const access = new Access(url)

  const back = () => history.back()

  // A platform with its own access page (the club: "Liberar meu acesso" in Services) grants access
  // there, not through a join request to the relay. So a refused newcomer is sent straight to that
  // page, and the chat keeps asking in the background: the relay admits a new registration within
  // about a minute, and the member shouldn't have to know to reload. Measured on 28/09/2026: before
  // this, a newcomer saw a silent page for half a minute, then an English error, then a button that
  // opened a second modal before reaching the platform's dashboard.
  const RETRY_EVERY = 20_000
  const RETRY_FOR = 5 * 60_000

  let stopped = false

  const enter = async () => {
    loading = true

    try {
      await access.completeJoin(notifications)

      pushToast({message: "Welcome to the space!"})
      await goToSpace(url, {replaceState: true})
    } catch (e) {
      console.error("Failed to join space:", e)
      pushToast({theme: "error", message: "Failed to join space. Please try again."})
    } finally {
      loading = false
    }
  }

  const join = async () => {
    if (error) {
      return pushModal(SpaceAccessRequest, {url, callback: back})
    }

    await enter()
  }

  const keepTrying = async () => {
    const until = Date.now() + RETRY_FOR

    while (!stopped && error && Date.now() < until) {
      await sleep(RETRY_EVERY)

      if (stopped) return

      retrying = true
      access.clearRestricted()

      const next = await access.attempt()

      retrying = false

      if (!next) {
        error = undefined
        pushToast({message: "Acesso liberado! Access granted."})

        return enter()
      }
    }
  }

  let error = $state(maybe<string>())
  let loading = $state(true)
  let retrying = $state(false)
  let notifications = $state(true)

  // The relay's refusal arrives well before the join attempt finishes, so say so as soon as it
  // does, rather than leaving the spinner up
  const unsubscribe = access.authError.subscribe($authError => {
    if (PLATFORM_ACCESS_URL && loading && $authError?.includes("not a member of this relay")) {
      error = membersOnly()
      loading = false
    }
  })

  onMount(async () => {
    const result = await access.attempt()

    if (!stopped) {
      error = result
      loading = false

      if (error && PLATFORM_ACCESS_URL) {
        keepTrying()
      }
    }
  })

  onDestroy(() => {
    stopped = true
    unsubscribe()
  })
</script>

<Modal label="Join space" tag="form" onsubmit={preventDefault(join)}>
  <ModalBody>
    <RelaySummary {url} />
    <SpaceJoinNotifications bind:notifications />
    {#if error}
      <SpaceJoinStatus {url} {error} />
      {#if PLATFORM_ACCESS_URL}
        <p class="text-sm opacity-75">
          {#if retrying}
            Verificando se o acesso já foi liberado… Checking again…
          {:else}
            O chat verifica de novo sozinho a cada 20 segundos. The chat checks again every 20
            seconds.
          {/if}
        </p>
      {/if}
    {/if}
  </ModalBody>
  <ModalFooter>
    <Button class="button button-link" onclick={back} disabled={loading}>
      <Icon icon={AltArrowLeft} />
      Go back
    </Button>
    {#if error && PLATFORM_ACCESS_URL}
      <Link external href={PLATFORM_ACCESS_URL} class="button button-primary">
        Liberar meu acesso
        <Icon icon={AltArrowRight} />
      </Link>
    {:else}
      <Button type="submit" class="button button-primary" disabled={loading}>
        <Spinner {loading}>
          {error ? "Request Access" : "Join Space"}
        </Spinner>
        <Icon icon={AltArrowRight} />
      </Button>
    {/if}
  </ModalFooter>
</Modal>
