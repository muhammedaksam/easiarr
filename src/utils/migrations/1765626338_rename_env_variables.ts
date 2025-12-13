/**
 * Migration: Rename env variables to new format
 *
 * OLD: GLOBAL_PASSWORD, QBITTORRENT_USER, etc.
 * NEW: PASSWORD_GLOBAL, USERNAME_QBITTORRENT, etc.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { parseEnvFile, serializeEnv } from "../env"
import { debugLog } from "../debug"

const ENV_FILE = join(homedir(), ".easiarr", ".env")

export const name = "rename-env-variables"

const renames: [string, string][] = [
  // Global credentials
  ["GLOBAL_PASSWORD", "PASSWORD_GLOBAL"],
  ["GLOBAL_USERNAME", "USERNAME_GLOBAL"],
  // qBittorrent
  ["QBITTORRENT_PASSWORD", "PASSWORD_QBITTORRENT"],
  ["QBITTORRENT_USER", "USERNAME_QBITTORRENT"],
  ["QBITTORRENT_PASS", "PASSWORD_QBITTORRENT"], // Legacy alias
  // Portainer
  ["PORTAINER_PASSWORD", "PASSWORD_PORTAINER"],
  // PostgreSQL
  ["POSTGRESQL_USERNAME", "USERNAME_POSTGRESQL"],
  ["POSTGRESQL_PASSWORD", "PASSWORD_POSTGRESQL"],
  // VPN
  ["VPN_USERNAME", "USERNAME_VPN"],
  ["VPN_PASSWORD", "PASSWORD_VPN"],
]

export function up(): boolean {
  if (!existsSync(ENV_FILE)) {
    debugLog("Migrations", "No .env file found, skipping migration")
    return false
  }

  try {
    const content = readFileSync(ENV_FILE, "utf-8")
    const env = parseEnvFile(content)
    let changed = false

    for (const [oldKey, newKey] of renames) {
      if (env[oldKey] !== undefined && env[newKey] === undefined) {
        env[newKey] = env[oldKey]
        delete env[oldKey]
        changed = true
        debugLog("Migrations", `Renamed ${oldKey} → ${newKey}`)
      }
    }

    if (changed) {
      writeFileSync(ENV_FILE, serializeEnv(env), "utf-8")
      debugLog("Migrations", "Migration completed: env variables renamed")
      return true
    }

    debugLog("Migrations", "No changes needed")
    return false
  } catch (e) {
    debugLog("Migrations", `Migration error: ${e}`)
    return false
  }
}

export function down(): boolean {
  if (!existsSync(ENV_FILE)) {
    return false
  }

  try {
    const content = readFileSync(ENV_FILE, "utf-8")
    const env = parseEnvFile(content)
    let changed = false

    for (const [oldKey, newKey] of renames) {
      // Reverse operation: restore oldKey from newKey
      if (env[newKey] !== undefined && env[oldKey] === undefined) {
        env[oldKey] = env[newKey]
        delete env[newKey]
        changed = true
        debugLog("Migrations", `Rolled back ${newKey} → ${oldKey}`)
      }
    }

    if (changed) {
      writeFileSync(ENV_FILE, serializeEnv(env), "utf-8")
      debugLog("Migrations", "Rollback completed: env variables restored")
      return true
    }

    return false
  } catch (e) {
    debugLog("Migrations", `Rollback error: ${e}`)
    return false
  }
}
