/**
 * Migration: migrate to xdg
 *
 * Moves config from ~/.easiarr to $XDG_CONFIG_HOME/easiarr
 */

import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import { debugLog } from "~/utils/debug"

export const name = "migrate_to_xdg"

const OLD_DIR = join(homedir(), ".easiarr")

function getNewDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(xdgConfigHome, "easiarr")
}

export function up(): boolean {
  const newDir = getNewDir()

  // Skip if old directory doesn't exist
  if (!existsSync(OLD_DIR)) {
    debugLog("Migrations", "No legacy ~/.easiarr directory found, skipping migration")
    return false
  }

  // Skip if already at XDG location (same path)
  if (OLD_DIR === newDir) {
    debugLog("Migrations", "Old and new paths are identical, skipping")
    return false
  }

  // Skip if new directory already has config
  if (existsSync(join(newDir, "config.json"))) {
    debugLog("Migrations", "XDG config already exists, skipping migration")
    return false
  }

  debugLog("Migrations", `Migrating from ${OLD_DIR} to ${newDir}`)

  try {
    // Ensure target directory exists
    if (!existsSync(newDir)) {
      mkdirSync(newDir, { recursive: true })
      debugLog("Migrations", `Created directory ${newDir}`)
    }

    // Get all entries in old directory
    const entries = readdirSync(OLD_DIR)

    for (const entry of entries) {
      // Skip migrations file - it will be recreated in new location
      if (entry === ".migrations.json") continue

      const oldPath = join(OLD_DIR, entry)
      const newPath = join(newDir, entry)

      // Skip if entry already exists in new location
      if (existsSync(newPath)) {
        debugLog("Migrations", `Skipping ${entry}, already exists in new location`)
        continue
      }

      try {
        const stat = lstatSync(oldPath)

        if (stat.isDirectory()) {
          // Copy directory recursively (e.g., backups/)
          cpSync(oldPath, newPath, { recursive: true })
          debugLog("Migrations", `Copied directory ${entry} to XDG location`)
        } else if (stat.isFile()) {
          // Copy file
          copyFileSync(oldPath, newPath)
          debugLog("Migrations", `Copied ${entry} to XDG location`)
        }
      } catch {
        debugLog("Migrations", `Failed to copy ${entry}`)
      }
    }

    // Remove old directory completely
    try {
      rmSync(OLD_DIR, { recursive: true, force: true })
      debugLog("Migrations", `Removed legacy directory ${OLD_DIR}`)
    } catch {
      debugLog("Migrations", `Could not remove old directory`)
    }

    debugLog("Migrations", "XDG migration completed successfully")
    return true
  } catch (e) {
    debugLog("Migrations", `Migration error: ${e}`)
    return false
  }
}

export function down(): boolean {
  // This migration is not easily reversible
  // The old config location is deprecated
  debugLog("Migrations", "XDG migration rollback not supported")
  return false
}
