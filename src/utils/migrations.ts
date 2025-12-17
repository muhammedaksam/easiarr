/**
 * Migration Runner
 * Sequelize-style migrations with Unix timestamp naming
 *
 * Migration files: src/utils/migrations/{timestamp}_{name}.ts
 * Each migration exports: name, up()
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { debugLog } from "./debug"

const EASIARR_DIR = join(homedir(), ".easiarr")
const MIGRATIONS_FILE = join(EASIARR_DIR, ".migrations.json")

interface MigrationState {
  applied: string[] // List of applied migration timestamps
  lastRun: string
}

interface Migration {
  timestamp: string
  name: string
  up: () => boolean
  down: () => boolean
}

/**
 * Ensure the easiarr directory exists
 */
function ensureEasiarrDir(): void {
  if (!existsSync(EASIARR_DIR)) {
    mkdirSync(EASIARR_DIR, { recursive: true })
  }
}

/**
 * Get the current migration state
 */
function getMigrationState(): MigrationState {
  if (!existsSync(MIGRATIONS_FILE)) {
    return { applied: [], lastRun: "" }
  }

  try {
    const content = readFileSync(MIGRATIONS_FILE, "utf-8")
    return JSON.parse(content) as MigrationState
  } catch {
    return { applied: [], lastRun: "" }
  }
}

/**
 * Save the migration state
 */
function saveMigrationState(state: MigrationState): void {
  ensureEasiarrDir()
  state.lastRun = new Date().toISOString()
  writeFileSync(MIGRATIONS_FILE, JSON.stringify(state, null, 2), "utf-8")
}

/**
 * Load all migration modules
 */
async function loadMigrations(): Promise<Migration[]> {
  const migrations: Migration[] = []

  // Import migrations directly - bundled at build time
  try {
    const m1 = await import("./migrations/1765626338_rename_env_variables")
    migrations.push({
      timestamp: "1765626338",
      name: m1.name,
      up: m1.up,
      down: m1.down,
    })
  } catch (e) {
    debugLog("Migrations", `Failed to load migration: ${e}`)
  }

  try {
    const m1765707135 = await import("./migrations/1765707135_rename_easiarr_status")
    migrations.push({
      timestamp: "1765707135",
      name: m1765707135.name,
      up: m1765707135.up,
      down: m1765707135.down,
    })
  } catch (e) {
    debugLog("Migrations", `Failed to load migration: ${e}`)
  }

  try {
    const m1765732722 = await import("./migrations/1765732722_remove_cloudflare_dns_api_token")
    migrations.push({
      timestamp: "1765732722",
      name: m1765732722.name,
      up: m1765732722.up,
      down: m1765732722.down,
    })
  } catch (e) {
    debugLog("Migrations", `Failed to load migration: ${e}`)
  }

  // Add future migrations here:
  // const m2 = await import("./migrations/1734xxxxxx_xxx")
  // migrations.push({ timestamp: "...", name: m2.name, up: m2.up })

  return migrations.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  const state = getMigrationState()
  const migrations = await loadMigrations()

  let hasChanges = false

  for (const migration of migrations) {
    if (state.applied.includes(migration.timestamp)) {
      continue
    }

    debugLog("Migrations", `Running migration ${migration.timestamp}_${migration.name}`)

    try {
      migration.up()
      state.applied.push(migration.timestamp)
      hasChanges = true
      debugLog("Migrations", `Migration ${migration.timestamp} completed`)
    } catch (e) {
      debugLog("Migrations", `Migration ${migration.timestamp} failed: ${e}`)
    }
  }

  if (hasChanges) {
    saveMigrationState(state)
  } else {
    debugLog("Migrations", "No pending migrations")
  }
}
