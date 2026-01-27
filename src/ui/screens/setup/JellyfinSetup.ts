/**
 * Jellyfin Setup Screen
 * Automates the Jellyfin setup wizard via API
 */

import { CliRenderer, TextRenderable } from "@opentui/core"

import type { MenuItem, SetupResult } from "~/ui/screens/setup/BaseAppSetupScreen"
import { JellyfinClient } from "~/api/jellyfin-api"
import { EasiarrConfig } from "~/config/schema"
import { BaseAppSetupScreen } from "~/ui/screens/setup/BaseAppSetupScreen"
import { readEnvSync, writeEnvSync } from "~/utils/env"

export class JellyfinSetup extends BaseAppSetupScreen {
  private jellyfinClient: JellyfinClient | null = null
  private healthChecked = false
  private healthMessage = ""
  private healthFg = "#aaaaaa"

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(cliRenderer, config, onBack)
    this.initJellyfinClient()
    this.checkHealth()
  }

  getTitle(): string {
    return "Jellyfin Setup"
  }

  getStepInfo(): string {
    return "Configure Jellyfin via API"
  }

  getMenuItems(): MenuItem[] {
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

  // ============================================
  // CUSTOM RENDERING - Show health status
  // ============================================

  protected renderCustomContent(): boolean {
    if (this.currentStep === "menu") {
      // Show health status before menu
      if (this.healthChecked && this.healthMessage) {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: this.healthMessage + "\n\n",
            fg: this.healthFg,
          })
        )
      }

      // Render menu normally
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

      return true
    }
    return false // Use default for results
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private initJellyfinClient(): void {
    const jellyfinConfig = this.config.apps.find((a) => a.id === "jellyfin")
    if (jellyfinConfig?.enabled) {
      const port = jellyfinConfig.port || 8096
      this.jellyfinClient = new JellyfinClient("localhost", port)
    }
  }

  private async checkHealth(): Promise<void> {
    if (!this.jellyfinClient) {
      this.healthMessage = "⚠️ Jellyfin not enabled in config!"
      this.healthFg = "#ff5555"
      this.healthChecked = true
      this.refreshContent()
      return
    }

    try {
      const isHealthy = await this.jellyfinClient.isHealthy()
      const isComplete = isHealthy ? await this.jellyfinClient.isStartupComplete() : false

      if (!isHealthy) {
        this.healthMessage = "⚠️ Jellyfin is not reachable. Make sure the container is running."
        this.healthFg = "#ffb86c"
      } else if (!isComplete) {
        this.healthMessage = "✨ Jellyfin needs initial setup. Run 'Setup Wizard' to configure."
        this.healthFg = "#50fa7b"
      } else {
        this.healthMessage = "✓ Jellyfin is running and configured."
        this.healthFg = "#50fa7b"
      }
    } catch {
      // Ignore health check errors
    }

    this.healthChecked = true
    this.refreshContent()
  }

  private updateResult(index: number, status: SetupResult["status"], message?: string): void {
    if (this.results[index]) {
      this.results[index].status = status
      if (message) this.results[index].message = message
    }
    this.refreshContent()
  }

  // ============================================
  // MENU ACTIONS
  // ============================================

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
        this.updateResult(0, "skipped", "Already configured")
        this.results
          .slice(1)
          .forEach((_, i) => this.updateResult(i + 1, "skipped", "Wizard already completed"))
        this.currentStep = "done"
        this.refreshContent()
        return
      }
      this.updateResult(0, "success", "Wizard needed")

      // Step 2: Set metadata language
      this.updateResult(1, "configuring")
      await this.jellyfinClient.setStartupConfiguration({
        UICulture: "en-US",
        MetadataCountryCode: "US",
        PreferredMetadataLanguage: "en",
      })
      this.updateResult(1, "success")

      // Step 3: Create admin user
      this.updateResult(2, "configuring")
      const env = readEnvSync()
      const username = env["USERNAME_GLOBAL"] || "admin"
      const password = env["PASSWORD_GLOBAL"] || "Ch4ng3m3!1234securityReasons"
      await this.jellyfinClient.createAdminUser(username, password)
      this.updateResult(2, "success", `User: ${username}`)

      // Step 4: Configure remote access
      this.updateResult(3, "configuring")
      await this.jellyfinClient.setRemoteAccess(true, false)
      this.updateResult(3, "success")

      // Step 5: Complete wizard
      this.updateResult(4, "configuring")
      await this.jellyfinClient.completeStartup()
      this.updateResult(4, "success")
    } catch (error) {
      const current = this.results.findIndex((r) => r.status === "configuring")
      if (current >= 0) {
        this.updateResult(current, "error", error instanceof Error ? error.message : String(error))
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
      const username = env["USERNAME_GLOBAL"] || "admin"
      const password = env["PASSWORD_GLOBAL"] || "Ch4ng3m3!1234securityReasons"
      await this.jellyfinClient.authenticate(username, password)
      this.updateResult(0, "success")

      // Add libraries
      const libraries = [
        { name: "Movies", collectionType: "movies" as const, paths: ["/data/media/movies"] },
        { name: "TV Shows", collectionType: "tvshows" as const, paths: ["/data/media/tv"] },
        { name: "Music", collectionType: "music" as const, paths: ["/data/media/music"] },
      ]

      for (let i = 0; i < libraries.length; i++) {
        const lib = libraries[i]
        this.updateResult(i + 1, "configuring")

        try {
          await this.jellyfinClient.addVirtualFolder(lib)
          this.updateResult(i + 1, "success", lib.paths[0])
        } catch (error) {
          this.updateResult(i + 1, "error", error instanceof Error ? error.message : String(error))
        }
      }
    } catch (error) {
      this.updateResult(0, "error", error instanceof Error ? error.message : String(error))
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
      const username = env["USERNAME_GLOBAL"] || "admin"
      const password = env["PASSWORD_GLOBAL"] || "Ch4ng3m3!1234securityReasons"
      await this.jellyfinClient.authenticate(username, password)
      this.updateResult(0, "success")

      // Generate API key
      this.updateResult(1, "configuring")
      const apiKey = await this.jellyfinClient.createApiKey("easiarr")
      if (!apiKey) {
        throw new Error("Failed to create API key")
      }
      this.updateResult(1, "success", `Key: ${apiKey.substring(0, 8)}...`)

      // Save to .env
      this.updateResult(2, "configuring")
      env["API_KEY_JELLYFIN"] = apiKey
      writeEnvSync(env)
      this.updateResult(2, "success", "Saved as API_KEY_JELLYFIN")
    } catch (error) {
      const current = this.results.findIndex((r) => r.status === "configuring")
      if (current >= 0) {
        this.updateResult(current, "error", error instanceof Error ? error.message : String(error))
      }
    }

    this.currentStep = "done"
    this.refreshContent()
  }
}
