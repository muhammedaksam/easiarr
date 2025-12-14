/**
 * Jellyfin Setup Screen
 * Automates the Jellyfin setup wizard via API
 */

import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig } from "../../config/schema"
import { JellyfinClient } from "../../api/jellyfin-api"
import { readEnvSync, writeEnvSync } from "../../utils/env"
import { debugLog } from "../../utils/debug"

interface SetupResult {
  name: string
  status: "pending" | "configuring" | "success" | "error" | "skipped"
  message?: string
}

type Step = "menu" | "running" | "done"

export class JellyfinSetup extends BoxRenderable {
  private config: EasiarrConfig
  private cliRenderer: CliRenderer
  private onBack: () => void
  private keyHandler!: (key: KeyEvent) => void
  private results: SetupResult[] = []
  private currentStep: Step = "menu"
  private contentBox!: BoxRenderable
  private menuIndex = 0
  private jellyfinClient: JellyfinClient | null = null

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    const { container: pageContainer, content: contentBox } = createPageLayout(cliRenderer, {
      title: "Jellyfin Setup",
      stepInfo: "Configure Jellyfin via API",
      footerHint: [
        { type: "key", key: "↑↓", value: "Navigate" },
        { type: "key", key: "Enter", value: "Select" },
        { type: "key", key: "Esc", value: "Back" },
      ],
    })
    super(cliRenderer, { width: "100%", height: "100%" })
    this.add(pageContainer)

    this.config = config
    this.cliRenderer = cliRenderer
    this.onBack = onBack
    this.contentBox = contentBox

    this.initJellyfinClient()
    this.initKeyHandler()
    this.refreshContent()
  }

  private initJellyfinClient(): void {
    const jellyfinConfig = this.config.apps.find((a) => a.id === "jellyfin")
    if (jellyfinConfig?.enabled) {
      const port = jellyfinConfig.port || 8096
      this.jellyfinClient = new JellyfinClient("localhost", port)
    }
  }

  private initKeyHandler(): void {
    this.keyHandler = (key: KeyEvent) => {
      debugLog("Jellyfin", `Key: ${key.name}, step=${this.currentStep}`)

      if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
        if (this.currentStep === "menu") {
          this.cleanup()
        } else if (this.currentStep === "done") {
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
    debugLog("Jellyfin", "Key handler registered")
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
        name: "🚀 Run Setup Wizard",
        description: "Create admin user and complete initial setup",
        action: () => this.runSetupWizard(),
      },
      {
        name: "📚 Add Default Libraries",
        description: "Add Movies, TV Shows, Music libraries",
        action: () => this.addDefaultLibraries(),
      },
      {
        name: "🔑 Generate API Key",
        description: "Create API key for Homepage widget",
        action: () => this.generateApiKey(),
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

  private async runSetupWizard(): Promise<void> {
    if (!this.jellyfinClient) {
      this.results = [{ name: "Jellyfin", status: "error", message: "Not enabled in config" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = [
      { name: "Check status", status: "configuring" },
      { name: "Set metadata language", status: "pending" },
      { name: "Create admin user", status: "pending" },
      { name: "Configure remote access", status: "pending" },
      { name: "Complete wizard", status: "pending" },
    ]
    this.refreshContent()

    try {
      // Step 1: Check if already set up
      const isComplete = await this.jellyfinClient.isStartupComplete()
      if (isComplete) {
        this.results[0].status = "skipped"
        this.results[0].message = "Already configured"
        this.results.slice(1).forEach((r) => {
          r.status = "skipped"
          r.message = "Wizard already completed"
        })
        this.currentStep = "done"
        this.refreshContent()
        return
      }
      this.results[0].status = "success"
      this.results[0].message = "Wizard needed"
      this.refreshContent()

      // Step 2: Set metadata language
      this.results[1].status = "configuring"
      this.refreshContent()
      await this.jellyfinClient.setStartupConfiguration({
        UICulture: "en-US",
        MetadataCountryCode: "US",
        PreferredMetadataLanguage: "en",
      })
      this.results[1].status = "success"
      this.refreshContent()

      // Step 3: Create admin user
      this.results[2].status = "configuring"
      this.refreshContent()
      const env = readEnvSync()
      const username = env["GLOBAL_USERNAME"] || "admin"
      const password = env["GLOBAL_PASSWORD"] || "changeme123"
      await this.jellyfinClient.createAdminUser(username, password)
      this.results[2].status = "success"
      this.results[2].message = `User: ${username}`
      this.refreshContent()

      // Step 4: Configure remote access
      this.results[3].status = "configuring"
      this.refreshContent()
      await this.jellyfinClient.setRemoteAccess(true, false)
      this.results[3].status = "success"
      this.refreshContent()

      // Step 5: Complete wizard
      this.results[4].status = "configuring"
      this.refreshContent()
      await this.jellyfinClient.completeStartup()
      this.results[4].status = "success"
      this.refreshContent()
    } catch (error) {
      const current = this.results.find((r) => r.status === "configuring")
      if (current) {
        current.status = "error"
        current.message = error instanceof Error ? error.message : String(error)
      }
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async addDefaultLibraries(): Promise<void> {
    if (!this.jellyfinClient) {
      this.results = [{ name: "Jellyfin", status: "error", message: "Not enabled in config" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = [
      { name: "Authenticate", status: "configuring" },
      { name: "Movies", status: "pending" },
      { name: "TV Shows", status: "pending" },
      { name: "Music", status: "pending" },
    ]
    this.refreshContent()

    try {
      // Authenticate first
      const env = readEnvSync()
      const username = env["GLOBAL_USERNAME"] || "admin"
      const password = env["GLOBAL_PASSWORD"] || "changeme123"
      await this.jellyfinClient.authenticate(username, password)
      this.results[0].status = "success"
      this.refreshContent()

      // Add libraries
      const libraries = [
        { name: "Movies", collectionType: "movies" as const, paths: ["/data/media/movies"] },
        { name: "TV Shows", collectionType: "tvshows" as const, paths: ["/data/media/tv"] },
        { name: "Music", collectionType: "music" as const, paths: ["/data/media/music"] },
      ]

      for (let i = 0; i < libraries.length; i++) {
        const lib = libraries[i]
        this.results[i + 1].status = "configuring"
        this.refreshContent()

        try {
          await this.jellyfinClient.addVirtualFolder(lib)
          this.results[i + 1].status = "success"
          this.results[i + 1].message = lib.paths[0]
        } catch (error) {
          this.results[i + 1].status = "error"
          this.results[i + 1].message = error instanceof Error ? error.message : String(error)
        }
        this.refreshContent()
      }
    } catch (error) {
      this.results[0].status = "error"
      this.results[0].message = error instanceof Error ? error.message : String(error)
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async generateApiKey(): Promise<void> {
    if (!this.jellyfinClient) {
      this.results = [{ name: "Jellyfin", status: "error", message: "Not enabled in config" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = [
      { name: "Authenticate", status: "configuring" },
      { name: "Generate API Key", status: "pending" },
      { name: "Save to .env", status: "pending" },
    ]
    this.refreshContent()

    try {
      // Authenticate first
      const env = readEnvSync()
      const username = env["GLOBAL_USERNAME"] || "admin"
      const password = env["GLOBAL_PASSWORD"] || "changeme123"
      await this.jellyfinClient.authenticate(username, password)
      this.results[0].status = "success"
      this.refreshContent()

      // Generate API key
      this.results[1].status = "configuring"
      this.refreshContent()
      const apiKey = await this.jellyfinClient.createApiKey("Easiarr")
      if (!apiKey) {
        throw new Error("Failed to create API key")
      }
      this.results[1].status = "success"
      this.results[1].message = `Key: ${apiKey.substring(0, 8)}...`
      this.refreshContent()

      // Save to .env
      this.results[2].status = "configuring"
      this.refreshContent()
      env["API_KEY_JELLYFIN"] = apiKey
      writeEnvSync(env)
      this.results[2].status = "success"
      this.results[2].message = "Saved as API_KEY_JELLYFIN"
      this.refreshContent()
    } catch (error) {
      const current = this.results.find((r) => r.status === "configuring")
      if (current) {
        current.status = "error"
        current.message = error instanceof Error ? error.message : String(error)
      }
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
    // Check health status
    this.checkHealth()

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

  private async checkHealth(): Promise<void> {
    if (!this.jellyfinClient) {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "⚠️ Jellyfin not enabled in config!\n\n",
          fg: "#ff5555",
        })
      )
      return
    }

    try {
      const isHealthy = await this.jellyfinClient.isHealthy()
      const isComplete = isHealthy ? await this.jellyfinClient.isStartupComplete() : false

      if (!isHealthy) {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: "⚠️ Jellyfin is not reachable. Make sure the container is running.\n\n",
            fg: "#ffb86c",
          })
        )
      } else if (!isComplete) {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: "✨ Jellyfin needs initial setup. Run 'Setup Wizard' to configure.\n\n",
            fg: "#50fa7b",
          })
        )
      } else {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: "✓ Jellyfin is running and configured.\n\n",
            fg: "#50fa7b",
          })
        )
      }
    } catch {
      // Ignore errors in health check display
    }
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
