/**
 * Default Value Detection
 * Auto-detect timezone and UID/GID from system
 */

import { readlinkSync, existsSync } from "node:fs"

export function detectTimezone(): string {
  const tzPath = "/etc/localtime"

  if (existsSync(tzPath)) {
    try {
      const link = readlinkSync(tzPath)
      const parts = link.split("zoneinfo/")
      if (parts.length > 1) {
        return parts[1]
      }
    } catch {
      // Fallback if not a symlink
    }
  }

  // Try TZ environment variable
  if (process.env.TZ) {
    return process.env.TZ
  }

  return "UTC"
}

export function detectUid(): number {
  return process.getuid?.() ?? 1000
}

export function detectGid(): number {
  return process.getgid?.() ?? 1000
}
