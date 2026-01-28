/**
 * Path Utilities
 * Centralized XDG-compliant path resolution for easiarr config and data directories
 */

import { homedir } from "os"
import { join } from "path"

export const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")

/**
 * Get the XDG config directory for easiarr
 * Uses $XDG_CONFIG_HOME/easiarr or defaults to ~/.config/easiarr
 */
export function getConfigDir(): string {
  return join(xdgConfigHome, "easiarr")
}

/**
 * Get a path within the config directory
 * @param segments - Path segments to join with config dir
 */
export function getConfigPath(...segments: string[]): string {
  return join(getConfigDir(), ...segments)
}

/**
 * Legacy path for migration purposes only
 * @deprecated Use getConfigDir() instead
 */
export function getLegacyConfigDir(): string {
  return join(homedir(), ".easiarr")
}
