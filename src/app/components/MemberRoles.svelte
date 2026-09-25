<script lang="ts">
  import {derived} from "svelte/store"
  import {removeUndefined, sortBy} from "@welshman/lib"
  import RoleBadge from "@app/components/RoleBadge.svelte"
  import {relayRoles} from "@app/core"
  import {deriveSpaceMemberRoles} from "@app/roles"

  // The labels someone carries in this space, drawn beside their name. The Directory had them
  // from the start, but a member reads the rooms, not the Directory -- a ladder nobody sees in
  // the course of a conversation may as well not exist.
  type Props = {
    url: string
    pubkey: string
  }

  const {url, pubkey}: Props = $props()

  const roles = derived(
    [relayRoles.get().forUrl(url).$, deriveSpaceMemberRoles(url)],
    ([$roles, $memberRoles]) => {
      const byId = new Map($roles.map(role => [role.identifier(), role]))

      return sortBy(
        role => role.order(),
        removeUndefined(($memberRoles.get(pubkey) ?? []).map(id => byId.get(id))),
      )
    },
  )
</script>

{#each $roles as role (role.identifier())}
  <RoleBadge {role} />
{/each}
