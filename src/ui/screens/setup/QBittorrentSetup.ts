/**
 * qBittorrent Setup Screen
 * Configure qBittorrent for TRaSH Guide compliance
 */

import { KeyEvent, TextRenderable } from "@opentui/core"

import type { QBittorrentCategory } from "~/api/qbittorrent-api"
import type { MenuItem, SetupStep } from "~/ui/screens/setup/BaseAppSetupScreen"
import { QBittorrentClient } from "~/api/qbittorrent-api"
import { BaseAppSetupScreen } from "~/ui/screens/setup/BaseAppSetupScreen"
import { getCategoriesForApps } from "~/utils/categories"
import { debugLog } from "~/utils/debug"

// Extended step for input wizard
type QBitStep = SetupStep | "host" | "port" | "user" | "pass" | "configuring"

export class QBittorrentSetup extends BaseAppSetupScreen {
  // Extended step (typed separately to avoid TS issues)
  private wizardStep: QBitStep = "menu"
  private host = "localhost"
  private port = 8080
  private user = "admin"
  private pass = ""
  private inputValue = ""
  private statusMessage = ""
  private statusColor = "#f1fa8c"

  getTitle(): string {
    return "qBittorrent Setup"
  }

  getStepInfo(): string {
    return "Configure TRaSH-compliant paths and categories"
  }

  getMenuItems(): MenuItem[] {
    return [
      {
        name: "🔧 Configure qBittorrent",
        description: "Set save path and categories",
        action: () => this.startWizard(),
      },
      {
        name: "⬅️  Back",
        description: "Return to main menu",
        action: () => this.cleanup(),
      },
    ]
  }

  // ============================================
  // CUSTOM KEY HANDLING - Input wizard
  // ============================================

  protected handleCustomKeys(key: KeyEvent): boolean {
    const inputSteps: QBitStep[] = ["host", "port", "user", "pass"]

    // Handle input steps
    if (inputSteps.includes(this.wizardStep)) {
      if (key.name === "return") {
        this.handleInputSubmit()
      } else if (key.name === "backspace") {
        this.inputValue = this.inputValue.slice(0, -1)
        this.refreshContent()
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
        this.inputValue += key.sequence
        this.refreshContent()
      } else if (key.name === "escape") {
        this.wizardStep = "menu"
        this.currentStep = "menu"
        this.refreshContent()
      }
      return true
    }

    // Handle configuring/done steps
    if (this.wizardStep === "configuring" || this.wizardStep === "done") {
      if (key.name === "return" || key.name === "escape") {
        this.wizardStep = "menu"
        this.currentStep = "menu"
        this.refreshContent()
      }
      return true
    }

    return false // Default handling for menu
  }

  // ============================================
  // CUSTOM RENDERING - Wizard steps
  // ============================================

  protected renderCustomContent(): boolean {
    const inputSteps: QBitStep[] = ["host", "port", "user", "pass"]

    if (inputSteps.includes(this.wizardStep)) {
      this.renderInput()
      return true
    }

    if (this.wizardStep === "configuring" || this.wizardStep === "done") {
      this.renderStatus()
      return true
    }

    return false // Default menu rendering
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
        content: `${labels[this.wizardStep]}\n\n`,
        fg: "#8be9fd",
      })
    )

    const displayValue =
      this.wizardStep === "pass" ? "*".repeat(this.inputValue.length) : this.inputValue
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

  // ============================================
  // WIZARD LOGIC
  // ============================================

  private startWizard(): void {
    this.wizardStep = "host"
    this.inputValue = this.host
    this.refreshContent()
  }

  private handleInputSubmit(): void {
    if (this.wizardStep === "host") {
      if (this.inputValue.trim()) this.host = this.inputValue.trim()
      this.wizardStep = "port"
      this.inputValue = String(this.port)
    } else if (this.wizardStep === "port") {
      const p = parseInt(this.inputValue)
      if (!isNaN(p)) this.port = p
      this.wizardStep = "user"
      this.inputValue = this.user
    } else if (this.wizardStep === "user") {
      if (this.inputValue.trim()) this.user = this.inputValue.trim()
      this.wizardStep = "pass"
      this.inputValue = ""
    } else if (this.wizardStep === "pass") {
      this.pass = this.inputValue
      this.wizardStep = "configuring"
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
        this.wizardStep = "done"
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
      this.wizardStep = "done"
      this.refreshContent()
    } catch (e) {
      debugLog("qBittorrent", `Error: ${e}`)
      this.statusMessage = `❌ Error: ${e}`
      this.statusColor = "#ff5555"
      this.wizardStep = "done"
      this.refreshContent()
    }
  }
}
