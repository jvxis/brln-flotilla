<script module lang="ts">
  import {sleep} from "@welshman/lib"
  import {dufflepud, DUFFLEPUD_URL, LINK_PREVIEW_URL} from "@app/env"

  type Preview = {url?: string; title?: string; description?: string; image?: string}

  // Opening the Library asks for every link on every shelf at once, and the club's service lets an
  // address ask only so many times a minute (429). Those used to be cached as failures for the
  // whole visit, so most of a shelf showed bare links (02/10/2026). A busy answer now waits out the
  // service's minute and asks again, and no failure is kept: the next time the link is drawn, it
  // asks once more.
  const WAITS = [5_000, 20_000, 40_000]

  const previews = new Map<string, Promise<Preview>>()

  const fetchPreview = async (url: string): Promise<Preview> => {
    const endpoint = LINK_PREVIEW_URL || (DUFFLEPUD_URL ? dufflepud("link/preview") : "")

    if (!endpoint) {
      throw new Error("Link previews are disabled")
    }

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({url}),
      })

      if (res.status === 429 && attempt < WAITS.length) {
        await sleep(WAITS[attempt])
        continue
      }

      const json = res.ok ? await res.json().catch(() => undefined) : undefined

      if (!json?.title && !json?.image) {
        throw new Error("Failed to load link preview")
      }

      return json
    }
  }

  // Cache previews by url so the same link isn't re-fetched across renders/instances.
  const loadPreview = (url: string) => {
    let promise = previews.get(url)

    if (!promise) {
      promise = fetchPreview(url)
      previews.set(url, promise)
      promise.catch(() => previews.delete(url))
    }

    return promise
  }
</script>

<script lang="ts">
  import {call, ellipsize, displayUrl} from "@welshman/lib"
  import {isRelayUrl} from "@welshman/util"
  import {Capacitor} from "@capacitor/core"
  import {preventDefault, stopPropagation} from "@lib/html"
  import Link from "@lib/components/Link.svelte"
  import Spinner from "@lib/components/Spinner.svelte"
  import ContentLinkDetail from "@app/components/ContentLinkDetail.svelte"
  import ContentLinkUrl from "@app/components/ContentLinkUrl.svelte"
  import ContentLinkBlockImage from "@app/components/ContentLinkBlockImage.svelte"
  import {pushModal} from "@app/modal"
  import {PLATFORM_URL, THUMBNAIL_URL} from "@app/env"
  import {
    getUrlContentType,
    AUDIO_CONTENT_TYPES,
    IMAGE_CONTENT_TYPES,
    VIDEO_CONTENT_TYPES,
  } from "@app/content"
  import {isRoomId} from "@app/rooms"

  const {value, event} = $props()

  let hideImage = $state(false)

  const url = value.url.toString()
  const isRoomOrRelay = isRoomId(url) || isRelayUrl(url)
  const [href, external] = call(() => {
    if (url.startsWith(PLATFORM_URL)) return [url.replace(PLATFORM_URL, ""), false]

    return [url, true]
  })

  const fileType = getUrlContentType(url, event)

  const isAudio =
    Boolean(url.match(/\.(mp3|m4a|wav|ogg|oga|opus|flac)$/)) ||
    AUDIO_CONTENT_TYPES.includes(fileType)

  const isVideo = Boolean(url.match(/\.(mov|webm|mp4)$/)) || VIDEO_CONTENT_TYPES.includes(fileType)

  const isImage =
    Boolean(url.match(/\.(jpe?g|png|gif|webp)$/)) || IMAGE_CONTENT_TYPES.includes(fileType)

  const getVideoPoster = (videoUrl: string): string | undefined => {
    if (Capacitor.getPlatform() === "android" && THUMBNAIL_URL) {
      return `${THUMBNAIL_URL}/thumbnail?url=${encodeURIComponent(videoUrl)}`
    }

    return undefined
  }

  // An image made on first request -- GitHub's release cards, for one -- can fail the first time and
  // be there a moment later, so a failed image is tried once more before it's dropped.
  let imageRetried = false

  const onError = () => {
    hideImage = true

    if (!imageRetried) {
      imageRetried = true
      setTimeout(() => {
        hideImage = false
      }, 4000)
    }
  }

  const expand = () =>
    pushModal(ContentLinkDetail, {value, event}, {fullscreen: true, label: "Content preview"})
</script>

{#if isRoomOrRelay}
  <ContentLinkUrl {url} class="link-content whitespace-nowrap" />
{:else if isAudio}
  <audio controls src={url} preload="metadata" class="my-2 w-full max-w-xl"></audio>
{:else if isVideo}
  <Link {external} {href} class="my-2 block">
    <video
      controls
      src={url}
      poster={getVideoPoster(url)}
      preload="metadata"
      class="max-h-96 rounded-2xl object-contain object-center">
      <track kind="captions" />
    </video>
  </Link>
{:else if isImage}
  <Link {external} {href} class="my-2 block">
    <button type="button" onclick={stopPropagation(preventDefault(expand))}>
      <ContentLinkBlockImage {value} {event} class="m-auto max-h-96 rounded-2xl" />
    </button>
  </Link>
{:else}
  {#await loadPreview(url)}
    <Link {external} {href} class="my-2 block">
      <div
        class="border border-solid flex max-w-xl flex-col overflow-hidden leading-normal rounded-2xl"
        style="border-color: var(--line)">
        <div class="flex flex-col gap-2 p-4">
          <Spinner>
            <span class="overflow-hidden text-ellipsis whitespace-nowrap">{displayUrl(url)}</span>
          </Spinner>
        </div>
      </div>
    </Link>
  {:then preview}
    <Link {external} {href} class="my-2 block">
      <div
        class="border border-solid flex max-w-xl flex-col overflow-hidden leading-normal rounded-2xl"
        style="border-color: var(--line)">
        {#if preview.image && !hideImage}
          <img
            alt=""
            onerror={onError}
            src={preview.image}
            class="bg-surface max-h-72 object-contain object-center" />
        {/if}
        <div class="flex flex-col gap-2 p-4">
          <strong class="overflow-hidden text-ellipsis whitespace-nowrap"
            >{preview.title || displayUrl(url)}</strong>
          <p>{ellipsize(preview.description ?? "", 140)}</p>
        </div>
      </div>
    </Link>
  {:catch}
    <ContentLinkUrl {url} class="link-content whitespace-nowrap" />
  {/await}
{/if}
