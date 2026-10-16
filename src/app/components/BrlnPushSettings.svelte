<script lang="ts">
  import {onMount} from "svelte"
  import Bell from "@assets/icons/bell.svg?dataurl"
  import Icon from "@lib/components/Icon.svelte"
  import Spinner from "@lib/components/Spinner.svelte"
  import FieldInline from "@lib/components/FieldInline.svelte"
  import ToggleInput from "@lib/components/ToggleInput.svelte"
  import {app} from "@app/core"
  import {pushToast} from "@app/toast"
  import {PLATFORM_URL} from "@app/env"
  import {brlnPushState, disableBrlnPush, enableBrlnPush} from "@app/brlnPush"
  import type {BrlnPushState} from "@app/brlnPush"

  // Notifications with the chat closed (16/10/2026). The switch acts at once, apart from the
  // page's Save button: it asks the browser, subscribes this device and signs the subscription.

  let status = $state<BrlnPushState | "">("")
  let busy = $state(false)
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent)

  const refresh = async () => {
    status = await brlnPushState()
  }

  const toggle = async () => {
    const signer = app.get().user?.signer
    if (!signer) {
      return pushToast({theme: "error", message: "Log in to turn on notifications."})
    }
    busy = true
    try {
      if (status === "on") {
        await disableBrlnPush(signer)
        pushToast({message: "Notifications on this device are off."})
      } else {
        await enableBrlnPush(signer)
        pushToast({message: "This device will be notified with the chat closed."})
      }
    } catch (error) {
      pushToast({theme: "error", message: error instanceof Error ? error.message : String(error)})
    } finally {
      busy = false
      await refresh()
    }
  }

  onMount(refresh)
</script>

{#if status && status !== "unavailable"}
  <div class="card flex flex-col gap-4 shadow-md">
    <strong class="flex items-center gap-3 text-lg">
      <Icon icon={Bell} />
      Notifications with the chat closed
    </strong>
    {#if status === "elsewhere"}
      <p class="text-sm opacity-75">
        Turn them on at <a class="link" href={PLATFORM_URL}
          >{PLATFORM_URL.replace(/^https?:\/\//, "")}</a
        >, on each phone or computer that should be notified.
      </p>
    {:else}
      <FieldInline>
        {#snippet label()}
          <p>Notify this device</p>
        {/snippet}
        {#snippet input()}
          {#if busy}
            <Spinner loading />
          {:else}
            <ToggleInput
              checked={status === "on"}
              disabled={status === "denied"}
              onchange={toggle} />
          {/if}
        {/snippet}
      </FieldInline>
      <p class="text-sm opacity-75">
        Mentions, replies to you, direct messages (Node Check alerts arrive there) and Comunicados.
        A room message shows who wrote and how it starts; a direct message only says it arrived, as
        it is end-to-end encrypted.
      </p>
      {#if status === "denied"}
        <p class="text-sm text-error">
          Notifications are blocked for this site. Allow them in the browser settings, then come
          back.
        </p>
      {/if}
      {#if isIOS}
        <p class="text-sm opacity-75">
          On iPhone: tap Share, then Add to Home Screen, open the chat from that icon and turn this
          on there.
        </p>
      {/if}
    {/if}
  </div>
{/if}
