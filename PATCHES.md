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

## Updating from upstream

```sh
git fetch upstream
git rebase <new-upstream-commit>
pnpm i --frozen-lockfile && pnpm run lint && pnpm run check
```

Update the base above and re-run the evaluation workflow in `brln-community`. Watch for new hard-coded services and new places that persist the session.
