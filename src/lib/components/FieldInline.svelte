<script lang="ts">
  interface Props {
    label?: import("svelte").Snippet
    input?: import("svelte").Snippet
    info?: import("svelte").Snippet
    [key: string]: any
  }

  const {...props}: Props = $props()
</script>

<div class="flex flex-col gap-2 {props.class}">
  <div class="flex items-center justify-between w-full gap-2">
    {#if props.label}
      <label class="flex items-center gap-2 min-w-[30%] max-w-[80%] md:max-w-none">
        {@render props.label()}
      </label>
    {/if}
    <!-- min-w-0: without it a flex item never shrinks below its content, and on a phone the
         profile's npub field pushed its copy button off the screen (Jaime, 10/11/2026). -->
    <div class="flex min-w-0 items-center gap-2 justify-end grow">
      {#if props.input}
        {@render props.input()}
      {/if}
    </div>
  </div>
  {#if props.info}
    <p class="text-sm text-content-muted">
      {@render props.info()}
    </p>
  {/if}
</div>
