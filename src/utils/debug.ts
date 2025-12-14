/**
 * Debug logging utility for easiarr
 *
 * Enable debug logging via:
 * - CLI flag: easiarr --debug
 * - Environment variable: EASIARR_DEBUG=1 bun run dev
 */

import { appendFileSync, writeFileSync } from "fs"
import { join } from "path"

// Check CLI args for --debug flag
const hasDebugFlag = process.argv.includes("--debug") || process.argv.includes("-d")
const hasEnvDebug = process.env.EASIARR_DEBUG === "1" || process.env.EASIARR_DEBUG === "true"

export const DEBUG_ENABLED = hasDebugFlag || hasEnvDebug

// Save debug log to ~/.easiarr/ like other config files
const easiarrDir = join(process.env.HOME || "~", ".easiarr")
const logFile = join(easiarrDir, "debug.log")

/**
 * Initialize debug mode - clears old log file
 */
export function initDebug(): void {
  if (!DEBUG_ENABLED) return
  try {
    writeFileSync(logFile, `=== easiarr Debug Log - ${new Date().toISOString()} ===\n`)
  } catch {
    // Ignore
  }
}

/**
 * Log a debug message to debug.log file if debug mode is enabled
 */
export function debugLog(category: string, message: string): void {
  if (!DEBUG_ENABLED) return

  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${category}] ${message}\n`
  try {
    appendFileSync(logFile, line)
  } catch {
    // Ignore logging errors
  }
}

/**
 * Log API request details for debugging
 */
export function debugRequest(method: string, url: string, body?: unknown): void {
  if (!DEBUG_ENABLED) return
  debugLog("API", `${method} ${url}`)
  if (body) {
    debugLog("API", `Body: ${JSON.stringify(body, null, 2)}`)
  }
}

/**
 * Log API response details for debugging
 */
export function debugResponse(status: number, url: string, body?: string): void {
  if (!DEBUG_ENABLED) return
  debugLog("API", `Response ${status} from ${url}`)
  if (body && body.length < 2000) {
    debugLog("API", `Response Body: ${body}`)
  }
}
