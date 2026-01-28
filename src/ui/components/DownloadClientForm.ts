/**
 * DownloadClientForm Component
 * Reusable form for qBittorrent/SABnzbd credential input
 */

import type { CliRenderer, KeyEvent } from "@opentui/core"

import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
} from "@opentui/core"

export type DownloadClientType = "qbittorrent" | "sabnzbd"

export interface DownloadClientFormOptions {
  type: DownloadClientType
  initialValue?: string
}

export interface DownloadClientFormResult {
  type: DownloadClientType
  value: string
}

export class DownloadClientForm extends BoxRenderable {
  private renderer: CliRenderer
  private keyHandler!: (key: KeyEvent) => void
  private input!: InputRenderable

  private onSubmit: (result: DownloadClientFormResult) => void
  private onCancel: () => void
  private type: DownloadClientType

  constructor(
    renderer: CliRenderer,
    options: DownloadClientFormOptions,
    onSubmit: (result: DownloadClientFormResult) => void,
    onCancel: () => void
  ) {
    super(renderer, {
      flexDirection: "column",
      gap: 1,
    })

    this.renderer = renderer
    this.onSubmit = onSubmit
    this.onCancel = onCancel
    this.type = options.type

    this.buildForm(options)
    this.setupKeyHandler()
  }

  private buildForm(options: DownloadClientFormOptions) {
    const isQBittorrent = options.type === "qbittorrent"

    // Title
    this.add(
      new TextRenderable(this.renderer, {
        content: isQBittorrent
          ? "Enter qBittorrent credentials (from Settings → WebUI):\n"
          : "Enter SABnzbd API Key (from Config → General → API Key):\n",
        fg: "#4a9eff",
      })
    )

    // Label
    this.add(
      new TextRenderable(this.renderer, {
        content: isQBittorrent ? "Password:" : "API Key:",
        fg: "#aaaaaa",
      })
    )

    // Input
    this.input = new InputRenderable(this.renderer, {
      id: `${options.type}-input`,
      width: isQBittorrent ? 30 : 40,
      placeholder: isQBittorrent ? "WebUI Password" : "SABnzbd API Key",
      value: options.initialValue ?? "",
      focusedBackgroundColor: "#1a1a1a",
    })
    this.add(this.input)

    // Focus input
    this.input.focus()

    // Handle Enter via SUBMIT event
    this.input.on(InputRenderableEvents.ENTER, () => {
      this.cleanup()
      this.onSubmit({
        type: this.type,
        value: this.input.value,
      })
    })
  }

  private setupKeyHandler() {
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.cleanup()
        this.onCancel()
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)
  }

  cleanup() {
    this.renderer.keyInput.off("keypress", this.keyHandler)
    this.input.blur()
  }
}
