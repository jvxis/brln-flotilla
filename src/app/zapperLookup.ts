import {sleep} from "@welshman/lib"

// The lookup goes through a proxy and then to the recipient's Lightning service, and either can
// take its time. Without a bound, a click that never gets an answer left the button disabled with
// nothing on screen, which reads as "zap is broken".
export const LOOKUP_TIMEOUT = 10_000

// The zap button looks the author's zapper up when the message appears, and a click used that
// answer for as long as the page was open. One that came back empty (the address did not answer
// yet, the proxy failed, the profile had no address then) kept saying "didn't confirm that it
// accepts Nostr zaps" while the address was already answering `allowsNostr` and `nostrPubkey`;
// only a reload fixed it (jvxis/brln-flotilla#2). So an empty answer is asked again, past
// welshman's cache and its backoff, before the click gives up. A good answer is used as it is.
export const lookUpZapper = async <T>(
  cached: Promise<T | undefined>,
  reload: () => Promise<T | undefined>,
  timeout = LOOKUP_TIMEOUT,
) => {
  const bounded = (lookup: Promise<T | undefined>) =>
    Promise.race([lookup, sleep(timeout).then(() => "timeout" as const)])

  const zapper = await bounded(cached)

  return zapper === undefined ? bounded(reload()) : zapper
}
