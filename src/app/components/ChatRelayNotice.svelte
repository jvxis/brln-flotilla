<script lang="ts">
  // Uma tarja que só aparece para quem tem a caixa de correio incompleta, e some sozinha
  // quando deixa de estar.
  //
  // Ela vive aqui, na tela das mensagens diretas, e não entre os avisos de saúde, por dois
  // motivos. O primeiro é que os avisos de saúde moram em `/home`, e este chat não tem Home:
  // o item some da barra quando existe relay de plataforma, porque o clube é um espaço só.
  // Um aviso ali seria escrito e nunca lido. O segundo é que este é o lugar certo de
  // qualquer forma -- a pessoa está aqui justamente quando o assunto importa, e o menu
  // "Manage Relays", que faz isto à mão, está a um palmo.
  //
  // O botão acrescenta o que falta; não substitui a lista. A caixa é da pessoa, e ela pode
  // ter relays próprios que não cabe a nós apagar.
  import {uniq} from "@welshman/lib"
  import {MessagingRelayLists, RelayLists} from "@welshman/app"
  import Mailbox from "@assets/icons/mailbox.svg?dataurl"
  import Icon from "@lib/components/Icon.svelte"
  import Button from "@lib/components/Button.svelte"
  import {app} from "@app/core"
  import {publish} from "@app/publish"
  import {relaysDoClube} from "@app/healthChecks"

  const pubkey = $app.user?.pubkey ?? ""

  const listas = $app.use(MessagingRelayLists).index.$

  const atuais = $derived($listas.get(pubkey)?.urls() ?? [])

  // Só para quem já tem caixa. Quem não tem nenhuma cai no aviso de saúde que já existia, e
  // aquele entrega os três de uma vez.
  const faltando = $derived(
    atuais.length > 0 ? relaysDoClube.filter(url => !atuais.includes(url)) : [],
  )

  // A lista de relays (kind 10002) é por onde os outros acham o que a pessoa escreve -- inclusive
  // esta caixa. Quem chegou com uma lista de antes do clube, que não nomeia relay nenhum dele,
  // fica difícil de achar: em 02/10/2026 o André não conseguia responder ao Jaime por isso. E um
  // app de fora (o Flotilla oficial) nem se autentica num relay que a lista não cita. Pelo chat
  // não há outra tela para corrigi-la, então esta tarja faz isso: acrescenta os relays do clube
  // para ler e escrever, sem tirar nenhum dos que a pessoa já tem.
  const listasDeRelays = $app.use(RelayLists).index.$

  const listaDeRelays = $derived($listasDeRelays.get(pubkey))

  const semOClube = $derived.by(() => {
    const leitura = listaDeRelays?.readUrls() ?? []
    const escrita = listaDeRelays?.writeUrls() ?? []

    return (
      leitura.length + escrita.length > 0 &&
      relaysDoClube.some(url => !leitura.includes(url) || !escrita.includes(url))
    )
  })

  let aplicando = $state(false)
  let acrescentando = $state(false)

  const acrescentarOClube = async () => {
    acrescentando = true

    try {
      await $app
        .use(RelayLists)
        .update(writer => {
          for (const url of relaysDoClube) {
            writer.addReadUrl(url).addWriteUrl(url)
          }
        })
        .then(publish)
    } finally {
      acrescentando = false
    }
  }

  const aplicar = async () => {
    aplicando = true

    try {
      await $app
        .use(MessagingRelayLists)
        .setUrls(uniq([...atuais, ...relaysDoClube]))
        .then(publish)
    } finally {
      aplicando = false
    }
  }
</script>

{#if faltando.length > 0}
  <div class="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
    <div class="flex min-w-0 items-start gap-3">
      <Icon icon={Mailbox} size={4} class="mt-1 shrink-0" />
      <div class="flex min-w-0 flex-col gap-1">
        <strong class="text-sm">Incomplete DM Relays</strong>
        <p class="text-sm opacity-75">
          Your direct messages depend on a single server. If it goes down they stop arriving and
          stop going out, even though the club's other servers are holding them.
        </p>
      </div>
    </div>
    <Button class="button button-primary button-sm shrink-0" onclick={aplicar} disabled={aplicando}>
      {aplicando ? "Adding..." : "Add The Rest"}
    </Button>
  </div>
{/if}
{#if semOClube}
  <div class="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
    <div class="flex min-w-0 items-start gap-3">
      <Icon icon={Mailbox} size={4} class="mt-1 shrink-0" />
      <div class="flex min-w-0 flex-col gap-1">
        <strong class="text-sm">Relay List Without The Club</strong>
        <p class="text-sm opacity-75">
          Your relay list doesn't name the club's servers, so other members' apps look for your
          messages elsewhere and may tell them you can't receive direct messages.
        </p>
      </div>
    </div>
    <Button
      class="button button-primary button-sm shrink-0"
      onclick={acrescentarOClube}
      disabled={acrescentando}>
      {acrescentando ? "Adding..." : "Add The Club"}
    </Button>
  </div>
{/if}
