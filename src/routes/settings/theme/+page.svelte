<script lang="ts">
  import cx from "classnames"
  import Accessibility from "@assets/icons/accessibility.svg?dataurl"
  import Monitor from "@assets/icons/monitor.svg?dataurl"
  import Moon from "@assets/icons/moon.svg?dataurl"
  import Palette from "@assets/icons/palette.svg?dataurl"
  import Sun from "@assets/icons/sun.svg?dataurl"
  import Button from "@lib/components/Button.svelte"
  import Icon from "@lib/components/Icon.svelte"
  import Card from "@lib/components/Card.svelte"
  import Field from "@lib/components/Field.svelte"
  import FieldInline from "@lib/components/FieldInline.svelte"
  import PageContent from "@lib/components/PageContent.svelte"
  import {publishSettings, userSettingsValues} from "@app/settings"
  import {flTheme, flThemeLabels, flThemes, theme} from "@app/theme"

  const saveFontSize = () => publishSettings({font_size: fontSize})

  // A theme no longer offered (navy, since 17/10/2026) stays listed while it is the one in use, so
  // the picker shows what the member has instead of a blank.
  const themeOptions = $derived(flThemes.includes($flTheme) ? flThemes : [...flThemes, $flTheme])

  let fontSize = $state($userSettingsValues.font_size)
</script>

{#snippet colorScheme(value: string, label: string, icon: string)}
  <Button
    type="button"
    class={cx("join-item button button-xs", $theme === value ? "button-primary" : "button-neutral")}
    onclick={() => theme.set(value)}>
    <Icon {icon} size={4} />
    {label}
  </Button>
{/snippet}

<PageContent>
  <Card class="flex flex-col gap-4">
    <strong class="flex items-center gap-3 text-lg">
      <Icon icon={Palette} />
      Theme Settings
    </strong>
    <FieldInline>
      {#snippet label()}
        <p>Color scheme</p>
      {/snippet}
      {#snippet input()}
        <div class="join">
          {@render colorScheme("system", "System", Monitor)}
          {@render colorScheme("light", "Light", Sun)}
          {@render colorScheme("dark", "Dark", Moon)}
        </div>
      {/snippet}
      {#snippet info()}
        <p>System follows whatever your device is set to.</p>
      {/snippet}
    </FieldInline>
    <FieldInline>
      {#snippet label()}
        <p>App theme</p>
      {/snippet}
      {#snippet input()}
        <select class="select input" bind:value={$flTheme} aria-label="Style">
          {#each themeOptions as option (option)}
            <option value={option}>{flThemeLabels[option] ?? option}</option>
          {/each}
        </select>
      {/snippet}
      {#snippet info()}
        <p>Changes the shape and texture of everything, not just its colors.</p>
      {/snippet}
    </FieldInline>
  </Card>
  <Card class="flex flex-col gap-4">
    <strong class="flex items-center gap-3 text-lg">
      <Icon icon={Accessibility} />
      Accessibility
    </strong>
    <Field>
      {#snippet label()}
        <p>Font size</p>
      {/snippet}
      {#snippet secondary()}
        <p>{Math.round(fontSize * 100)}%</p>
      {/snippet}
      {#snippet input()}
        <input
          class="range w-full"
          type="range"
          min="0.8"
          max="1.3"
          step="0.05"
          bind:value={fontSize}
          onchange={saveFontSize} />
      {/snippet}
    </Field>
  </Card>
</PageContent>
