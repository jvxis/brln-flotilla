<script lang="ts">
  import {PublishStatus} from "@welshman/net"
  import {displayRelayUrl} from "@welshman/util"
  import AltArrowLeft from "@assets/icons/alt-arrow-left.svg?dataurl"
  import {errorMessage} from "@lib/util"
  import Icon from "@lib/components/Icon.svelte"
  import Button from "@lib/components/Button.svelte"
  import Spinner from "@lib/components/Spinner.svelte"
  import ProfileEditForm from "@app/components/ProfileEditForm.svelte"
  import type {Values} from "@app/components/ProfileEditForm.svelte"
  import {clearModals} from "@app/modal"
  import {pushToast} from "@app/toast"
  import {profiles, user} from "@app/core"
  import {publish} from "@app/publish"

  const initialValues = {profile: {...$profiles.get($user.pubkey)?.values}}

  const back = () => history.back()

  const onsubmit = async ({profile}: Values) => {
    loading = true

    try {
      const command = await $profiles.update(writer => writer.update(profile))
      const thunk = publish(command)

      // waitForError resolves on the first relay that refuses, before the others answer.
      // A member's write relays often include a paid one that refuses anyone who hasn't
      // signed up with it, and on 20/09/2026 that read as "Failed to update your profile:
      // restricted: sign up at nostr.wine" while the profile had been saved everywhere
      // else, the club's relay included. Wait for every relay, and fail only when none
      // took it.
      await thunk.waitForCompletion()

      const saved = thunk.getUrlsWithStatus(PublishStatus.Success)
      const refused = thunk.getFailedUrls()

      if (saved.length === 0) {
        pushToast({
          theme: "error",
          message: `Failed to update your profile: ${errorMessage(thunk.getError() || "no relay accepted it")}`,
        })
      } else {
        pushToast({
          message:
            refused.length === 0
              ? "Your profile has been updated!"
              : `Your profile has been updated. Some relays refused it: ${refused.map(displayRelayUrl).join(", ")}`,
        })
        clearModals()
      }
    } finally {
      loading = false
    }
  }

  let loading = $state(false)
</script>

<ProfileEditForm {initialValues} {onsubmit}>
  {#snippet footer()}
    <Button class="button button-link" onclick={back}>
      <Icon icon={AltArrowLeft} />
      Go Back
    </Button>
    <Button type="submit" class="button button-primary" disabled={loading}>
      <Spinner {loading} />
      Save Changes
    </Button>
  {/snippet}
</ProfileEditForm>
