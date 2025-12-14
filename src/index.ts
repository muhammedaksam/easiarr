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
    onDestroy: () => {
      process.exit(0)
    },
  })

  const app = new App(renderer)
  await app.start()
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
