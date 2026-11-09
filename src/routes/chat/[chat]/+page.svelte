<script context="module" lang="ts">
  import {synced} from "@welshman/store"
  import {kv} from "@app/storage"

  const dmNotificationsPrompted = synced({
    key: "dmNotificationsPrompted",
    defaultValue: false,
    storage: kv,
  })
</script>

<script lang="ts">
  import {onMount} from "svelte"
  import {append, uniq} from "@welshman/lib"
  import Chat from "@app/components/Chat.svelte"
  import {splitChatId} from "@app/chats"
  import {notificationSettings} from "@app/settings"
  import {pushToast} from "@app/toast"
  import {Push} from "@app/push"
  import {user} from "@app/core"
  import type {PageProps} from "./$types"

  const {params}: PageProps = $props()

  const {chat} = params
  const pubkeys = uniq(append($user.pubkey, splitChatId(chat)))

  onMount(async () => {
    if (!$dmNotificationsPrompted) {
      dmNotificationsPrompted.set(true)

      const permission = await Push.request().catch(() => "denied")

      // BR⚡LN: the member did not ask for this, so a refusal is not an error to show them. Turning
      // push on in the settings still says why it failed.
      if (!permission.startsWith("granted")) {
        return
      }

      notificationSettings.update(current => ({
        ...current,
        push: true,
        messages: true,
      }))

      pushToast({message: "Notifications enabled!"})
    }
  })
</script>

<Chat {pubkeys} />
