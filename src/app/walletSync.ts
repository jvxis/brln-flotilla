import {isNWCWallet, WalletType} from "@welshman/util"
import type {NWCInfo} from "@welshman/util"
import {app} from "@app/core"
import {wallet} from "@app/lightning"
import {getSetting, publishSettings, settings, userSettingsValues} from "@app/settings"
import type {SyncedWallet} from "@app/settings"

// The member's wallet follows them across devices. Upstream keeps the wallet only on the device it
// was connected on, so on 17/10/2026 Jaime had his wallet on the desktop and only the lightning
// address (which is in the profile) on the phone. A wallet connected by Nostr Wallet Connect is
// just its connection details, and they now travel in the settings event, which is encrypted to the
// member's own key (NIP-44), the same way upstream keeps the OpenRouter key there. A browser
// extension wallet (WebLN) lives in that one browser and stays per device: it is never replaced by
// the synced one.

// When this device last took or gave the synced wallet. A synced value older than that is one this
// device already has, or one it replaced with a newer wallet whose publish has not come back yet.
// Kept per member, since two people can use the same browser.
const stampKey = () => `brln:wallet-sync-at:${app.get().user?.pubkey ?? ""}`

const getStamp = () => {
  try {
    return Number(localStorage.getItem(stampKey())) || 0
  } catch {
    return 0
  }
}

const setStamp = (at: number) => {
  try {
    localStorage.setItem(stampKey(), String(at))
  } catch {
    // Without storage the next load just applies the synced wallet again, which changes nothing
  }
}

const sameWallet = (a: NWCInfo, b: NWCInfo) =>
  a.walletPubkey === b.walletPubkey && a.secret === b.secret && a.relayUrl === b.relayUrl

// Called when this device connects an NWC wallet (info) or disconnects one (no info).
export const shareWallet = async (info?: NWCInfo) => {
  const at = Date.now()

  setStamp(at)

  try {
    await publishSettings({wallet_nwc: {info, at}})
  } catch (e) {
    console.warn("BR⚡LN: could not share the wallet with the other devices", e)
  }
}

const apply = (synced: SyncedWallet | undefined) => {
  if (!synced || synced.at <= getStamp()) return

  const local = wallet.get()

  if (synced.info) {
    if (!local || (isNWCWallet(local) && !sameWallet(local.info, synced.info))) {
      wallet.set({type: WalletType.NWC, info: synced.info})
    }
  } else if (local && isNWCWallet(local)) {
    wallet.set(undefined)
  }

  setStamp(synced.at)
}

export const watchWalletSync = () => {
  let pubkey: string | undefined
  let stopSettings = () => {}

  const start = async (current: string) => {
    // The settings event is encrypted and arrives after the app starts; until it has loaded the
    // values are the defaults, which would read as "no wallet anywhere".
    const loaded = await settings
      .get()
      .forceLoad(current)
      .catch(() => undefined)

    if (pubkey !== current) return

    // A wallet connected before this existed is shared once, from the device that has it. Only
    // once the settings event has really loaded: sharing writes the whole settings event, and from
    // the defaults it would wipe the member's real settings.
    const local = wallet.get()

    if (loaded && getSetting("wallet_nwc") === undefined && local && isNWCWallet(local)) {
      await shareWallet(local.info)
    }

    if (pubkey !== current) return

    stopSettings = userSettingsValues.subscribe($settings => apply($settings.wallet_nwc))
  }

  const stopApp = app.subscribe($app => {
    const next = $app.user?.pubkey

    if (next === pubkey) return

    stopSettings()
    stopSettings = () => {}
    pubkey = next

    if (next) start(next)
  })

  return () => {
    pubkey = undefined
    stopSettings()
    stopApp()
  }
}
