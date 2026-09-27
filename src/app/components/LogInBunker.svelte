<script lang="ts">
  import cx from "classnames"
  import {sleep} from "@welshman/lib"
  import {Capacitor} from "@capacitor/core"
  import {onMount, onDestroy} from "svelte"
  import type {Nip46ResponseWithResult} from "@welshman/signer"
  import {Nip46Broker} from "@welshman/signer"
  import {makeSecret} from "@welshman/util"
  import {nip01, nip46, toSession} from "@welshman/app"
  import {preventDefault} from "@lib/html"
  import Spinner from "@lib/components/Spinner.svelte"
  import Button from "@lib/components/Button.svelte"
  import AltArrowLeft from "@assets/icons/alt-arrow-left.svg?dataurl"
  import AltArrowRight from "@assets/icons/alt-arrow-right.svg?dataurl"
  import Icon from "@lib/components/Icon.svelte"
  import Modal from "@lib/components/Modal.svelte"
  import ModalBody from "@lib/components/ModalBody.svelte"
  import ModalHeader from "@lib/components/ModalHeader.svelte"
  import ModalTitle from "@lib/components/ModalTitle.svelte"
  import ModalSubtitle from "@lib/components/ModalSubtitle.svelte"
  import ModalFooter from "@lib/components/ModalFooter.svelte"
  import BunkerConnect from "@app/components/BunkerConnect.svelte"
  import BunkerUrl from "@app/components/BunkerUrl.svelte"
  import {login} from "@app/core"
  import {Nip46Controller} from "@app/nip46"
  import {clearModals} from "@app/modal"
  import {setChecked} from "@app/notifications"
  import {pushToast} from "@app/toast"
  import {NIP46_PERMS, tolerateSwitchRelays} from "@app/nip46"

  // The login screen can open this straight in QR mode, so someone logging in
  // again does not have to go through the bunker link form first.
  type Props = {initialMode?: "bunker" | "connect"}

  const {initialMode = "bunker"}: Props = $props()

  const back = () => {
    if ($loading) {
      stopWaiting?.()
    } else if (mode === "connect") {
      selectBunker()
    } else {
      history.back()
    }
  }

  const controller = new Nip46Controller({
    onNostrConnect: async (response: Nip46ResponseWithResult) => {
      // Use the broker's current relays rather than the ones we started with, since
      // the signer may have asked us to switch relays during the connection handshake.
      await login(
        toSession(nip46, {
          clientSecret: controller.clientSecret,
          signerPubkey: response.event.pubkey,
          relays: controller.broker.params.relays,
        }),
      )

      setChecked("*")
      clearModals()
    },
  })

  // Long enough for a phone waking up and a signer tab in the background, short
  // enough that nobody watches a spinner wondering whether it is broken.
  const SIGNER_TIMEOUT = 20000

  // Answering the connection itself can take much longer. On a phone the signer is another app:
  // it may ask for approval, and the person has to switch to it, approve and come back. With 20
  // seconds the chat had given up by then -- reported on 27/09/2026 by a member pairing a signer
  // app on Android. So the wait is long, says what to do, and "Go back" ends it.
  const CONNECT_TIMEOUT = 120000

  let stopWaiting: (() => void) | undefined

  const {loading, bunker} = controller

  const onSubmit = async () => {
    if ($loading) return

    try {
      const {signerPubkey, connectSecret, relays} = Nip46Broker.parseBunkerUrl($bunker)

      if (!signerPubkey) {
        return pushToast({
          theme: "error",
          message: "Sorry, it looks like that's an invalid bunker link.",
        })
      }

      if (relays.length === 0) {
        return pushToast({
          theme: "error",
          message: "That bunker link does not include any relays.",
        })
      }

      controller.loading.set(true)

      const {clientSecret} = controller
      const broker = tolerateSwitchRelays(new Nip46Broker({relays, clientSecret, signerPubkey}))

      // A signer says nothing at all to a device it does not know -- on purpose,
      // so that a second signer holding the same identity cannot refuse on its
      // behalf. Silence is therefore an ordinary outcome here, not an error
      // anyone will report, and without a deadline this button spins for ever
      // while the person is told nothing. An expired pairing link looks exactly
      // the same from here, which is the likeliest reason to be waiting.
      const result = await Promise.race([
        broker.connect(connectSecret, NIP46_PERMS),
        sleep(CONNECT_TIMEOUT).then(() => undefined),
        new Promise<"cancelled">(resolve => {
          stopWaiting = () => resolve("cancelled")
        }),
      ])

      stopWaiting = undefined

      if (result === "cancelled") {
        broker.cleanup()

        return
      }

      if (result === undefined) {
        broker.cleanup()

        return pushToast({
          theme: "error",
          message:
            "The signer did not answer. Keep the signer app open and approve the connection there. " +
            "A bunker link usually works only once, so if this one was already used, create a new one.",
        })
      }

      const pubkey = await Promise.race([
        broker.getPublicKey(),
        sleep(SIGNER_TIMEOUT).then(() => undefined),
      ])

      if (!pubkey) {
        broker.cleanup()

        return pushToast({
          theme: "error",
          message: "The signer connected but never sent its identity. Please try again.",
        })
      }

      // TODO: remove ack result
      if (pubkey && ["ack", connectSecret].includes(result)) {
        broker.cleanup()
        controller.stop()

        // connect() may have switched relays, so persist the broker's current relays.
        await login(toSession(nip46, {clientSecret, signerPubkey, relays: broker.params.relays}))
        setChecked("*")
      } else {
        return pushToast({
          theme: "error",
          message: "Something went wrong, please try again!",
        })
      }
    } catch (e) {
      console.error(e)

      return pushToast({
        theme: "error",
        message: "Something went wrong, please try again!",
      })
    } finally {
      controller.loading.set(false)
    }

    clearModals()
  }

  const selectConnect = () => {
    controller.loading.set(false)
    mode = "connect"
  }

  const openSigner = () => {
    controller.launchSigner()
  }

  const selectBunker = () => {
    mode = "bunker"
  }

  const isIos = Capacitor.getPlatform() === "ios"

  let mode: string = $state(initialMode)

  $effect(() => {
    // For testing and for play store reviewers
    if ($bunker === "reviewkey") {
      login(toSession(nip01, {secret: makeSecret()}))
    }
  })

  onMount(() => {
    controller.start()
  })

  onDestroy(() => {
    controller.stop()
  })
</script>

<Modal tag="form" onsubmit={preventDefault(onSubmit)}>
  <ModalBody>
    <ModalHeader>
      <ModalTitle>Log In with a Signer</ModalTitle>
      <ModalSubtitle>Using a remote signer app helps you keep your keys safe.</ModalSubtitle>
    </ModalHeader>
    <div class:hidden={mode !== "bunker"}></div>
    {#if mode === "connect"}
      <BunkerConnect {controller} />
    {:else}
      <BunkerUrl {controller} />
      {#if $loading}
        <p class="text-sm opacity-75">
          Waiting for the signer. If it asks, approve the connection in the signer app, then come
          back here.
        </p>
      {/if}
      <Button class={cx(`button button-${$bunker ? "neutral" : "primary"}`)} onclick={selectConnect}
        >Log in with a QR code instead</Button>
      {#if isIos}
        <Button class="button button-neutral" onclick={openSigner}>Open in Signer</Button>
      {/if}
    {/if}
  </ModalBody>
  <ModalFooter>
    <Button class="button button-link" onclick={back}>
      <Icon icon={AltArrowLeft} />
      {$loading ? "Cancel" : "Go back"}
    </Button>
    {#if mode === "bunker"}
      <Button type="submit" class="button button-primary" disabled={$loading || !$bunker}>
        <Spinner loading={$loading}>Next</Spinner>
        <Icon icon={AltArrowRight} />
      </Button>
    {/if}
  </ModalFooter>
</Modal>
