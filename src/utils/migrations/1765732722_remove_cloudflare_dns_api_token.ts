/**
 * Migration: remove cloudflare dns api token
 * Removes the unused CLOUDFLARE_DNS_API_TOKEN from .env
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { getEnvPath } from "../env"
import { debugLog } from "../debug"

export const name = "remove_cloudflare_dns_api_token"

export function up(): boolean {
  debugLog("Migrations", "Running migration: remove_cloudflare_dns_api_token")

  const envPath = getEnvPath()
  if (!existsSync(envPath)) {
    debugLog("Migrations", ".env file not found, skipping")
    return true
  }

  const content = readFileSync(envPath, "utf-8")

  // Check if CLOUDFLARE_DNS_API_TOKEN exists
  if (!content.includes("CLOUDFLARE_DNS_API_TOKEN")) {
    debugLog("Migrations", "CLOUDFLARE_DNS_API_TOKEN not found, skipping")
    return true
  }

  // Remove the line containing CLOUDFLARE_DNS_API_TOKEN
  const lines = content.split("\n")
  const filtered = lines.filter((line) => !line.startsWith("CLOUDFLARE_DNS_API_TOKEN="))
  const newContent = filtered.join("\n")

  writeFileSync(envPath, newContent, "utf-8")
  debugLog("Migrations", "Removed CLOUDFLARE_DNS_API_TOKEN from .env")

  return true
}

export function down(): boolean {
  debugLog("Migrations", "Reverting migration: remove_cloudflare_dns_api_token")
  // No revert needed - the token was unused
  return true
}
