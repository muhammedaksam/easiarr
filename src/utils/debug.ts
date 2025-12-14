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
 * Sanitize sensitive fields from log messages
 * Redacts passwords, tokens, API keys, secrets, and credentials
 */
function sanitizeMessage(message: string): string {
  // Match common sensitive field names in JSON format
  // Covers: passwords, tokens, API keys, secrets, credentials, auth data
  return message.replace(
    /"(password|passwordConfirmation|Password|Pw|passwd|pass|apiKey|api_key|ApiKey|API_KEY|token|accessToken|access_token|refreshToken|refresh_token|bearerToken|jwtToken|jwt|secret|secretKey|secret_key|privateKey|private_key|credential|auth|authorization|authToken|client_secret|clientSecret|WIREGUARD_PRIVATE_KEY|TUNNEL_TOKEN|USERNAME_VPN|PASSWORD_VPN)":\s*"[^"]*"/gi,
    '"$1":"[REDACTED]"'
  )
}

/**
 * Log a debug message to debug.log file if debug mode is enabled
 * Automatically sanitizes sensitive data (passwords, tokens, etc.)
 */
export function debugLog(category: string, message: string): void {
  if (!DEBUG_ENABLED) return

  const timestamp = new Date().toISOString()
  const sanitizedMessage = sanitizeMessage(message)
  const line = `[${timestamp}] [${category}] ${sanitizedMessage}\n`
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
