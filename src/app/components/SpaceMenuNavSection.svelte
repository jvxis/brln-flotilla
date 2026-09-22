<script lang="ts">
  import AltArrowDown from "@assets/icons/alt-arrow-down.svg?dataurl"
  import AltArrowRight from "@assets/icons/alt-arrow-right.svg?dataurl"
  import Icon from "@lib/components/Icon.svelte"
  import SpaceMenuNavItems from "@app/components/SpaceMenuNavItems.svelte"
  import {notifications} from "@app/notifications"
  import {makeSpacePath} from "@app/routes"

  type Props = {
    url: string
  }

  const {url}: Props = $props()

  // The space sections (details, directory, calendar, polls...) sat above the rooms and
  // pushed them out of view. They start folded so the rooms come first; each member's
  // choice is remembered in this browser.
  const storageKey = "space-menu-collapsed"

  const readCollapsed = () => {
    try {
      return localStorage.getItem(storageKey) !== "false"
    } catch {
      return true
    }
  }

  let collapsed = $state(readCollapsed())

  const toggle = () => {
    collapsed = !collapsed

    try {
      localStorage.setItem(storageKey, String(collapsed))
    } catch {
      // Storage can be blocked; the menu still folds for this visit.
    }
  }

  const sectionPaths = [
    "chat",
    "library",
    "goals",
    "threads",
    "articles",
    "classifieds",
    "calendar",
    "polls",
  ].map(section => makeSpacePath(url, section))

  // Folding must not hide news: the header carries the dot of any section under it.
  const hasNotification = $derived(sectionPaths.some(path => $notifications.has(path)))
</script>

<button
  type="button"
  class="secondary-nav__header relative flex w-full cursor-pointer items-center justify-between px-1 py-2 text-left text-sm font-bold uppercase"
  aria-expanded={!collapsed}
  onclick={toggle}>
  <span class="flex items-center gap-2">
    Space
    {#if collapsed && hasNotification}
      <span class="h-2 w-2 rounded-full bg-primary" aria-label="New activity"></span>
    {/if}
  </span>
  <Icon size={4} icon={collapsed ? AltArrowRight : AltArrowDown} />
</button>
{#if !collapsed}
  <SpaceMenuNavItems {url} />
{/if}
