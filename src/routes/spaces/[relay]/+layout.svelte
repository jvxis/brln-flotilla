<script module lang="ts">
  const joinPrompted = new Set<string>()
  const redirectPrompted = new Set<string>()
</script>

<script lang="ts">
  import {page} from "$app/stores"
  import type {Maybe} from "@welshman/lib"
  import {once} from "@welshman/lib"
  import {normalizeRelayUrl} from "@welshman/util"
  import {isMobile} from "@lib/html"
  import Page from "@lib/components/Page.svelte"
  import SecondaryNav from "@lib/components/SecondaryNav.svelte"
  import SpaceMenu from "@app/components/SpaceMenu.svelte"
  import SocketStatusToast from "@app/components/SocketStatusToast.svelte"
  import SpaceAuthError from "@app/components/SpaceAuthError.svelte"
  import SpaceTrustRelay from "@app/components/SpaceTrustRelay.svelte"
  import SpaceJoin from "@app/components/SpaceJoin.svelte"
  import SpaceRedirect from "@app/components/SpaceRedirect.svelte"
  import {deriveRelayAuthError, waitUntilRelayCanAnswer} from "@app/access"
  import {relayMemberLists, relays, roomLists, user} from "@app/core"
  import {deriveUserIsRelayMember, userSpaceUrls} from "@app/rooms"
  import {getModal, pushModal} from "@app/modal"
  import {relaysPendingTrust} from "@app/policies"
  import {decodeRelay} from "@app/relays"
  import {makeSpacePath} from "@app/routes"
  import type {LayoutProps} from "./$types"

  const {children, params}: LayoutProps = $props()

  const url = decodeRelay(params.relay)

  const userIsRelayMember = deriveUserIsRelayMember(url)

  const authError = deriveRelayAuthError(url)

  const showAuthError = once(() =>
    pushModal(SpaceAuthError, {url, error: $authError}, {noEscape: true}),
  )

  const showPendingTrust = once(() => pushModal(SpaceTrustRelay, {url}, {noEscape: true}))

  // Detect a moved custom domain — the relay's nip-11 document answered with a redirect
  const checkRedirect = once(() => {
    $relays.load(url).then($relay => {
      const next = $relay?.redirect_to

      if (next) {
        redirectUrl = normalizeRelayUrl(next.replace(/^http/, "ws"))
      }
    })
  })

  const loadSpaces = async () => {
    const currentPubkey = user.get().pubkey

    if (currentPubkey) {
      // Force a fresh fetch rather than `load`, which can resolve immediately from an
      // hour-stale cache and make a space the user has since joined look unjoined.
      // Unlike `load`, `forceLoad` doesn't swallow fetch errors, so catch them here —
      // otherwise a failed fetch would leave spacesLoaded false forever.
      // On a closed relay the room list is unreadable until we have authenticated,
      // and a refusal is final -- so asking too early answers "not a member" for
      // someone who is one, and puts the join dialog in front of them again.
      await waitUntilRelayCanAnswer(url)

      try {
        await $roomLists.forceLoad(currentPubkey, [url])
      } catch (error) {
        console.warn(`Failed to load room list for ${currentPubkey}`, error)
      }

      // The relay's own member list decides whether this person is already in the space,
      // so the prompt must not be answered before it has arrived -- otherwise a member
      // sees "Join Space" whenever the list happens to be slower than the page.
      try {
        await relayMemberLists.get().fetch(url)
      } catch (error) {
        console.warn(`Failed to load the member list of ${url}`, error)
      }
    }

    spacesLoaded = true
  }

  // Track this manually since we want to avoid race conditions in which we show this prompt before we load
  let spacesLoaded = $state(false)

  let redirectUrl = $state<Maybe<string>>()

  $effect(checkRedirect)

  // Watch for relay errors and notify the user
  // Direct links skip Discover — prompt to join when relay is not in the user's space list.
  $effect(() => {
    if (getModal()) return

    if (redirectUrl && redirectUrl !== url && !redirectPrompted.has(url)) {
      redirectPrompted.add(url)
      pushModal(SpaceRedirect, {url, newUrl: redirectUrl})
    } else if (!$userSpaceUrls.includes(url) && !$userIsRelayMember && !joinPrompted.has(url)) {
      if (spacesLoaded) {
        joinPrompted.add(url)
        pushModal(SpaceJoin, {url})
      } else {
        loadSpaces()
      }
    } else if ($authError) {
      showAuthError()
    } else if ($relaysPendingTrust.includes(url)) {
      showPendingTrust()
    }
  })
</script>

<!-- Desktop shows the same status pinned to the space menu; on mobile that's behind the drawer -->
{#if isMobile}
  <SocketStatusToast {url} />
{/if}

{#if $page.url.pathname === makeSpacePath(url)}
  {@render children?.()}
{:else}
  <SecondaryNav>
    <SpaceMenu {url} />
  </SecondaryNav>
  <Page>
    <!-- SvelteKit builds a new page when the route changes and keeps the one it has when only the
         params change, so this rebuilds it for the second case. The url the page store reports
         arrives a tick after the page is built, so keying on that throws the new page away. -->
    {#key JSON.stringify(params)}
      {@render children?.()}
    {/key}
  </Page>
{/if}
