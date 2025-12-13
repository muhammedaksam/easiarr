/**
 * Configuration Manager
 * Handles reading and writing config to ~/.easiarr/
 */

import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { EasiarrConfig } from "./schema"
import { DEFAULT_CONFIG } from "./schema"
import { detectTimezone, detectUid, detectGid } from "./defaults"
import { VersionInfo } from "../VersionInfo"

const CONFIG_DIR_NAME = ".easiarr"
const CONFIG_FILE_NAME = "config.json"
const BACKUP_DIR_NAME = "backups"

export function getConfigDir(): string {
  return join(homedir(), CONFIG_DIR_NAME)
}

export function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILE_NAME)
}

export function getBackupDir(): string {
  return join(getConfigDir(), BACKUP_DIR_NAME)
}

export function getComposePath(): string {
  return join(getConfigDir(), "docker-compose.yml")
}

export async function ensureConfigDir(): Promise<void> {
  const configDir = getConfigDir()
  const backupDir = getBackupDir()

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true })
  }

  if (!existsSync(backupDir)) {
    await mkdir(backupDir, { recursive: true })
  }
}

export async function configExists(): Promise<boolean> {
  return existsSync(getConfigPath())
}

/**
 * Migrate config to current version
 * Preserves user settings while adding new fields with defaults
 */
function migrateConfig(oldConfig: Partial<EasiarrConfig>): EasiarrConfig {
  return {
    // Start with defaults for new fields
    ...DEFAULT_CONFIG,
    // Preserve all user settings
    ...oldConfig,
    // Always update version to current
    version: VersionInfo.version,
    // Ensure required fields have values
    umask: oldConfig.umask ?? "002",
    apps: oldConfig.apps ?? [],
    createdAt: oldConfig.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as EasiarrConfig
}

export async function loadConfig(): Promise<EasiarrConfig | null> {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return null
  }

  try {
    const content = await readFile(configPath, "utf-8")
    let config = JSON.parse(content) as EasiarrConfig

    // Auto-migrate if version differs from current package version
    if (config.version !== VersionInfo.version) {
      config = migrateConfig(config)
      // Save migrated config (creates backup first)
      await saveConfig(config)
    }

    return config
  } catch (error) {
    console.error("Failed to load config:", error)
    return null
  }
}

export async function saveConfig(config: EasiarrConfig): Promise<void> {
  await ensureConfigDir()

  const configPath = getConfigPath()

  // Create backup if config already exists
  if (existsSync(configPath)) {
    await backupConfig()
  }

  // Update timestamp
  config.updatedAt = new Date().toISOString()

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8")
}

export async function backupConfig(): Promise<void> {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return
  }

  const backupDir = getBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = join(backupDir, `config-${timestamp}.json`)

  await copyFile(configPath, backupPath)
}

export function createDefaultConfig(rootDir: string): EasiarrConfig {
  const now = new Date().toISOString()

  return {
    ...DEFAULT_CONFIG,
    rootDir,
    timezone: detectTimezone(),
    uid: detectUid(),
    gid: detectGid(),
    createdAt: now,
    updatedAt: now,
  }
}
