import {redirect} from "@sveltejs/kit"
import {normalizeRelayUrl} from "@welshman/util"
import {eGuardiao, espacoDoClube} from "@app/guardioes"
import type {LayoutLoad} from "./$types"

// Um endereço de guardião -- de um link salvo, de um clique antigo -- vai para o mesmo lugar no
// espaço do clube, antes de a página montar. Ver guardioes.ts.
export const load: LayoutLoad = ({params, url}) => {
  if (eGuardiao(normalizeRelayUrl(decodeURIComponent(params.relay)))) {
    const clube = encodeURIComponent(espacoDoClube.replace(/^wss:\/\//, "").replace(/\/$/, ""))

    redirect(307, url.pathname.replace(/^\/spaces\/[^/]+/, `/spaces/${clube}`) + url.search)
  }
}
