<script lang="ts">
  import {stopPropagation} from "svelte/legacy"
  import {noop} from "@welshman/lib"
  import {PublishStatus} from "@welshman/net"
  import type {BaseThunk} from "@welshman/app"
  import Danger from "@assets/icons/danger-triangle.svg?dataurl"
  import Icon from "@lib/components/Icon.svelte"
  import Tippy from "@lib/components/Tippy.svelte"
  import ThunkToast from "@app/components/ThunkToast.svelte"
  import ThunkStatusDetail from "@app/components/ThunkStatusDetail.svelte"
  import {thunks} from "@app/core"
  import {pushToast} from "@app/toast"

  type Props = {
    thunk: BaseThunk
    showToastOnRetry?: boolean
    class?: string
  }

  const {thunk, showToastOnRetry, ...restProps}: Props = $props()

  // Falha é nenhum relay ter aceitado, e não algum ter recusado.
  //
  // Os relays de um espaço do clube são cópias um do outro: o que chega a qualquer um aparece
  // em todos, por replicação. Uma mensagem aceita por dois de três está entregue, e dizer
  // "Failed to send!" ali seria alarme falso -- justo na mensagem que deu certo. Pior, seria
  // um alarme permanente enquanto um guardião estivesse fora do ar ou ainda sendo instalado.
  //
  // Quando parte falhou e parte não, o detalhe continua dizendo "Partial delivery x/y" a quem
  // abrir, e o botão de tentar de novo continua lá. O que muda é só não gritar por isso.
  const showFailure = $derived(
    $thunk.isComplete() &&
      $thunk.getFailedUrls().length > 0 &&
      $thunk.getUrlsWithStatus(PublishStatus.Success).length === 0,
  )

  const retry = (url: string) => {
    for (const child of $thunks.flatten([thunk])) {
      if (child.options.relays.includes(url)) {
        const retried = $thunks.publish({...child.options, event: child.event, relays: [url]})

        if (showToastOnRetry) {
          pushToast({
            timeout: 30_000,
            children: {
              component: ThunkToast,
              props: {thunk: retried},
            },
          })
        }

        return
      }
    }
  }
</script>

{#if showFailure}
  <button
    class="flex w-full justify-end px-1 text-xs {restProps.class}"
    onclick={stopPropagation(noop)}>
    <Tippy
      class="flex items-center"
      component={ThunkStatusDetail}
      props={{thunk, retry}}
      params={{interactive: true, maxWidth: "none", trigger: "click"}}>
      <span class="flex cursor-pointer items-center gap-1 opacity-75">
        <Icon icon={Danger} class="text-error" size={3} />
        <span>Failed to send!</span>
      </span>
    </Tippy>
  </button>
{/if}
