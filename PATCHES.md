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

Upstream candidate: the socket close and the local departure, yes. The reload is a stopgap for this deployment until the stores recover on their own.

## Updating from upstream

```sh
git fetch upstream
git rebase <new-upstream-commit>
pnpm i --frozen-lockfile && pnpm run lint && pnpm run check
```

Update the base above and re-run the evaluation workflow in `brln-community`. Watch for new hard-coded services and new places that persist the session.
