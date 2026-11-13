<script lang="ts">
  import type {Snippet} from "svelte"
  import {removeUndefined} from "@welshman/lib"
  import type {TrustedEvent} from "@welshman/util"
  import {Profiles, Zappers} from "@welshman/app"
  import Button from "@lib/components/Button.svelte"
  import Zap from "@app/components/Zap.svelte"
  import InfoZapperError from "@app/components/InfoZapperError.svelte"
  import type {ZapperProblem} from "@app/components/InfoZapperError.svelte"
  import {pushModal} from "@app/modal"
  import {app} from "@app/core"
  import {lookUpZapper} from "@app/zapperLookup"

  type Props = {
    url?: string
    event: TrustedEvent
    children: Snippet
    replaceState?: boolean
    class?: string
    "data-tip"?: string
    "aria-label"?: string
  }

  const {url, event, children, replaceState, ...props}: Props = $props()

  const relays = removeUndefined([url])

  // Zappers keeps only an answer with `allowsNostr` and `nostrPubkey`, so "no zapper" is also
  // "didn't confirm Nostr zaps". forceLoad skips the cache and the backoff of `load`.
  const reload = async () => {
    const profile = await $app
      .use(Profiles)
      .forceLoad(event.pubkey, relays)
      .catch(() => $app.use(Profiles).get(event.pubkey))
    const lnurl = profile?.lnurl()

    return lnurl ? $app.use(Zappers).forceLoad(lnurl) : undefined
  }

  const explain = (problem: ZapperProblem) =>
    pushModal(InfoZapperError, {url, pubkey: event.pubkey, problem}, {replaceState})

  const onClick = async () => {
    loading = true

    try {
      const zapper = await lookUpZapper(zapperPromise, reload)

      if (zapper === "timeout") {
        return explain("unreachable")
      }

      if (zapper?.allowsNostr) {
        zapperPromise = Promise.resolve(zapper)

        return pushModal(Zap, {url, pubkey: event.pubkey, event}, {replaceState})
      }

      // No zapper can mean no address at all, or an address that didn't confirm Nostr
      // zaps -- a member whose address answers but doesn't advertise NIP-57 read "they
      // don't currently have a zap receiver set up", which was false: they had one. The
      // lookup swallows its own failures, so "didn't confirm" also covers a proxy that
      // failed; it never claims the address can't take them.
      explain($app.use(Profiles).get(event.pubkey)?.lnurl() ? "no-nostr" : "no-address")
    } catch (e) {
      console.warn("Could not look up the zap receiver:", e)
      explain("unreachable")
    } finally {
      loading = false
    }
  }

  let zapperPromise = $app.use(Zappers).loadForPubkey(event.pubkey, relays)
  let loading = $state(false)
</script>

<Button onclick={onClick} disabled={loading} {...props}>
  {@render children?.()}
</Button>
