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
  import {
    brlnPushState,
    disableBrlnPush,
    enableBrlnPush,
    listBrlnPushDevices,
    turnOffOtherBrlnPushDevices,
  } from "@app/brlnPush"
  import type {BrlnPushDevice, BrlnPushState} from "@app/brlnPush"

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

  // The list asks for a signature, so it loads on request: opening settings never sends the
  // member's signer a request they did not ask for.
  let devices = $state<BrlnPushDevice[] | undefined>(undefined)
  let loadingDevices = $state(false)

  const deviceName: Record<BrlnPushDevice["servico"], string> = {
    apple: "iPhone, iPad or Safari on a Mac",
    google: "Chrome, Edge or Android",
    mozilla: "Firefox",
    windows: "Windows",
    outro: "Another browser",
  }

  const since = (seconds: number) => new Date(seconds * 1000).toLocaleDateString()

  const others = $derived((devices ?? []).filter(device => !device.este).length)

  const showDevices = async () => {
    const signer = app.get().user?.signer
    if (!signer) return
    loadingDevices = true
    try {
      devices = await listBrlnPushDevices(signer)
    } catch (error) {
      pushToast({theme: "error", message: error instanceof Error ? error.message : String(error)})
    } finally {
      loadingDevices = false
    }
  }

  const turnOffOthers = async () => {
    const signer = app.get().user?.signer
    if (!signer) return
    loadingDevices = true
    try {
      const removed = await turnOffOtherBrlnPushDevices(signer)
      pushToast({
        message:
          removed === 1
            ? "Notifications are off on 1 other device."
            : `Notifications are off on ${removed} other devices.`,
      })
      devices = await listBrlnPushDevices(signer)
    } catch (error) {
      pushToast({theme: "error", message: error instanceof Error ? error.message : String(error)})
    } finally {
      loadingDevices = false
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
      <div class="flex flex-col gap-2">
        {#if devices === undefined}
          <button
            type="button"
            class="link self-start text-sm"
            disabled={loadingDevices}
            onclick={showDevices}>
            {loadingDevices ? "Loading..." : "Show my devices with notifications on"}
          </button>
        {:else}
          <p class="text-sm">
            {devices.length === 0
              ? "No device of yours has notifications on."
              : devices.length === 1
                ? "1 device of yours has notifications on:"
                : `${devices.length} devices of yours have notifications on:`}
          </p>
          {#if devices.length > 0}
            <ul class="flex flex-col gap-1 text-sm opacity-75">
              {#each devices as device, i (i)}
                <li>
                  {deviceName[device.servico] ?? deviceName.outro}, since {since(device.desde)}
                  {#if device.este}<strong>(this device)</strong>{/if}
                </li>
              {/each}
            </ul>
          {/if}
          {#if others > 0}
            <p class="text-sm opacity-75">
              A notification arriving twice on the same phone usually means an older install of the
              chat there is still subscribed.
            </p>
            <button
              type="button"
              class="btn btn-neutral btn-sm self-start"
              disabled={loadingDevices}
              onclick={turnOffOthers}>
              {#if loadingDevices}<Spinner loading />{/if}
              {status === "on" ? "Turn off on the other devices" : "Turn off on all of them"}
            </button>
          {/if}
        {/if}
      </div>
      {#if isIOS}
        <p class="text-sm opacity-75">
          On iPhone: tap Share, then Add to Home Screen, open the chat from that icon and turn this
          on there.
        </p>
      {/if}
    {/if}
  </div>
{/if}
