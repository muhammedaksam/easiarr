/**
 * Update Notification Component
 * Popup overlay showing new version available
 */

import { BoxRenderable, TextRenderable, CliRenderer, KeyEvent } from "@opentui/core"
import type { UpdateInfo } from "../../utils/update-checker"

export class UpdateNotification extends BoxRenderable {
  private cliRenderer: CliRenderer
  private updateInfo: UpdateInfo
  private onDismiss: () => void
  private keyHandler: (key: KeyEvent) => void

  constructor(renderer: CliRenderer, updateInfo: UpdateInfo, onDismiss: () => void) {
    super(renderer, {
      id: "update-notification",
      position: "absolute",
      top: "50%",
      left: "50%",
      width: 50,
      height: 12,
      marginTop: -6, // Center vertically
      marginLeft: -25, // Center horizontally
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: "#50fa7b",
      padding: 1,
    })

    this.cliRenderer = renderer
    this.updateInfo = updateInfo
    this.onDismiss = onDismiss

    this.buildContent()

    // Key handler
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "return" || key.name === "escape" || key.name === "q") {
        this.dismiss()
      }
    }
    renderer.keyInput.on("keypress", this.keyHandler)
  }

  private buildContent(): void {
    // Header
    this.add(
      new TextRenderable(this.cliRenderer, {
        content: "🎉 Update Available!",
        fg: "#50fa7b",
      })
    )

    // Spacer
    this.add(new BoxRenderable(this.cliRenderer, { height: 1 }))

    // Version info
    this.add(
      new TextRenderable(this.cliRenderer, {
        content: `Current: v${this.updateInfo.currentVersion}`,
        fg: "#6272a4",
      })
    )

    this.add(
      new TextRenderable(this.cliRenderer, {
        content: `Latest:  ${this.updateInfo.latestVersion}`,
        fg: "#f1fa8c",
      })
    )

    // Spacer
    this.add(new BoxRenderable(this.cliRenderer, { height: 1 }))

    // Update command
    this.add(
      new TextRenderable(this.cliRenderer, {
        content: "Run: bun update -g @muhammedaksam/easiarr",
        fg: "#8be9fd",
      })
    )

    // Spacer
    this.add(new BoxRenderable(this.cliRenderer, { height: 1 }))

    // Dismiss hint
    this.add(
      new TextRenderable(this.cliRenderer, {
        content: "Press Enter or Esc to continue",
        fg: "#6272a4",
      })
    )
  }

  private dismiss(): void {
    this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    this.destroy()
    this.onDismiss()
  }
}
