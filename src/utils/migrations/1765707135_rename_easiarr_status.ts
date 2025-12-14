/**
 * Migration: rename easiarr-status to easiarr
 *
 * OLD: { "id": "easiarr-status", "enabled": true }
 * NEW: { "id": "easiarr", "enabled": true }
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { debugLog } from "../debug"

const CONFIG_FILE = join(homedir(), ".easiarr", "config.json")

export const name = "rename_easiarr_status"

export function up(): boolean {
  if (!existsSync(CONFIG_FILE)) {
    debugLog("Migrations", "No config.json file found, skipping migration")
    return false
  }

  try {
    const content = readFileSync(CONFIG_FILE, "utf-8")
    const config = JSON.parse(content)

    if (!config.apps || !Array.isArray(config.apps)) {
      debugLog("Migrations", "No apps array in config, skipping migration")
      return false
    }

    let changed = false

    for (const app of config.apps) {
      if (app.id === "easiarr-status") {
        app.id = "easiarr"
        changed = true
        debugLog("Migrations", "Renamed easiarr-status → easiarr")
      }
    }

    if (changed) {
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
      debugLog("Migrations", "Migration completed: app id renamed")
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
  if (!existsSync(CONFIG_FILE)) {
    return false
  }

  try {
    const content = readFileSync(CONFIG_FILE, "utf-8")
    const config = JSON.parse(content)

    if (!config.apps || !Array.isArray(config.apps)) {
      return false
    }

    let changed = false

    for (const app of config.apps) {
      if (app.id === "easiarr") {
        app.id = "easiarr-status"
        changed = true
        debugLog("Migrations", "Rolled back easiarr → easiarr-status")
      }
    }

    if (changed) {
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
      debugLog("Migrations", "Rollback completed: app id restored")
      return true
    }

    return false
  } catch (e) {
    debugLog("Migrations", `Rollback error: ${e}`)
    return false
  }
}
