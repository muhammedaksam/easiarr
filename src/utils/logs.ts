/**
 * Log File Management Utilities
 * Handles saving and managing container logs to ~/.easiarr/logs/
 */

import { mkdir, writeFile, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { debugLog } from "./debug"

const LOGS_DIR = join(homedir(), ".easiarr", "logs")

/**
 * Get the logs directory path for a specific app
 */
export function getLogPath(appId: string): string {
  return join(LOGS_DIR, appId)
}

/**
 * Ensure the logs directory exists for an app
 */
async function ensureLogDir(appId: string): Promise<string> {
  const logDir = getLogPath(appId)
  await mkdir(logDir, { recursive: true })
  return logDir
}

/**
 * Generate a timestamped log filename
 */
function generateLogFilename(): string {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19)
  return `${timestamp}.log`
}

/**
 * Save container logs to a file
 * @returns The path to the saved log file
 */
export async function saveLog(appId: string, content: string): Promise<string> {
  const logDir = await ensureLogDir(appId)
  const filename = generateLogFilename()
  const filepath = join(logDir, filename)

  await writeFile(filepath, content, "utf-8")
  debugLog("Logs", `Saved log for ${appId} to ${filepath}`)

  return filepath
}

/**
 * List saved logs for an app
 * @returns Array of log file info sorted by date (newest first)
 */
export async function listSavedLogs(
  appId: string
): Promise<Array<{ filename: string; path: string; date: Date; size: number }>> {
  const logDir = getLogPath(appId)

  try {
    const files = await readdir(logDir)
    const logFiles = files.filter((f) => f.endsWith(".log"))

    const fileInfos = await Promise.all(
      logFiles.map(async (filename) => {
        const path = join(logDir, filename)
        const stats = await stat(path)
        return {
          filename,
          path,
          date: stats.mtime,
          size: stats.size,
        }
      })
    )

    // Sort by date, newest first
    return fileInfos.sort((a, b) => b.date.getTime() - a.date.getTime())
  } catch {
    // Directory doesn't exist yet
    return []
  }
}

/**
 * Get the base logs directory path
 */
export function getLogsBaseDir(): string {
  return LOGS_DIR
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return "just now"
}
