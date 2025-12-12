/**
 * Debug logging utility for Easiarr
 *
 * Only logs when EASIARR_DEBUG environment variable is set.
 * Usage: EASIARR_DEBUG=1 bun run dev
 */

import { appendFileSync } from "fs"
import { join } from "path"

const DEBUG_ENABLED = process.env.EASIARR_DEBUG === "1" || process.env.EASIARR_DEBUG === "true"
const logFile = join(import.meta.dir, "..", "..", "debug.log")

/**
 * Log a debug message to debug.log file if EASIARR_DEBUG is enabled
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
