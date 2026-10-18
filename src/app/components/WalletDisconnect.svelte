<script lang="ts">
  import {isNWCWallet} from "@welshman/util"
  import Confirm from "@lib/components/Confirm.svelte"
  import {wallet} from "@app/lightning"
  import {clearModals} from "@app/modal"
  import {shareWallet} from "@app/walletSync"

  // BR⚡LN: an NWC wallet is shared across the member's devices, so it goes from all of them.
  const shared = $wallet && isNWCWallet($wallet)

  const confirm = async () => {
    wallet.set(undefined)

    if (shared) shareWallet()

    clearModals()
  }
</script>

<Confirm
  {confirm}
  title="Disconnect Wallet"
  message={shared
    ? "Are you sure you want to disconnect your bitcoin wallet? It will also be disconnected on your other devices."
    : "Are you sure you want to disconnect your bitcoin wallet?"} />
