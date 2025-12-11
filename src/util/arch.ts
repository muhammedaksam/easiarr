/**
 * Architecture Detection Utility
 * Detects system architecture and checks app compatibility
 */

import type { AppDefinition, Architecture } from "../config/schema"

/**
 * Get the current system architecture
 */
export function getSystemArch(): Architecture {
  const arch = process.arch
  switch (arch) {
    case "x64":
    case "ia32":
      return "x64"
    case "arm64":
      return "arm64"
    case "arm":
      return "arm32"
    default:
      return "x64" // Default to x64 for unknown
  }
}

/**
 * Check if an app is compatible with the given architecture
 * Returns true if compatible (no issues), false if deprecated/broken
 */
export function isAppCompatible(app: AppDefinition, arch?: Architecture): boolean {
  const systemArch = arch ?? getSystemArch()

  if (!app.arch) {
    return true // No arch restrictions = supports all
  }

  // Check if explicitly deprecated
  if (app.arch.deprecated?.includes(systemArch)) {
    return false
  }

  // If supported list exists, check if current arch is in it
  if (app.arch.supported && !app.arch.supported.includes(systemArch)) {
    return false
  }

  return true
}

/**
 * Get warning message for an app on the current architecture
 * Returns null if no warning
 */
export function getArchWarning(app: AppDefinition, arch?: Architecture): string | null {
  const systemArch = arch ?? getSystemArch()

  if (!app.arch) {
    return null
  }

  if (app.arch.deprecated?.includes(systemArch)) {
    return app.arch.warning || `${app.name} has deprecated support for ${systemArch}`
  }

  if (app.arch.supported && !app.arch.supported.includes(systemArch)) {
    return `${app.name} does not support ${systemArch} architecture`
  }

  return null
}

/**
 * Check if app is deprecated (but might still work)
 */
export function isAppDeprecated(app: AppDefinition, arch?: Architecture): boolean {
  const systemArch = arch ?? getSystemArch()
  return app.arch?.deprecated?.includes(systemArch) ?? false
}
