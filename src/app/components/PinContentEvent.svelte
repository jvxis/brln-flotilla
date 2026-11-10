<script lang="ts">
  import {onDestroy} from "svelte"
  import Button from "@lib/components/Button.svelte"
  import Spinner from "@lib/components/Spinner.svelte"
  import NoteItem from "@app/components/NoteItem.svelte"
  import {makeFeedContext} from "@app/feeds"
  import {deriveEvent} from "@app/repository"
  import {goToEvent} from "@app/routes"
  import {QUOTE_DEADLINE, QUOTE_UNAVAILABLE} from "@app/quoteDeadline"

  type Props = {
    url?: string
    value: string
    relays: string[]
  }

  const {url, value, relays}: Props = $props()

  const event = deriveEvent(value, relays)
  const context = makeFeedContext({relays})

  let gaveUp = $state(false)

  const timer = setTimeout(() => (gaveUp = true), QUOTE_DEADLINE)

  onDestroy(() => {
    clearTimeout(timer)
    context.cleanup()
  })
</script>

{#if $event}
  <Button onclick={() => goToEvent($event)}>
    <NoteItem {url} {context} event={$event} />
  </Button>
{:else if gaveUp}
  <p class="flex justify-center py-8 text-sm italic opacity-70" data-quote-unavailable>
    {QUOTE_UNAVAILABLE}
  </p>
{:else}
  <p class="flex justify-center py-8">
    <Spinner loading>Loading event...</Spinner>
  </p>
{/if}
