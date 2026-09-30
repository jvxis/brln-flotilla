# BRLN patches

This repository is the BR⚡LN Club fork of [Flotilla](https://gitea.coracle.social/coracle/flotilla), used as the web app of the BR⚡LN Community. Changes are kept small and on top of the upstream commit recorded below, so they can be rebased and offered upstream. The pilot runs in English; nothing here translates the UI.

- Upstream: `https://gitea.coracle.social/coracle/flotilla.git` (remote `upstream`)
- Base: `f727f2f` (dev, 2026-09-16, version 1.11.0)
- Relay: `jvxis/brln-zooid`
- Evaluation: `brln-community/spikes/flotilla`

## Patches

### 1. Configurable third-party services, local keys and access page

Every new variable defaults, in the upstream `.env`, to the behavior upstream already had.

| Variable | Effect |
|---|---|
| `VITE_DUFFLEPUD_URL` | Was hard-coded. Empty turns off link previews and remote sync of read state; handles and zappers are resolved directly. |
| `VITE_PLAUSIBLE_URL`, `VITE_PLAUSIBLE_DOMAIN` | The script was hard-coded in `app.html` and the CSP. It is now injected by `setupAnalytics` and allowed in the CSP only when both are set. |
| `VITE_PUSH_BRIDGE` | Empty no longer crashes the app on load (`Invalid URL`). |
| `VITE_ALLOW_LOCAL_KEYS` | `false` hides "Log in with Key" and "Generate a key" on the web, where the session with the private key is stored unencrypted in `localStorage`. Native builds are unaffected. |
| `VITE_SIGNER_APP_URL` / `VITE_SIGNER_APP_LABEL` | Where "Browse Signer Apps" points, so a deployment can send people to its own signer instead of the public directory. A relative path keeps the link correct in each deployment: served from a node it opens that node's signer, served on the web it opens the hosted one. When set, the login screen recommends it above "Log in with Remote Signer". The login screen also offers "Log in with a QR code" directly, which opens the same dialog already in QR mode. |
| `VITE_PLATFORM_ACCESS_URL` | When set, a non-member of a platform relay sees "Members Only" with a link to this URL instead of the invite code form. |

Upstream candidate: yes.

### 2. BRLN theme

`src/lib/components/brln.css`, registered in `theme.css` and `flThemes`. Dark follows `services.br-ln.com`: deep navy ground, lightning yellow primary, teal secondary.

Upstream candidate: no.

### 3. BRLN build configuration and CI

`deploy/brln.env` is the configuration of `chat.br-ln.com`. QR code login pairs over `wss://signer.br-ln.com`, a relay that only carries NIP-46 messages, because the members-only relay refuses the throwaway keys of devices that are still logging in. `.github/workflows/ci.yml` runs lint, type check and the BRLN build, and fails if the build references a Coracle service.

### 4. Recover the client after the relay admits a member

`src/app/access.ts` — a successful join closes the socket and reloads the page; `src/app/rooms.ts` — leaving a space is remembered locally.

On a members-only relay everything the client learns before being admitted is learned as an outsider: subscriptions are refused, the room list comes back empty and the connection indicator never reaches "connected". Closing the socket restores the data path (measured: the relay answers the new subscriptions), but the interface keeps the state it built as an outsider, so the join ends with a reload — which is what people were doing by hand.

Leaving has the mirror problem: it rewrites the room list on the space's own relay, which someone already removed from it cannot write to, so the space kept coming back and the join and leave buttons alternated forever. The departure is remembered in `localStorage` and cleared on the next join.

The reload is load-bearing, not leftover. Welshman treats a `restricted:` refusal as final (`isTerminalReason`): the request is finished, `resubscribeAttempts` defaults to zero, and reopening the socket does not revive it, because the request object is already closed. So everything the client tried to subscribe to before being admitted is gone for good, and only re-creating those subscriptions brings the room back — which is what the reload does bluntly. Removing it would put the empty room back in front of every new member. Replacing it means re-running the app's subscriptions after a join, plus a test with a member joining for the first time.

Upstream candidate: the socket close and the local departure, yes. The reload is a stopgap for this deployment until the stores recover on their own.

### 5. No invite links in a members-only space

`src/app/components/SpaceMenuActions.svelte`, `SpaceMenuActionsMobile.svelte` and `src/routes/spaces/[relay]/directory/+page.svelte` — the *Create Invite* menu entry and the *Invite people* button are gone.

Membership of this space follows the club subscription: the member registers a `npub` on the website and a synchronizer keeps the relay's list. An invite link would be a second, parallel way in — and in Zooid a valid claim admits a stranger even when `public_join = false` (`ValidateJoinRequest`). The relay already refuses `createclaim` from a member, because `member_methods` is unset, so the buttons only offered something that could not work; removing them keeps the club's answer in one place.

Room invites in `RoomDetail.svelte` stay, because they are already behind `userIsAdmin`.

Upstream candidate: no. It is a decision of this deployment, not a defect.

### 6. Survive a browser that refuses the emoji database, and a certificate it does not trust

`src/lib/components/EmojiPicker.svelte`, `src/routes/+layout.svelte`, `svelte.config.js`, `vite.config.ts`, `src/app.d.ts`.

Two things break on a LightningOS node that do not break on the website.

The emoji picker keeps its list in IndexedDB. Where the browser refuses that — a private window, site data blocked for the origin, an extension in the way — the picker says only "Could not load emoji." and reacting becomes impossible. A short list of reactions now takes over when the database fails.

The app is served from a node with a self-signed certificate, and a browser refuses to register a service worker on an origin it does not trust. SvelteKit registers it from an inline script with no error handler, so every page load ended in an uncaught `SecurityError` that buried real errors in the console. The registration moved into the app, where the failure is noted and ignored; `__REGISTER_SERVICE_WORKER__` keeps the desktop build's behaviour.

Upstream candidate: both, yes.

### 7. Work in a browser that blocks site data, and hide what the club does not run

`src/app/storage.ts`, `src/app/hosting.ts`, `src/routes/settings/hosting/+page.svelte`.

The chat keeps its cache in IndexedDB, and `+layout.svelte` awaits `storage.ready` before it subscribes to anything. Where the browser refuses IndexedDB — site data blocked for the origin, by a setting or an extension — that promise rejected and the rest of the startup never ran: the person could send messages and saw only their own. The failure is now caught, the person is told plainly, and the chat runs without a cache.

`VITE_HOSTING_BACKEND_URL` is empty here, because the club sells no hosting, but `HOSTING_ENABLED` only checked for iOS. The Hosting settings page built its requests on an empty base URL and could only say "Failed to construct 'URL': Invalid base URL". Hosting is now off whenever there is no backend address, and the page itself redirects.

Upstream candidate: both, yes.

### 8. Authenticate on the space's own relay from the first connection

`src/app/policies.ts`.

`authPolicy` decides whether to answer a relay's NIP-42 challenge, and every rule it had waits on a list — room list, relay list, a publish already sent — that is itself read from the relay or from the local cache. On the club's closed relay that is a circle: nothing is served before authentication, so on a first load, or in a browser that keeps no cache, the client never authenticated, the room came back empty and the person saw only the messages they sent. The messages appeared after leaving the room and coming back, because publishing had forced the authentication by then and the new subscription ran with it.

A relay in `PLATFORM_RELAYS` is the one this build exists for, so it authenticates as soon as there is an identity.

Upstream candidate: yes, for any deployment with a closed platform relay.

### 9. Bring the member's own profile into the space

`src/app/profileImport.ts`, `src/app/env.ts`, `deploy/brln.env`, registered in `src/routes/+layout.svelte`.

This build talks to one relay, the club's, so a member who already uses Nostr arrived with no name and no picture and had to type them again, as if their identity had not come along. The official app inherits the profile because it queries public indexer relays for everyone.

Doing that here would hand an outside relay the npubs of everyone in a closed space. Instead, when the space has no profile for the person signing in — and only then — their own `kind 0` is fetched from `VITE_PROFILE_IMPORT_RELAYS` and the signed event is copied to the club's relay. Their npub is already public; nobody else's is ever asked about.

Upstream candidate: yes, for any closed deployment.

### 10. Sending files fails clearly instead of obscurely

`src/app/uploads.ts`, `src/app/components/ChatCompose.svelte`, `src/app/components/RoomCompose.svelte`.

Attachments are out of the MVP, so `VITE_DEFAULT_BLOSSOM_SERVERS` is empty and the club's relay hosts no blossom. `getBlossomServer` still ended in `first(DEFAULT_BLOSSOM_SERVERS)!`, so the upload ran with `undefined` as the server and every attempt — the button, a pasted image — died on "Failed to construct 'URL': Invalid base URL".

Now the button is not offered when there is nowhere to keep files, and an upload that reaches the code anyway says so in words.

Upstream candidate: yes, the non-null assertion is a bug anywhere the list can be empty.

### 11. A refused notification does not throw away the rest of the settings

`src/routes/settings/alerts/+page.svelte`.

Saving the alert settings asked the browser for notification permission and, when the answer was not "granted", returned before `notificationSettings.set` — so the badge, the sound and the alert types the person had just changed were discarded along with the refusal. All they saw was an error and their other choices reverting.

The settings are saved either way, with push forced off, and the message says what happened: a browser that never answers gets a different sentence from one that refuses.

Upstream candidate: yes.

### 12. A signer that never answers must not leave a blank page

`src/routes/+layout.svelte`, `src/app/session.ts`.

A member reported the chat opening once and then showing nothing but white on every later visit, in two browsers and in a private window, until he cleared the site data — which took him back to the login screen.

The whole startup sits inside `{#await unsubscribe}`, which renders nothing while pending, and the startup restores the session: `User.fromSigner` does `await signer.getPubkey()`, which for a remote signer is a question asked over the network. Welshman's NIP-46 request has no timeout, so a signer that is closed, locked or asleep leaves that promise unsettled — and the page blank, on every visit, with no way out but clearing storage.

Two changes. The pending branch now renders a spinner and, after twelve seconds, says the signer is not answering and offers "Try again" and "Log out". And restoring the session gives up after fifteen seconds and lets the app come up without the signer; the session is kept, so reopening with the signer awake works.

Upstream candidate: yes, both.

### 13. A remote signer listener that is alive and deaf must be reopened

`src/app/remoteSigner.ts`.

`Nip46Receiver` opens one subscription when the session starts and never opens it again: its `onClose` only forgets the abort controller. When that socket drops, answers keep arriving and nobody is listening — the signer looks alive, and every window sits on "Authenticating" until it is reloaded. Reported as `coracle-social/welshman` #61 and still present in the installed 0.10.9.

The first version of this patch called `start()` on a timer. That is not enough, and 26/09/2026 showed why: `start()` returns immediately while the subscription is live, so a subscription that is alive and *deaf* is never reopened. A member sat stuck for twenty-six minutes, reading fine and unable to write, while the watch called a no-op every five seconds.

Asking "does the subscription exist?" is a proxy, and the proxy is what lied. Now the watch pings the signer every thirty seconds — a real round trip through send, relay, signer, relay, receive — under a ten-second deadline of our own, because welshman's requests carry none. No answer means the path is broken whatever the object says, and the subscription is reopened.

Reopening aborts the controller and clears it rather than calling `receiver.stop()`. `stop()` also does `removeAllListeners()`, and every request in flight registers its own listener there; stripping it would turn a signature that is merely slow into one that hangs forever.

**Reopening the subscription is not enough either; the socket goes too (0.1.45, 27/09/2026).** The version above asked the right question and, on hearing "no", fixed the wrong thing. The console showed the loop plainly — "the remote signer did not answer; reopening the listener" every thirty seconds, for as long as the page stayed open. A socket to the club's pairing relay had gone half open: the server had let it go, the browser still thought it alive. Each fresh subscription went down the same dead line, followed by the ping meant to detect it, and only a reload made new sockets.

So `reopen` now calls `pool.remove(url)` for every relay of the broker before restarting the subscription, and the next request dials again. To reach those sockets the broker is given a pool of ours: the default one is created and kept inside `@welshman/signer`, out of reach. The pool travels in the broker's runtime params only; the session saved in storage is left as it was. Removing a socket is safe for an answer already on its way, because the club's pairing relay holds answers for a client that is reconnecting and the new subscription has no `since`.

**A correction, and a last resort (0.1.47, 27/09/2026).** The half-open socket was real but it was not what kept the chat in "Authenticating" — that is patch 15, in the relay's authentication, not in the path to the signer. What this patch does is still worth keeping, and a harness now proves it: with the chat's own code against a local pairing relay and a test signer, behind a proxy that can freeze connections without closing them, the watch recovers from a half-open socket (reopen, 43 s), from a clean drop (welshman reconnects by itself, 3 s) and from the network going away (two silent pings, then a rebuild).

The rebuild is new in 0.1.47. After two pings in a row with no answer the watch throws the broker away and builds another from the saved session — in place, what a reload does. The app keeps the signer it was handed, so the signer stays the same object; `sign` and `getPubkey` read `signer.broker` on every call, while `nip04` and `nip44` captured the old broker's methods at construction and are rebound. Each silent ping also logs `{queued, processing, listening}` — the sender's queue, whether it is stuck on a request, whether the receiver has a subscription at all — so the next stall says where it is instead of leaving it to be guessed.

Upstream candidate: yes. The library should reopen on close — the socket, not only the subscription — and its requests should carry a deadline.

### 14. A public page does not dial the signer's private-network relays

`src/app/remoteSigner.ts`, `reachableRelays`.

A signer on a LightningOS node puts the node's own pairing relay in the pairing link, first, next to the club's, so the chat served by that same node talks to it without leaving the house. A chat served from a public address never reaches it: the node answers with a self-signed certificate, and a browser refuses that on a WebSocket opened from another origin — no prompt, no way to accept. Accepting the warning on the signer page does not carry over to the socket; measured on 27/09/2026. So `chat.br-ln.com` dialed `wss://192.168.68.92:4448/pairing` on every start and every reopen of the watch in patch 13, and failed every time.

When the page's own host is public, relays on private networks leave the broker's list: 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, Tailscale's 100.64/10, `localhost`, `.local`, `.lan`, `.internal`, `.home.arpa`, and the IPv6 loopback, unique-local and link-local ranges. Only when something is left — a pairing whose only relay is private keeps it, and fails as it did, rather than being left with none. The narrowed list lives in the broker's runtime params; the saved session is untouched.

Upstream candidate: maybe. The rule is general, but whether a pairing link should carry a relay the client may not reach is the signer's decision, not the client's.

### 15. An authentication whose signature timed out is asked again

`src/app/authRetry.ts`, wired into `socketPolicy` in `src/app/policies.ts` for `nip46` sessions only.

**This is the root cause of the "Authenticating" that only a reload cured, reported since 20/09/2026 — and patches 13 and 14 did not touch it.** Measured on 27/09 and reproduced in a harness before any fix was written.

`AuthState.doAuth` in `@welshman/net` does `await tryCatch(() => sign(template), logError)` and, when that comes back empty, marks `DeniedSignature`. But `@welshman/lib`'s `tryCatch` attaches its handler to the promise and **returns the same promise, still rejecting**. So the error is logged — *"Failed to sign auth event: Signing timed out"* — and thrown again at the `await`: `doAuth` rejects before the line that would mark the refusal, the rejection escapes as *"Uncaught (in promise) Signing timed out"*, and the socket stays in `PendingSignature` for good. Nothing concludes it, nothing refuses it, and nothing asks again, because a relay only sends a challenge on a new connection.

A signature fails that way whenever it takes longer than the thirty seconds `signWithOptions` allows — for a remote signer, any hiccup: its node restarting (a LightningOS upgrade, on 27/09) or the path to it breaking just when the relay asks. Patch 13 cannot beat it: the watch needs up to forty seconds to notice a broken path.

The harness (a relay requiring NIP-42, the chat's own `remoteSigner.ts` behind a freezable proxy, welshman's own auth policy): with the path frozen while the relay asked and restored six seconds after the signature gave up, the console showed exactly the two lines members had been sending in screenshots, the signer signed normally again in 206 ms, and the authentication was still `pending_signature` two and a half minutes later. With this patch, it asked again at 35 s and was `ok` 0.2 s after the path came back.

The patch treats a signature that outlives the timeout (35 s) as failed and puts the socket back to `Requested` — what welshman's own `retryAuth` does first — so the app's auth policy signs again with the same signer and the same `shouldAuth`. It stays out of `DeniedSignature` on purpose: in `PendingSignature` welshman keeps the requests made while waiting and sends them once authenticated, so the rooms fill in by themselves. It reads the socket's current status rather than the event's, because welshman emits `PendingSignature` from inside `Requested` and the late event would otherwise cancel the retry — which the harness caught.

Limited to `nip46` sessions: a remote signer never refuses, it is only slow; a browser extension would have its prompt put back up every half minute.

Upstream candidate: **yes, and the real fix belongs there.** `tryCatch` should return the handled promise, not the original one — every caller that expects `undefined` on failure is affected, not only authentication.

### 16. No message a relay won't read, and a room's context in slices

`src/app/messageLimit.ts`, wired into `socketPolicy` in `src/app/policies.ts`; `loadFrom` in `src/app/feeds.ts`.

**The status going round Not Connected, Connecting, Authenticating and Connected, reported on 27/09/2026 after moving between rooms and back to Open Bar, cured only by a reload.** Not the same defect as patch 15: the console was clean, and the relay logged a new connection from the member every 2.5 s for four minutes, each lasting about a second; nginx showed each one receiving about 1.4 KB — the challenge, the authentication's OK, a few answers — before closing.

A relay reads at most 512 KB in one message (khatru's default, and so every relay the club runs), and one that is sent more drops the connection with a 1009 instead of refusing it. A 523 KB request sent to the club's relay by hand came back closed in 1.2 s, and the relay logs nothing. The chat builds such a request: opening a room hands everything the browser already holds for it to the feed context in one go, which asks for the reactions and comments of all of them at once — each id named twice, 67 bytes a name — and the loader merges requests made within 50 ms into a single filter. Open Bar has 80,149 messages; about 7,700 in memory are enough.

One such request drops the connection once. The loop is welshman's: when a connection that had been open for more than five seconds drops, `socketPolicyLifecycle` replays what is pending at once, before the loader's `CLOSE` for the abandoned request has left the queue. The `CLOSE` goes out, the request goes back in as pending, and nobody owns it any more: it is sent again on every connection, and every connection drops. The harness (a khatru with the default limit, the app's socket policies, a connection aged six seconds, the app's loader) showed exactly that: the request finished at 6.6 s and the socket kept dropping and reopening to the end of the run, 12 connections in 30 s. With this patch, one connection in 30 s, the oversized request refused before leaving and the next ones served in 200 ms.

Two changes. `messageLimit.ts` never lets a message over 500,000 bytes leave a socket: it is taken off the send queue before it goes out, a warning names its size, and whoever waits on it gets the `CLOSED` or `OK false` a relay would have sent. `feeds.ts` asks for a room's context 250 events at a time, newest first, one slice after another so the loader can't merge them back, and the follow-up deletion requests the same way.

Upstream candidate: yes, both halves. The replay that resurrects a closed request is a welshman bug in its own right.

### 17. A signer that doesn't implement `switch_relays` can still log in

`tolerateSwitchRelays` in `src/app/nip46.ts`, applied to the brokers built by `LogInBunker.svelte` (bunker link) and `Nip46Controller` (QR code).

welshman's `Nip46Broker.connect` and `waitForNostrconnect` call `switch_relays` right after the signer accepts and await it, so a signer that answers that optional method with an error turns an accepted connection into an exception. Amethyst 1.13 does exactly that (*"unsupported method: switch_relays"*), and on 27/09/2026 a founder pairing it was told *"Something went wrong, please try again!"* every time, after the signer had already said yes.

Reproduced with Amethyst's own CLI signer (`amy bunker`, 1.16.0) against `chat.br-ln.com`: `connect` ok, `switch_relays` refused, nothing more. With the patch, against the same signer: `switch_relays` refused and logged, `get_public_key` ok, `sign_event` ok, and the chat lands on the home screen logged in. On a refusal the broker keeps the relays it already has, which is what nostr-tools does.

Upstream candidate: yes — reported by someone else the same day as coracle-social/welshman#64.

### 18. A remote signer's session remembers the member's pubkey

`RemoteSignerData` and `trustRememberedPubkey` in `src/app/remoteSigner.ts`, `rememberPubkey` in `src/app/core.ts`, the `SIGNER_PUBKEY_CHANGED` handler in `src/app/session.ts`.

A saved NIP-46 session held the pairing (`clientSecret`, `signerPubkey`, `relays`) but not the member's own pubkey, so every page load asked the signer who the member is and showed nothing until it answered, for at most fifteen seconds. A signer that is another app on a phone -- Amethyst in the background on Android -- often doesn't answer in time, and the member landed on the login screen on every reload with the session still saved. Reported by a member as issue #1 of this fork, with the console trace, on 27/09/2026.

Reproduced with Amethyst's own CLI signer (`amy bunker`) put to sleep between login and reload: the login screen at 15.3 s. With this patch the saved session carries `userPubkey`, and the same reload is back on the home screen in 1 s.

The login stores the pubkey the signer reported. Sessions saved before this get it on their next successful login, and a legacy session converts its own. On restore the signer is trusted with that pubkey, and asked in the background whether it still holds that key -- the NIP-46 sender doesn't wait on replies, so nothing queues behind the question. If the answer differs, the remembered pubkey is dropped and the page reloads, so the identity shown is never another than the signer's. Signatures are always the signer's own key regardless. Tested by planting a wrong pubkey in the session: warned, reloaded, back with the right one in 4 s.

The pubkey is public and already on the device (for Amethyst it is the `signerPubkey` itself), and "Log Out" clears the session with it.

Upstream candidate: yes -- welshman's `Nip46Signer` only caches the pubkey in memory.

### 19. Link cards from the club's own server

`LINK_PREVIEW_URL` in `src/app/env.ts`, used by `ContentLinkBlock.svelte`; `VITE_LINK_PREVIEW_URL` in `deploy/brln.env`.

Flotilla draws a card for a link -- title, description, image -- with data from Coracle's Dufflepud server, which would learn every link the club's members open, from their own IP. The club's build had it off for that reason (`VITE_DUFFLEPUD_URL` empty, and CI refuses a build that references it), so links showed as bare text. Asked for on 28/09/2026.

The club now runs the same job itself: `brln-link-preview` in brln-community, behind `https://chat.br-ln.com/preview`. The member's browser asks the club, and only the club's server visits the page. It refuses internal addresses at connect time (after DNS, so a rebinding name can't slip through), dials only ports 80 and 443, reads YouTube through oEmbed, caches, limits each address, and logs no link. The address is absolute because the same image runs in every node's LightningOS app, which asks the club's server too; the service allows any origin for that reason.

A separate variable rather than `VITE_DUFFLEPUD_URL`, which also switches on features that expect Coracle's server. Without it the card falls back to Dufflepud if that is set, and to no card otherwise, as before.

The card's image still loads from the site that published it, as it would if the member opened the link.

### 20. A newcomer not yet admitted is told at once, sent to register, and let in when admitted

`isRefusalOfTheWholeRelay` in `src/app/policies.ts`, `membersOnly` in `src/app/access.ts`, `SpaceJoin.svelte`, `SpaceAuthError.svelte`; `VITE_PLATFORM_ACCESS_URL` in `deploy/brln.env`.

Walking the journey on 28/09/2026 as a newcomer whose npub the relay hadn't admitted -- someone who opened the chat within the minute registration takes, or registered another npub -- the chat showed a silent "Space Details" page for about thirty seconds, then an English error, then a "Request Access" button that sent a NIP-29 join request the club's relay can't grant and opened a second modal before reaching the Services dashboard.

- **Told at once.** The relay turns a non-member away with "restricted: you are not a member of this relay", distinct from a refused room ("...of that group"). One such refusal now marks the space, instead of waiting until most requests had been refused; each new connection is judged afresh. In the harness the notice came 12 s after Next, most of it the login itself.
- **In the members' language.** The notice is Portuguese first, English after, names the npub in use, and says a fresh registration takes up to a minute.
- **One button to the right place.** Where the platform grants access on its own page (`PLATFORM_ACCESS_URL`), the join modal and the auth error both link straight to it: "Liberar meu acesso", now `services.br-ln.com/comunidade/acesso` rather than the dashboard.
- **Let in without reloading.** The join modal asks again every 20 s for five minutes. The relay accepts a member's join request, so the first attempt that comes back clean completes the join and opens the space. Seen on the club's relay: refused join requests from the test at 16:02:03, 16:02:27, 16:02:51.

### 21. A guardian is never a space of its own

`src/app/guardioes.ts`, `makeEventPath` and `makeEventPermalink` in `src/app/routes.ts`, `src/routes/spaces/[relay]/+layout.ts`; `src/app/mirrors.ts` now takes its definitions from `guardioes.ts`.

On 30/09/2026 Jaime found himself at `/spaces/relay3.br-ln.com/geral` without having chosen anything: the menu listed 6 of the 13 rooms, and a reload kept it that way. The three relays held the same events and each served all 13 rooms to a member; the chat had simply opened a guardian as if it were another club. The path of any event -- a quote, a home item, a pin, a badge -- was built from the first relay that delivered it, and with three relays delivering the same thing, the first is sometimes a guardian. In a guardian's space the menu only knows the rooms whose metadata arrived from that relay, since what was already in the browser isn't fetched again.

- **Event paths and permalinks** replace a guardian with the club's relay (`noEspacoDoClube`) before choosing where to go.
- **A guardian's address redirects** to the same page in the club's space before the page mounts, for links already saved or shared.
- **Nothing changes during an outage**: the club's space already reads from all three relays (`relaysDoEspaco`) and counts what a guardian delivers as seen on the club (`ligaOsGuardioes`).

## Updating from upstream

```sh
git fetch upstream
git rebase <new-upstream-commit>
pnpm i --frozen-lockfile && pnpm run lint && pnpm run check
```

Update the base above and re-run the evaluation workflow in `brln-community`. Watch for new hard-coded services and new places that persist the session.
