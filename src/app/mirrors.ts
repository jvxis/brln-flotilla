import {uniq} from "@welshman/lib"
import {on} from "@welshman/lib"
import {app} from "@app/core"
import {espacoDoClube, guardioes, temGuardioes} from "@app/guardioes"

// Os guardiões: relays que guardam a mesma conversa que o relay do clube, para que ela continue
// existindo se a máquina do clube cair. Eles se mantêm iguais entre si sozinhos, por replicação;
// o que falta é o chat saber que os três são **um** espaço, e não três clubes diferentes.
//
// Fazer isso pela lista de relays de cada tela seria mexer em mais de duzentos lugares que hoje
// recebem uma url só, e bastaria esquecer um para a coisa falhar em silêncio. Mas a pergunta que
// importa é feita num lugar só. Em feeds.ts, um evento pertence a uma tela se:
//
//     relays.some(url => tracker.getRelays(event.id).has(url))
//
// -- ou seja, se foi **visto** num dos relays daquela tela. É o tracker que responde, e é nele
// que a resposta se conserta: um evento que chega por um guardião passa a contar também como
// visto no relay do clube. A partir daí tudo o mais -- feed, salas, membros, papéis, busca --
// funciona sem saber que existe guardião nenhum.
//
// Não é uma mentira conveniente: o evento realmente pertence ao clube, e é dele que o guardião o
// copiou. O que o tracker guardava era por onde ele entrou, que é outra pergunta.

// relaysDoEspaco diz de quais relays um espaço é feito. Para o clube, os três; para qualquer
// outro espaço, ele mesmo -- porque um guardião do clube não guarda espaço de mais ninguém.
export {temGuardioes}

export const relaysDoEspaco = (url: string) =>
  temGuardioes && url === espacoDoClube ? uniq([url, ...guardioes]) : [url]

// ligaOsGuardioes faz a ponte no tracker. Chamado uma vez, na subida.
export const ligaOsGuardioes = () => {
  if (!temGuardioes) return () => {}

  const {tracker} = app.get()

  const adota = (id: string) => {
    // addRelay não faz nada se já estiver lá, e o que ele emite é sempre a url do clube, que
    // não é de guardião nenhum -- então isto não se chama de volta.
    tracker.addRelay(id, espacoDoClube)
  }

  // O que chega agora.
  const desligaAdd = on(tracker, "add", (id: string, url: string) => {
    if (guardioes.has(url)) {
      adota(id)
    }
  })

  // E o que já estava guardado no navegador. Quem tiver lido durante uma queda tem eventos
  // marcados só com o guardião; sem isto, eles sumiriam da tela no próximo carregamento --
  // exatamente as mensagens da queda, que os guardiões existem para não perder.
  const desligaLoad = on(tracker, "load", () => {
    for (const guardiao of guardioes) {
      for (const id of tracker.getIds(guardiao)) {
        adota(id)
      }
    }
  })

  // E os que já estavam em memória quando isto ligou.
  for (const guardiao of guardioes) {
    for (const id of tracker.getIds(guardiao)) {
      adota(id)
    }
  }

  return () => {
    desligaAdd()
    desligaLoad()
  }
}
