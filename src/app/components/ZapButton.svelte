<script lang="ts">
  import type {Snippet} from "svelte"
  import {removeUndefined, sleep} from "@welshman/lib"
  import type {TrustedEvent} from "@welshman/util"
  import {Profiles, Zappers} from "@welshman/app"
  import Button from "@lib/components/Button.svelte"
  import Zap from "@app/components/Zap.svelte"
  import InfoZapperError from "@app/components/InfoZapperError.svelte"
  import type {ZapperProblem} from "@app/components/InfoZapperError.svelte"
  import {pushModal} from "@app/modal"
  import {app} from "@app/core"

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

  // The lookup goes through a proxy and then to the recipient's Lightning service, and
  // either can take its time. Without a bound, a click that never gets an answer left
  // the button disabled with nothing on screen, which reads as "zap is broken".
  const LOOKUP_TIMEOUT = 10_000

  const relays = removeUndefined([url])

  const zapperPromise = $app.use(Zappers).loadForPubkey(event.pubkey, relays)

  const explain = (problem: ZapperProblem) =>
    pushModal(InfoZapperError, {url, pubkey: event.pubkey, problem}, {replaceState})

  const onClick = async () => {
    loading = true

    try {
      const zapper = await Promise.race([
        zapperPromise,
        sleep(LOOKUP_TIMEOUT).then(() => "timeout" as const),
      ])

      if (zapper === "timeout") {
        return explain("unreachable")
      }

      if (zapper?.allowsNostr) {
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

  let loading = $state(false)
</script>

<Button onclick={onClick} disabled={loading} {...props}>
  {@render children?.()}
</Button>
