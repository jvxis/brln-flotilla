import {uniq} from "@welshman/lib"
import {
  APP_DATA,
  BLOCKED_RELAYS,
  BLOSSOM_SERVERS,
  FOLLOWS,
  MESSAGING_RELAYS,
  MUTES,
  PROFILE,
  RELAYS,
  ROOMS,
  SEARCH_RELAYS,
} from "@welshman/util"
import {Router} from "@welshman/app"
import type {Command} from "@welshman/app"
import {app} from "@app/core"
import {PLATFORM_RELAYS} from "@app/env"
import {relaysDoEspaco} from "@app/mirrors"

// The kinds that say who a person is and how to reach them: their profile, the relays they read,
// write and receive messages on, who they follow and mute, and the preferences the app restores
// on a fresh browser.
const IDENTITY_KINDS = new Set([
  APP_DATA,
  BLOCKED_RELAYS,
  BLOSSOM_SERVERS,
  FOLLOWS,
  MESSAGING_RELAYS,
  MUTES,
  PROFILE,
  RELAYS,
  ROOMS,
  SEARCH_RELAYS,
])

// Publishing sends an event to the relays the author's own relay list (kind 10002) names, which
// is right on the open network and wrong for a club: someone who arrived with a Nostr identity
// from years ago has a list naming only strangers' relays, and the club ends up holding none of
// their profile, mailbox or preferences. Finding them then depends on a relay nobody here runs,
// and a member's first login on a fresh browser depends on it too. So an event that says who
// someone is goes to the club's relays as well as wherever else it was headed. Everything else
// -- messages, articles, reactions -- is routed exactly as before. Where no platform relay is
// configured this changes nothing.
// E o que vai para o espaço do clube vai também para os guardiões. Escrever só no relay do
// clube bastaria enquanto ele estiver de pé -- a replicação levaria a mensagem aos guardiões
// sozinha. Mas o momento em que os guardiões importam é justamente aquele em que ele não está,
// e aí uma mensagem escrita só para ele não é escrita em lugar nenhum. Os três aceitam o mesmo
// evento, com o mesmo id, então mandar aos três não duplica nada.
const comOsGuardioes = (relays: string[]) => uniq(relays.flatMap(relaysDoEspaco))

export const publish = (command: Command) =>
  command.publishToRelays(
    IDENTITY_KINDS.has(command.event.kind)
      ? uniq([...comOsGuardioes(command.relays), ...PLATFORM_RELAYS])
      : comOsGuardioes(command.relays),
  )

// E o que se lê de uma pessoa -- a caixa de diretas, a lista de relays, o perfil -- se procura
// nos relays de escrita que a lista dela (kind 10002) declara. Muita gente chegou ao clube com
// uma lista antiga que não nomeia relay nenhum do clube, e a dela continua sendo lida assim: em
// 02/10/2026 o André não conseguia responder ao Jaime ("Direct messages are not enabled"), porque
// a 10002 do Jaime, de 2024, só nomeia nos.lol, relay.nostr.band e nostr.wine, e a caixa de
// diretas dele (10050) só existe nos relays do clube. Então quem lê o outbox de alguém pergunta
// também aos relays do clube, que guardam a identidade de todo associado. Chamado a cada app
// novo (syncApplicationData), já que um login troca o app e com ele o Router.
type ComOutbox = {outboxRelays: (pubkey?: string) => Promise<string[]>}

const comLeitura = new WeakSet<Router>()

export const ligaLeituraDoClube = () => {
  const router = app.get().use(Router)

  if (PLATFORM_RELAYS.length > 0 && !comLeitura.has(router)) {
    comLeitura.add(router)

    const outbox = router as unknown as ComOutbox
    const original = outbox.outboxRelays

    outbox.outboxRelays = async (pubkey?: string) =>
      pubkey ? uniq([...(await original(pubkey)), ...comOsGuardioes(PLATFORM_RELAYS)]) : []
  }

  return () => {}
}
