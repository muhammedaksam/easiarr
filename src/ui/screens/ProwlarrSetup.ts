/**
 * Prowlarr Setup Screen
 * Configures Prowlarr integration with *arr apps, FlareSolverr, and proxies
 */

import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig } from "../../config/schema"
import { getApp } from "../../apps/registry"
import { ProwlarrClient, ArrAppType } from "../../api/prowlarr-api"
import { readEnvSync } from "../../utils/env"
import { debugLog } from "../../utils/debug"

interface SetupResult {
  name: string
  status: "pending" | "configuring" | "success" | "error" | "skipped"
  message?: string
}

type Step = "menu" | "sync-apps" | "flaresolverr" | "sync-profiles" | "done"

const ARR_APP_TYPES: Record<string, ArrAppType> = {
  radarr: "Radarr",
  sonarr: "Sonarr",
  lidarr: "Lidarr",
  readarr: "Readarr",
}

export class ProwlarrSetup extends BoxRenderable {
  private config: EasiarrConfig
  private cliRenderer: CliRenderer
  private onBack: () => void
  private keyHandler!: (key: KeyEvent) => void
  private results: SetupResult[] = []
  private currentStep: Step = "menu"
  private contentBox!: BoxRenderable
  private pageContainer!: BoxRenderable
  private menuIndex = 0
  private prowlarrClient: ProwlarrClient | null = null

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    const { container: pageContainer, content: contentBox } = createPageLayout(cliRenderer, {
      title: "Prowlarr Setup",
      stepInfo: "Configure indexer sync and proxies",
      footerHint: "↑↓ Navigate  Enter Select  Esc Back",
    })
    super(cliRenderer, { width: "100%", height: "100%" })
    this.add(pageContainer)

    this.config = config
    this.cliRenderer = cliRenderer
    this.onBack = onBack
    this.contentBox = contentBox
    this.pageContainer = pageContainer

    this.initProwlarrClient()
    this.initKeyHandler()
    this.refreshContent()
  }

  private initProwlarrClient(): void {
    const env = readEnvSync()
    const apiKey = env["API_KEY_PROWLARR"]
    if (apiKey) {
      const prowlarrConfig = this.config.apps.find((a) => a.id === "prowlarr")
      const port = prowlarrConfig?.port || 9696
      this.prowlarrClient = new ProwlarrClient("localhost", port, apiKey)
    }
  }

  private initKeyHandler(): void {
    this.keyHandler = (key: KeyEvent) => {
      debugLog("Prowlarr", `Key: ${key.name}, step=${this.currentStep}`)

      if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
        if (this.currentStep === "menu") {
          this.cleanup()
        } else {
          this.currentStep = "menu"
          this.refreshContent()
        }
        return
      }

      if (this.currentStep === "menu") {
        this.handleMenuKeys(key)
      } else if (this.currentStep === "done") {
        if (key.name === "return" || key.name === "escape") {
          this.currentStep = "menu"
          this.refreshContent()
        }
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
    debugLog("Prowlarr", "Key handler registered")
  }

  private handleMenuKeys(key: KeyEvent): void {
    const menuItems = this.getMenuItems()

    if (key.name === "up" && this.menuIndex > 0) {
      this.menuIndex--
      this.refreshContent()
    } else if (key.name === "down" && this.menuIndex < menuItems.length - 1) {
      this.menuIndex++
      this.refreshContent()
    } else if (key.name === "return") {
      this.executeMenuItem(this.menuIndex)
    }
  }

  private getMenuItems(): { name: string; description: string; action: () => void }[] {
    return [
      {
        name: "🔗 Sync *arr Apps",
        description: "Connect Radarr/Sonarr/etc to Prowlarr",
        action: () => this.syncArrApps(),
      },
      {
        name: "🛡️ Setup FlareSolverr",
        description: "Add Cloudflare bypass proxy",
        action: () => this.setupFlareSolverr(),
      },
      {
        name: "📊 Create Sync Profiles",
        description: "Limited API indexer profiles",
        action: () => this.createSyncProfiles(),
      },
      {
        name: "↩️  Back",
        description: "Return to main menu",
        action: () => this.cleanup(),
      },
    ]
  }

  private executeMenuItem(index: number): void {
    const items = this.getMenuItems()
    if (index >= 0 && index < items.length) {
      items[index].action()
    }
  }

  private async syncArrApps(): Promise<void> {
    if (!this.prowlarrClient) {
      this.results = [{ name: "Prowlarr", status: "error", message: "API key not found" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "sync-apps"
    this.results = []

    const arrApps = this.config.apps.filter((a) => a.enabled && Object.keys(ARR_APP_TYPES).includes(a.id))
    const env = readEnvSync()
    const prowlarrConfig = this.config.apps.find((a) => a.id === "prowlarr")
    const prowlarrPort = prowlarrConfig?.port || 9696

    for (const app of arrApps) {
      const appType = ARR_APP_TYPES[app.id]
      if (!appType) continue

      this.results.push({ name: app.id, status: "configuring" })
      this.refreshContent()

      try {
        const apiKey = env[`API_KEY_${app.id.toUpperCase()}`]
        if (!apiKey) {
          const result = this.results.find((r) => r.name === app.id)
          if (result) {
            result.status = "skipped"
            result.message = "No API key"
          }
          continue
        }

        const appDef = getApp(app.id)
        const port = app.port || appDef?.defaultPort || 7878

        await this.prowlarrClient.addArrApp(appType, "localhost", port, apiKey, "localhost", prowlarrPort)

        const result = this.results.find((r) => r.name === app.id)
        if (result) {
          result.status = "success"
        }
      } catch (error) {
        const result = this.results.find((r) => r.name === app.id)
        if (result) {
          result.status = "error"
          result.message = error instanceof Error ? error.message : "Unknown error"
        }
      }
      this.refreshContent()
    }

    // Trigger sync
    try {
      await this.prowlarrClient.syncApplications()
    } catch {
      // Sync might fail if no apps, that's ok
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async setupFlareSolverr(): Promise<void> {
    if (!this.prowlarrClient) {
      this.results = [{ name: "Prowlarr", status: "error", message: "API key not found" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "flaresolverr"
    this.results = [{ name: "FlareSolverr", status: "configuring" }]
    this.refreshContent()

    try {
      // Check if FlareSolverr is enabled
      const fsConfig = this.config.apps.find((a) => a.id === "flaresolverr")
      if (!fsConfig?.enabled) {
        this.results[0].status = "skipped"
        this.results[0].message = "FlareSolverr not enabled in config"
      } else {
        const fsPort = fsConfig.port || 8191
        await this.prowlarrClient.configureFlareSolverr(`http://flaresolverr:${fsPort}`)
        this.results[0].status = "success"
        this.results[0].message = "Proxy added with 'flaresolverr' tag"
      }
    } catch (error) {
      this.results[0].status = "error"
      this.results[0].message = error instanceof Error ? error.message : "Unknown error"
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async createSyncProfiles(): Promise<void> {
    if (!this.prowlarrClient) {
      this.results = [{ name: "Prowlarr", status: "error", message: "API key not found" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "sync-profiles"
    this.results = [
      { name: "Automatic Search", status: "configuring" },
      { name: "Interactive Search", status: "configuring" },
    ]
    this.refreshContent()

    try {
      await this.prowlarrClient.createLimitedAPISyncProfiles()
      this.results[0].status = "success"
      this.results[0].message = "RSS disabled, auto+interactive enabled"
      this.results[1].status = "success"
      this.results[1].message = "RSS+auto disabled, interactive only"
    } catch (error) {
      this.results.forEach((r) => {
        r.status = "error"
        r.message = error instanceof Error ? error.message : "Unknown error"
      })
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private refreshContent(): void {
    this.contentBox.getChildren().forEach((child) => child.destroy())

    if (this.currentStep === "menu") {
      this.renderMenu()
    } else {
      this.renderResults()
    }
  }

  private renderMenu(): void {
    if (!this.prowlarrClient) {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "⚠️ Prowlarr API key not found!\nRun 'Extract API Keys' first.\n\n",
          fg: "#ff5555",
        })
      )
    }

    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "Select an action:\n\n",
        fg: "#aaaaaa",
      })
    )

    this.getMenuItems().forEach((item, idx) => {
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
          content: `    ${item.description}\n\n`,
          fg: "#6272a4",
        })
      )
    })
  }

  private renderResults(): void {
    const headerText = this.currentStep === "done" ? "Results:\n\n" : "Configuring...\n\n"
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: headerText,
        fg: this.currentStep === "done" ? "#50fa7b" : "#f1fa8c",
      })
    )

    for (const result of this.results) {
      let status = ""
      let fg = "#aaaaaa"
      switch (result.status) {
        case "pending":
          status = "⏳"
          break
        case "configuring":
          status = "🔄"
          fg = "#f1fa8c"
          break
        case "success":
          status = "✓"
          fg = "#50fa7b"
          break
        case "error":
          status = "✗"
          fg = "#ff5555"
          break
        case "skipped":
          status = "⊘"
          fg = "#6272a4"
          break
      }

      let content = `${status} ${result.name}`
      if (result.message) {
        content += ` - ${result.message}`
      }

      this.contentBox.add(new TextRenderable(this.cliRenderer, { content: content + "\n", fg }))
    }

    if (this.currentStep === "done") {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "\nPress Enter or Esc to continue...",
          fg: "#6272a4",
        })
      )
    }
  }

  private cleanup(): void {
    this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    this.destroy()
    this.onBack()
  }
}
