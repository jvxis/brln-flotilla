import dotenv from "dotenv"
import {defineConfig} from "@vite-pwa/assets-generator/config"

dotenv.config({path: ".env.local"})
dotenv.config({path: ".env"})

// BR⚡LN (17/10/2026): the installed app's icon comes from its own image, VITE_PLATFORM_APP_ICON (the
// chat balloon with the BR⚡LN mark under it); VITE_PLATFORM_LOGO stays the small mark the app shows
// inside, in a circle. The minimal preset padded the iPhone and maskable icons with 30% of white
// around a logo that already has its own background, so home screens showed a navy square in a white
// frame. Here the iPhone icon is full-bleed and the maskable one is padded in the logo's navy. The
// favicon is not generated: scripts/build-web.sh copies static/brln-favicon.ico over it.
const background = process.env.VITE_PLATFORM_APP_ICON_BACKGROUND || "#0D1728"

export default defineConfig({
  preset: {
    transparent: {sizes: [64, 192, 512], favicons: [], padding: 0},
    maskable: {sizes: [512], padding: 0.2, resizeOptions: {background}},
    apple: {sizes: [180], padding: 0, resizeOptions: {background}},
  },
  images: [process.env.VITE_PLATFORM_APP_ICON || process.env.VITE_PLATFORM_LOGO],
})
