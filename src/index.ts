#!/usr/bin/env bun
/**
 * Easiarr Entry Point
 * TUI tool for generating docker-compose files for the *arr ecosystem
 */

import { createCliRenderer } from "@opentui/core"
import { App } from "./ui/App"

async function main() {
  const renderer = await createCliRenderer({
    consoleOptions: {
      startInDebugMode: false,
    },
  })

  const app = new App(renderer)
  await app.start()
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
