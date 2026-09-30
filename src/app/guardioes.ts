import {normalizeRelayUrl} from "@welshman/util"
import {PLATFORM_RELAYS, SPACE_MIRRORS} from "@app/env"

// Quem é o clube e quem é guardião, sem depender de mais nada do app: o redirecionamento da rota
// precisa disto antes de o app subir.

// O espaço a que os guardiões pertencem. Um só, que é como este clube existe.
export const espacoDoClube = PLATFORM_RELAYS[0]

export const guardioes = new Set(SPACE_MIRRORS.filter(url => url !== espacoDoClube))

export const temGuardioes = Boolean(espacoDoClube) && guardioes.size > 0

export const eGuardiao = (url: string) => temGuardioes && guardioes.has(normalizeRelayUrl(url))

// noEspacoDoClube troca o endereço de um guardião pelo do clube. Um guardião guarda a conversa
// do clube; ele não é um espaço. Em 30/09/2026 um clique numa citação levou o Jaime a
// /spaces/relay3.br-ln.com, porque o endereço de um evento saía do primeiro relay que o
// entregou -- e com três relays entregando a mesma coisa, às vezes o primeiro é um guardião. Lá
// o menu mostrava 6 das 13 salas, e nem o refresh desfazia.
export const noEspacoDoClube = (url: string) => (eGuardiao(url) ? espacoDoClube : url)
