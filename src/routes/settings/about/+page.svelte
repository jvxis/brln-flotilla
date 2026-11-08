<script lang="ts">
  import Link from "@lib/components/Link.svelte"
  import Icon from "@lib/components/Icon.svelte"
  import Card from "@lib/components/Card.svelte"
  import Planet from "@assets/icons/planet.svg?dataurl"
  import {PLATFORM_NAME, PLATFORM_ABOUT, PLATFORM_RELAYS} from "@app/env"
  import {makeRoomPath} from "@app/routes"

  // The club's page has no links out of it (08/11/2026, Jaime): upstream's donation card zapped
  // Flotilla's author, "Get Support" opened support.flotilla.social and the icons led to its code,
  // blog and podcast. Support is the club's own room now, and the credits stay as plain text.
  const SUPPORT_ROOM = "suporte"

  const hash = import.meta.env.VITE_BUILD_HASH
  const clubRelay = PLATFORM_RELAYS[0]
</script>

<div class="flex flex-col gap-6 p-8 max-w-2xl h-screen justify-center m-auto">
  <p class="text-center text-2xl">Thanks for using</p>
  <h1 class="mb-4 text-center text-5xl font-bold uppercase">{PLATFORM_NAME}</h1>
  {#if clubRelay}
    <Card class="flex flex-col gap-2 text-center">
      <h3 class="text-2xl">Get in touch</h3>
      <p>Having problems? Talk to us in the Support room.</p>
      <Link class="button button-primary" href={makeRoomPath(clubRelay, SUPPORT_ROOM)}>
        Get Support
      </Link>
    </Card>
  {/if}
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-2 items-center text-center">
      <p class="text-sm">Built on Flotilla, by hodlbod.</p>
      <p class="text-xs">Icons by 480 Design.</p>
      {#if hash}
        <p class="text-xs">Running build {hash.slice(0, 8)}</p>
      {/if}
    </div>
    {#if PLATFORM_ABOUT}
      <div class="flex justify-center gap-4">
        <div class="tip tip-top" data-tip="About {PLATFORM_NAME}">
          <Link external href={PLATFORM_ABOUT}>
            <Icon icon={Planet} />
          </Link>
        </div>
      </div>
    {/if}
  </div>
</div>
