/**
 * qBittorrent Setup Screen
 * Configure qBittorrent for TRaSH Guide compliance
 */

import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import type { EasiarrConfig } from "../../config/schema"
import { QBittorrentClient, type QBittorrentCategory } from "../../api/qbittorrent-api"
import { getCategoriesForApps } from "../../utils/categories"
import { debugLog } from "../../utils/debug"

type Step = "menu" | "host" | "port" | "user" | "pass" | "configuring" | "done"

export class QBittorrentSetup extends BoxRenderable {
  private config: EasiarrConfig
  private cliRenderer: CliRenderer
  private onBack: () => void
  private keyHandler!: (key: KeyEvent) => void
  private contentBox!: BoxRenderable
  private pageContainer!: BoxRenderable

  private step: Step = "menu"
  private menuIndex = 0
  private host = "localhost"
  private port = 8080
  private user = "admin"
  private pass = ""
  private inputValue = ""
  private statusMessage = ""
  private statusColor = "#f1fa8c" // yellow

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    const { container: pageContainer, content: contentBox } = createPageLayout(cliRenderer, {
      title: "qBittorrent Setup",
      stepInfo: "Configure TRaSH-compliant paths and categories",
      footerHint: "Enter Submit  Esc Back",
    })
    super(cliRenderer, { width: "100%", height: "100%" })
    this.add(pageContainer)

    this.config = config
    this.cliRenderer = cliRenderer
    this.onBack = onBack
    this.contentBox = contentBox
    this.pageContainer = pageContainer

    this.initKeyHandler()
    this.refreshContent()
  }

  private initKeyHandler(): void {
    this.keyHandler = (key: KeyEvent) => {
      debugLog("qBittorrent", `Key: ${key.name}, step=${this.step}`)

      if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
        if (this.step === "menu") {
          this.cleanup()
        } else {
          this.step = "menu"
          this.refreshContent()
        }
        return
      }

      if (this.step === "menu") {
        this.handleMenuKeys(key)
      } else if (this.step === "host" || this.step === "port" || this.step === "user" || this.step === "pass") {
        this.handleInputKeys(key)
      } else if (this.step === "done") {
        if (key.name === "return") {
          this.step = "menu"
          this.refreshContent()
        }
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
    debugLog("qBittorrent", "Key handler registered")
  }

  private handleMenuKeys(key: KeyEvent): void {
    const menuItems = ["Configure qBittorrent", "Back"]

    if (key.name === "up") {
      this.menuIndex = Math.max(0, this.menuIndex - 1)
      this.refreshContent()
    } else if (key.name === "down") {
      this.menuIndex = Math.min(menuItems.length - 1, this.menuIndex + 1)
      this.refreshContent()
    } else if (key.name === "return") {
      if (this.menuIndex === 0) {
        this.step = "host"
        this.inputValue = this.host
        this.refreshContent()
      } else {
        this.cleanup()
      }
    }
  }

  private handleInputKeys(key: KeyEvent): void {
    if (key.name === "return") {
      this.handleInputSubmit()
    } else if (key.name === "backspace") {
      this.inputValue = this.inputValue.slice(0, -1)
      this.refreshContent()
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      this.inputValue += key.sequence
      this.refreshContent()
    }
  }

  private handleInputSubmit(): void {
    if (this.step === "host") {
      if (this.inputValue.trim()) this.host = this.inputValue.trim()
      this.step = "port"
      this.inputValue = String(this.port)
    } else if (this.step === "port") {
      const p = parseInt(this.inputValue)
      if (!isNaN(p)) this.port = p
      this.step = "user"
      this.inputValue = this.user
    } else if (this.step === "user") {
      if (this.inputValue.trim()) this.user = this.inputValue.trim()
      this.step = "pass"
      this.inputValue = ""
    } else if (this.step === "pass") {
      this.pass = this.inputValue
      this.step = "configuring"
      this.configure()
      return
    }
    this.refreshContent()
  }

  private async configure(): Promise<void> {
    this.statusMessage = "⏳ Connecting to qBittorrent..."
    this.statusColor = "#f1fa8c"
    this.refreshContent()

    try {
      debugLog("qBittorrent", `Connecting to ${this.host}:${this.port}`)
      const client = new QBittorrentClient(this.host, this.port, this.user, this.pass)
      const loggedIn = await client.login()

      if (!loggedIn) {
        this.statusMessage = "❌ Login failed. Check credentials."
        this.statusColor = "#ff5555"
        this.step = "done"
        this.refreshContent()
        return
      }

      this.statusMessage = "✅ Logged in. Configuring..."
      this.statusColor = "#50fa7b"
      this.refreshContent()

      // Get categories from enabled *arr apps
      const enabledApps = this.config.apps.filter((a) => a.enabled).map((a) => a.id)
      const categories: QBittorrentCategory[] = getCategoriesForApps(enabledApps).map((cat) => ({
        name: cat.name,
        savePath: `/data/torrents/${cat.name}`,
      }))

      await client.configureTRaSHCompliant(categories, { user: this.user, pass: this.pass })

      const catNames = categories.map((c) => c.name).join(", ") || "none"
      this.statusMessage = `✅ Done!\n\n  save_path: /data/torrents\n  Categories: ${catNames}\n\n  Press Enter to continue.`
      this.statusColor = "#50fa7b"
      this.step = "done"
      this.refreshContent()
    } catch (e) {
      debugLog("qBittorrent", `Error: ${e}`)
      this.statusMessage = `❌ Error: ${e}`
      this.statusColor = "#ff5555"
      this.step = "done"
      this.refreshContent()
    }
  }

  private refreshContent(): void {
    // Clear content box
    this.contentBox.getChildren().forEach((child) => child.destroy())

    if (this.step === "menu") {
      this.renderMenu()
    } else if (this.step === "host" || this.step === "port" || this.step === "user" || this.step === "pass") {
      this.renderInput()
    } else if (this.step === "configuring" || this.step === "done") {
      this.renderStatus()
    }
  }

  private renderMenu(): void {
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "Select an action:\n\n",
        fg: "#aaaaaa",
      })
    )

    const items = [
      { name: "🔧 Configure qBittorrent", desc: "Set save path and categories" },
      { name: "⬅️  Back", desc: "Return to main menu" },
    ]

    items.forEach((item, idx) => {
      const pointer = idx === this.menuIndex ? "→ " : "  "
      const fg = idx === this.menuIndex ? "#50fa7b" : "#8be9fd"

      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `${pointer}${item.name}\n`,
          fg,
        })
      )
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `    ${item.desc}\n\n`,
          fg: "#6272a4",
        })
      )
    })
  }

  private renderInput(): void {
    const labels: Record<string, string> = {
      host: "Enter qBittorrent host (e.g., localhost or qbittorrent):",
      port: "Enter qBittorrent WebUI port:",
      user: "Enter qBittorrent username:",
      pass: "Enter qBittorrent password:",
    }

    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: `${labels[this.step]}\n\n`,
        fg: "#8be9fd",
      })
    )

    const displayValue = this.step === "pass" ? "*".repeat(this.inputValue.length) : this.inputValue
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: `> ${displayValue}_`,
        fg: "#ffffff",
      })
    )
  }

  private renderStatus(): void {
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: this.statusMessage,
        fg: this.statusColor,
      })
    )
  }

  private cleanup(): void {
    this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    debugLog("qBittorrent", "Key handler removed")
    this.destroy()
    this.onBack()
  }
}
