/**
 * Environment File Utilities
 * Shared functions for reading/writing .env files
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { writeFile, readFile } from "node:fs/promises"
import { networkInterfaces } from "node:os"
import { getComposePath } from "../config/manager"

/**
 * Get the local IP address of the Docker host
 * Returns the first non-internal IPv4 address found
 */
export function getLocalIp(): string {
  const nets = networkInterfaces()

  for (const name of Object.keys(nets)) {
    const interfaces = nets[name]
    if (!interfaces) continue

    for (const net of interfaces) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (net.family === "IPv4" && !net.internal) {
        return net.address
      }
    }
  }

  return "localhost"
}

/**
 * Get the path to the .env file
 */
export function getEnvPath(): string {
  return getComposePath().replace("docker-compose.yml", ".env")
}

/**
 * Parse an .env file into a key-value object
 * Preserves existing values and handles multi-part values (e.g., with = in them)
 */
export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const [key, ...val] = trimmed.split("=")
    if (key && val.length > 0) {
      env[key.trim()] = val.join("=").trim()
    }
  }

  return env
}

/**
 * Serialize an env object to .env file format
 */
export function serializeEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
}

/**
 * Read the .env file and return parsed key-value object
 * Returns empty object if file doesn't exist
 */
export function readEnvSync(): Record<string, string> {
  const envPath = getEnvPath()
  if (!existsSync(envPath)) return {}

  try {
    const content = readFileSync(envPath, "utf-8")
    return parseEnvFile(content)
  } catch {
    return {}
  }
}

/**
 * Write to .env file synchronously, merging with existing values
 * Preserves existing keys not in the updates object
 */
export function writeEnvSync(updates: Record<string, string>): void {
  const envPath = getEnvPath()
  const current = readEnvSync()

  // Merge updates into current
  const merged = { ...current, ...updates }

  // Write back
  const content = serializeEnv(merged)
  writeFileSync(envPath, content, "utf-8")
}

/**
 * Read the .env file asynchronously
 */
export async function readEnv(): Promise<Record<string, string>> {
  const envPath = getEnvPath()
  if (!existsSync(envPath)) return {}

  try {
    const content = await readFile(envPath, "utf-8")
    return parseEnvFile(content)
  } catch {
    return {}
  }
}

/**
 * Write to .env file, merging with existing values
 * Preserves existing keys not in the updates object
 */
export async function updateEnv(updates: Record<string, string>): Promise<void> {
  const envPath = getEnvPath()
  const current = await readEnv()

  // Merge updates into current
  const merged = { ...current, ...updates }

  // Write back
  const content = serializeEnv(merged)
  await writeFile(envPath, content, "utf-8")
}

/**
 * Get a specific value from .env
 */
export function getEnvValue(key: string): string | undefined {
  return readEnvSync()[key]
}
