#!/usr/bin/env bun
/**
 * easiarr Entry Point
 * TUI tool for generating docker-compose files for the *arr ecosystem
 *
 * Usage:
 *   easiarr           - Start the TUI
 *   easiarr --debug   - Start with debug logging enabled
 *   easiarr -d        - Same as --debug
 */

import { createCliRenderer } from "@opentui/core"
import { App } from "./ui/App"
import { initDebug } from "./utils/debug"
import { runMigrations } from "./utils/migrations"

async function main() {
  // Initialize debug logging if enabled
  initDebug()

  // Run migrations to update env variable names if needed
  await runMigrations()

  const renderer = await createCliRenderer({
    consoleOptions: {
      startInDebugMode: false,
    },
    exitOnCtrlC: true,
  })

  // Cleanup function to properly restore terminal state
  let isCleanedUp = false
  const cleanup = () => {
    if (isCleanedUp) return
    isCleanedUp = true

    try {
      // Destroy renderer to restore terminal state (disables mouse tracking, restores cursor, etc.)
      if (renderer && typeof renderer.destroy === "function") {
        renderer.destroy()
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  // Register cleanup handlers for various exit scenarios
  process.on("exit", () => {
    cleanup()
  })
  process.on("SIGINT", () => {
    cleanup()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    cleanup()
    process.exit(0)
  })
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error)
    cleanup()
    process.exit(1)
  })
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason)
    cleanup()
    process.exit(1)
  })

  const app = new App(renderer)
  await app.start()
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
