<script lang="ts">
  import cx from "classnames"
  import {sleep} from "@welshman/lib"
  import {Capacitor} from "@capacitor/core"
  import {Badge} from "@capawesome/capacitor-badge"
  import Bell from "@assets/icons/bell.svg?dataurl"
  import {preventDefault} from "@lib/html"
  import FieldInline from "@lib/components/FieldInline.svelte"
  import ToggleInput from "@lib/components/ToggleInput.svelte"
  import Spinner from "@lib/components/Spinner.svelte"
  import Icon from "@lib/components/Icon.svelte"
  import Button from "@lib/components/Button.svelte"
  import PageContent from "@lib/components/PageContent.svelte"
  import {pushToast} from "@app/toast"
  import {clearBadges} from "@app/notifications"
  import {Push} from "@app/push"
  import {notificationSettings} from "@app/settings"

  const reset = () => {
    settings = {...notificationSettings.get()}
  }

  const onsubmit = preventDefault(async () => {
    loading = true

    try {
      if (!settings.badge) {
        clearBadges()
      }

      let refused = ""

      if (settings.push) {
        const permission = await Push.request()

        if (!permission.startsWith("granted")) {
          await sleep(300)

          // The browser said no, or said nothing at all. Everything else on this
          // page is still the person's decision and used to be thrown away along
          // with the refusal, which read as the page ignoring them.
          settings.push = false
          refused = permission
        }
      }

      notificationSettings.set(settings)

      if (refused) {
        return pushToast({
          theme: "error",
          message:
            refused === "default"
              ? "Your browser did not answer the request for notifications, so they stay off. The rest was saved. Allow notifications for this site and try again."
              : `Your browser refused notifications (${refused}), so they stay off. The rest was saved.`,
        })
      }

      pushToast({message: "Your settings have been saved!"})
    } finally {
      loading = false
    }
  })

  let loading = $state(false)
  let settings = $state({...notificationSettings.get()})
</script>

<form {onsubmit}>
  <PageContent>
    <div class="card flex flex-col gap-4 shadow-md">
      <strong class="flex items-center gap-3 text-lg">
        <Icon icon={Bell} />
        Alert Settings
      </strong>
      {#await Badge.isSupported()}
        <!-- pass -->
      {:then { isSupported }}
        {#if isSupported}
          <FieldInline>
            {#snippet label()}
              <p>Show badge for unread alerts</p>
            {/snippet}
            {#snippet input()}
              <ToggleInput bind:checked={settings.badge} />
            {/snippet}
          </FieldInline>
        {/if}
      {/await}
      {#if !Capacitor.isNativePlatform()}
        <FieldInline>
          {#snippet label()}
            <p>Play sound for new activity</p>
          {/snippet}
          {#snippet input()}
            <ToggleInput bind:checked={settings.sound} />
          {/snippet}
        </FieldInline>
      {/if}
      <FieldInline>
        {#snippet label()}
          <p>Enable push notifications</p>
        {/snippet}
        {#snippet input()}
          <ToggleInput bind:checked={settings.push} />
        {/snippet}
      </FieldInline>
    </div>
    <div
      class={cx("card bg-surface flex flex-col gap-4 shadow-md", {
        "pointer-events-none opacity-50": !settings.badge && !settings.sound && !settings.push,
      })}>
      <strong class="text-lg">Alert Types</strong>
      <FieldInline>
        {#snippet label()}
          <p>Notify me about new activity</p>
        {/snippet}
        {#snippet input()}
          <ToggleInput bind:checked={settings.spaces} />
        {/snippet}
      </FieldInline>
      <FieldInline>
        {#snippet label()}
          <p>Always notify me when mentioned</p>
        {/snippet}
        {#snippet input()}
          <ToggleInput bind:checked={settings.mentions} />
        {/snippet}
      </FieldInline>
      <FieldInline>
        {#snippet label()}
          <p>Notify me about new messages</p>
        {/snippet}
        {#snippet input()}
          <ToggleInput bind:checked={settings.messages} />
        {/snippet}
      </FieldInline>
    </div>
    <div class="card sticky -bottom-3 shadow-md flex flex-row items-center justify-between gap-4">
      <Button class="button button-neutral" onclick={reset} disabled={loading}
        >Discard Changes</Button>
      <Button type="submit" class="button button-primary" disabled={loading}>
        <Spinner {loading}>Save Changes</Spinner>
      </Button>
    </div>
  </PageContent>
</form>
