/**
 * Unraid Detection and Compatibility Utilities
 * Provides detection of Unraid environment and path adjustments
 */

import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { debugLog } from "./debug"

// Unraid-specific paths
const UNRAID_IDENTIFIERS = [
  "/boot/config/plugins", // Unraid plugin directory
  "/etc/unraid-version", // Unraid version file
  "/var/local/emhttp", // Unraid emhttp directory
]

const UNRAID_APPDATA_PATH = "/mnt/user/appdata"
const COMPOSE_MANAGER_PLUGIN_PATH = "/boot/config/plugins/compose.manager"

/**
 * Detect if running on Unraid OS
 * Checks for Unraid-specific filesystem paths
 */
export function isUnraid(): boolean {
  for (const path of UNRAID_IDENTIFIERS) {
    if (existsSync(path)) {
      debugLog("Unraid", `Detected Unraid OS (found ${path})`)
      return true
    }
  }
  return false
}

/**
 * Get the default appdata path for Unraid
 * Returns /mnt/user/appdata/easiarr on Unraid, ~/.easiarr otherwise
 */
export function getUnraidAppDataPath(): string {
  if (isUnraid()) {
    return join(UNRAID_APPDATA_PATH, "easiarr")
  }
  return join(homedir(), ".easiarr")
}

/**
 * Check if Docker Compose Manager plugin is installed
 * This plugin allows managing compose stacks via Unraid's web UI
 */
export function hasComposeManager(): boolean {
  return existsSync(COMPOSE_MANAGER_PLUGIN_PATH)
}

/**
 * Get the recommended Compose Manager project directory
 * Compose Manager expects projects in /boot/config/plugins/compose.manager/projects/
 */
export function getComposeManagerProjectPath(projectName: string = "easiarr"): string {
  return join(COMPOSE_MANAGER_PLUGIN_PATH, "projects", projectName)
}

/**
 * Get platform-appropriate default root directory
 * Adjusts paths for Unraid vs standard Linux/Mac
 */
export function getDefaultRootDir(): string {
  if (isUnraid()) {
    // On Unraid, use /mnt/user/data for media and /mnt/user/appdata for configs
    return "/mnt/user/data"
  }
  // Standard path
  return join(homedir(), "easiarr")
}

/**
 * Get platform-appropriate config directory
 */
export function getConfigDir(): string {
  if (isUnraid()) {
    return UNRAID_APPDATA_PATH
  }
  return join(homedir(), ".easiarr")
}

/**
 * Get Unraid-specific information for display
 */
export function getUnraidInfo(): {
  isUnraid: boolean
  hasComposeManager: boolean
  appDataPath: string
  composeManagerPath: string | null
} {
  const onUnraid = isUnraid()
  return {
    isUnraid: onUnraid,
    hasComposeManager: onUnraid ? hasComposeManager() : false,
    appDataPath: onUnraid ? UNRAID_APPDATA_PATH : join(homedir(), ".easiarr"),
    composeManagerPath: onUnraid && hasComposeManager() ? getComposeManagerProjectPath() : null,
  }
}
