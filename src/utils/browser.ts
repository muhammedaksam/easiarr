/**
 * Browser Utilities
 * Open URLs in the default browser
 */

import { $ } from "bun"
import { platform } from "node:os"

/**
 * Open a URL in the default browser
 */
export async function openUrl(url: string): Promise<void> {
  const os = platform()

  try {
    if (os === "linux") {
      await $`xdg-open ${url}`.quiet()
    } else if (os === "darwin") {
      await $`open ${url}`.quiet()
    } else if (os === "win32") {
      await $`cmd /c start ${url}`.quiet()
    }
  } catch {
    // Silently fail if browser can't be opened
  }
}
