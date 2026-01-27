/**
 * Jellyseerr Setup Screen
 * Automates the Jellyseerr setup wizard via API
 *
 * Uses shared setup actions from src/setup/actions/jellyseerr.ts
 */

import { CliRenderer, TextRenderable } from "@opentui/core"

import type { SetupContext } from "~/setup"
import type { MenuItem, SetupResult } from "~/ui/screens/setup/BaseAppSetupScreen"
import { EasiarrConfig } from "~/config/schema"
import {
  checkJellyseerrPrerequisites,
  configureJellyseerrRadarr,
  configureJellyseerrSonarr,
  createJellyseerrClient,
  createSetupContext,
  runJellyseerrFullSetup,
  syncJellyseerrLibraries,
} from "~/setup"
import { BaseAppSetupScreen } from "~/ui/screens/setup/BaseAppSetupScreen"
import { readEnvSync, writeEnvSync } from "~/utils/env"

export class JellyseerrSetup extends BaseAppSetupScreen {
  private mediaServerType: "jellyfin" | "plex" | null = null
  private healthChecked = false
  private healthMessage = ""
  private healthFg = "#aaaaaa"

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(cliRenderer, config, onBack)
    this.detectMediaServer()
    this.checkHealth()
  }

  getTitle(): string {
    return "Jellyseerr Setup"
  }

  getStepInfo(): string {
    return "Configure Jellyseerr via API"
  }

  getMenuItems(): MenuItem[] {
    return [
      {
        name: "🚀 Run Full Setup",
        description: "Configure media server, create admin, and connect *arr apps",
        action: () => this.runFullSetup(),
      },
      {
        name: "📚 Sync Libraries",
        description: "Sync and enable libraries from media server",
        action: () => this.runSyncLibraries(),
      },
      {
        name: "🔗 Configure Radarr",
        description: "Connect Radarr for movie requests",
        action: () => this.runConfigureRadarr(),
      },
      {
        name: "🔗 Configure Sonarr",
        description: "Connect Sonarr for TV show requests",
        action: () => this.runConfigureSonarr(),
      },
      {
        name: "↩️  Back",
        description: "Return to main menu",
        action: () => this.cleanup(),
      },
    ]
  }

  protected getMenuDescription(): string {
    return "Select an action:"
  }

  // ============================================
  // CUSTOM RENDERING - Shows health status above menu
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

      // Then render normal menu
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: this.getMenuDescription() + "\n\n",
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

      return true // Handled
    }
    return false // Use default for results
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private detectMediaServer(): void {
    const jellyfin = this.config.apps.find((a) => a.id === "jellyfin" && a.enabled)
    const plex = this.config.apps.find((a) => a.id === "plex" && a.enabled)

    if (jellyfin) this.mediaServerType = "jellyfin"
    else if (plex) this.mediaServerType = "plex"
  }

  private buildContext(): SetupContext {
    const env = readEnvSync()
    return createSetupContext(this.config, env, {
      onStepStart: (name) => {
        this.addOrUpdateResult(name, "configuring")
        this.refreshContent()
      },
      onStepComplete: (step) => {
        this.addOrUpdateResult(step.name, step.status as SetupResult["status"], step.message)
        this.refreshContent()
      },
    })
  }

  private addOrUpdateResult(name: string, status: SetupResult["status"], message?: string): void {
    const existing = this.results.find((r) => r.name === name)
    if (existing) {
      existing.status = status
      existing.message = message
    } else {
      this.results.push({ name, status, message })
    }
  }

  private async checkHealth(): Promise<void> {
    const ctx = this.buildContext()
    const prereq = await checkJellyseerrPrerequisites(ctx)

    if (!prereq.success) {
      this.healthMessage = `⚠️ ${prereq.message || "Requirements not met"}`
      this.healthFg = "#ff5555"
      this.healthChecked = true
      this.refreshContent()
      return
    }

    const client = createJellyseerrClient(ctx)
    if (client) {
      try {
        const isHealthy = await client.isHealthy()
        const isInit = isHealthy ? await client.isInitialized() : false

        if (!isHealthy) {
          this.healthMessage = "⚠️ Jellyseerr is not reachable. Make sure the container is running."
          this.healthFg = "#ffb86c"
        } else if (!isInit) {
          this.healthMessage = `✨ Jellyseerr needs setup. Will connect to ${this.mediaServerType}.`
          this.healthFg = "#50fa7b"
        } else {
          this.healthMessage = "✓ Jellyseerr is running and configured."
          this.healthFg = "#50fa7b"
        }
      } catch {
        // Ignore health check errors
      }
    }

    this.healthChecked = true
    this.refreshContent()
  }

  // ============================================
  // MENU ACTIONS
  // ============================================

  private async runFullSetup(): Promise<void> {
    this.currentStep = "running"
    this.results = []
    this.refreshContent()

    const ctx = this.buildContext()
    const result = await runJellyseerrFullSetup(ctx)

    // Save env updates
    if (result.envUpdates && Object.keys(result.envUpdates).length > 0) {
      const env = readEnvSync()
      Object.assign(env, result.envUpdates)
      writeEnvSync(env)
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async runSyncLibraries(): Promise<void> {
    await this.runAction("Sync libraries", async () => {
      const ctx = this.buildContext()
      return syncJellyseerrLibraries(ctx)
    })
  }

  private async runConfigureRadarr(): Promise<void> {
    await this.runAction("Configure Radarr", async () => {
      const ctx = this.buildContext()
      return configureJellyseerrRadarr(ctx)
    })
  }

  private async runConfigureSonarr(): Promise<void> {
    await this.runAction("Configure Sonarr", async () => {
      const ctx = this.buildContext()
      return configureJellyseerrSonarr(ctx)
    })
  }
}
