import "@poppanator/sveltekit-svg/dist/svg"
import "vite-plugin-pwa/pwa-assets"

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  // Set by vite.config.ts: whether this build registers the service worker.
  const __REGISTER_SERVICE_WORKER__: boolean

  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    interface PageState {
      modals?: string[]
    }
    // interface Platform {}
  }
}

export {}
