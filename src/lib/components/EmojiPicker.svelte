<style>
  @media (max-width: 450px) {
    emoji-picker {
      max-width: 100%;
      --num-columns: 6;
      --category-emoji-size: 1.125rem;
    }
  }
</style>

<script lang="ts">
  import "emoji-picker-element"
  import emojiDataUrl from "emoji-picker-element-data/en/emojibase/data.json?url"
  import type {Emoji} from "emoji-picker-element/shared"
  import {onMount} from "svelte"

  interface Props {
    onClick: (emoji: Emoji) => void
  }

  const {onClick}: Props = $props()

  // The picker keeps its emoji in IndexedDB, and a browser refuses that in more
  // places than one would think: a private window, site data blocked for the origin,
  // an extension in the way. All the picker says then is "Could not load emoji.",
  // and the person cannot react at all — so a short list takes over.
  const fallbackEmoji =
    "👍 👎 ❤️ 🔥 ⚡ 🚀 🎉 👏 🙏 😂 😅 🤔 😮 😢 😡 🤝 💡 ✅ ❌ 👀 🧡 💜 🤙 🫡 🐂 🐻 🌽 💰 🔒 🛠️".split(
      " ",
    )

  type PickerElement = Element & {database?: {ready: () => Promise<void>}}

  // The element builds its database in a microtask after the attributes are set.
  const databaseOf = async (picker: PickerElement) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (picker.database) return picker.database
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    throw new Error("the picker never created its database")
  }

  let element: PickerElement | undefined = $state()
  let unavailable = $state(false)

  onMount(() => {
    const picker = element
    if (!picker) return

    picker.addEventListener("emoji-click", (event: any) => onClick(event.detail as Emoji))

    databaseOf(picker)
      .then(database => database.ready())
      .catch((error: any) => {
        console.info(
          "Emoji list unavailable, falling back to a short one:",
          error?.message || error,
        )
        unavailable = true
      })
  })
</script>

{#if unavailable}
  <div class="flex max-w-72 flex-wrap gap-1 p-2">
    {#each fallbackEmoji as emoji (emoji)}
      <button
        type="button"
        class="hover:bg-base-300 rounded p-1 text-xl leading-none"
        onclick={() => onClick({unicode: emoji} as Emoji)}>{emoji}</button>
    {/each}
  </div>
{:else}
  <emoji-picker bind:this={element} data-source={emojiDataUrl} class="m-auto"></emoji-picker>
{/if}
