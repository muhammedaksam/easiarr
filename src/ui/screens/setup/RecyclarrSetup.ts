/**
 * Recyclarr Setup Screen
 * Configure TRaSH Guides profile sync and trigger manual runs
 */

import { CliRenderer, KeyEvent, TextRenderable } from "@opentui/core"

import type { MenuItem } from "~/ui/screens/setup/BaseAppSetupScreen"
import { saveRecyclarrConfig } from "~/config/recyclarr-config"
import { EasiarrConfig } from "~/config/schema"
import { RADARR_PRESETS, SONARR_PRESETS } from "~/data/trash-profiles"
import { composeRun } from "~/docker"
import { BaseAppSetupScreen } from "~/ui/screens/setup/BaseAppSetupScreen"

type ViewMode = "main" | "radarr" | "sonarr"

export class RecyclarrSetup extends BaseAppSetupScreen {
  private viewMode: ViewMode = "main"
  private radarrPreset: string = "hd-bluray-web"
  private sonarrPreset: string = "web-1080p-v4"
  private statusMessage: string = ""
  private statusColor: string = "#888888"

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(cliRenderer, config, onBack)
  }

  getTitle(): string {
    return "♻️ Recyclarr Setup"
  }

  getStepInfo(): string {
    return "Configure TRaSH Guides profile sync"
  }

  getMenuItems(): MenuItem[] {
    const radarrEnabled = this.config.apps.some((a) => a.id === "radarr" && a.enabled)
    const sonarrEnabled = this.config.apps.some((a) => a.id === "sonarr" && a.enabled)

    if (this.viewMode === "radarr") {
      return [
        ...RADARR_PRESETS.map((p) => ({
          name: `${this.radarrPreset === p.id ? "● " : "○ "}${p.name}`,
          description: p.description,
          action: () => {
            this.radarrPreset = p.id
            this.statusMessage = `✓ Radarr profile set to: ${p.name}`
            this.statusColor = "#50fa7b"
            this.viewMode = "main"
            this.menuIndex = 0
            this.refreshContent()
          },
        })),
        {
          name: "◀ Back",
          description: "Return to main menu",
          action: () => {
            this.viewMode = "main"
            this.menuIndex = 0
            this.refreshContent()
          },
        },
      ]
    }

    if (this.viewMode === "sonarr") {
      return [
        ...SONARR_PRESETS.map((p) => ({
          name: `${this.sonarrPreset === p.id ? "● " : "○ "}${p.name}`,
          description: p.description,
          action: () => {
            this.sonarrPreset = p.id
            this.statusMessage = `✓ Sonarr profile set to: ${p.name}`
            this.statusColor = "#50fa7b"
            this.viewMode = "main"
            this.menuIndex = 0
            this.refreshContent()
          },
        })),
        {
          name: "◀ Back",
          description: "Return to main menu",
          action: () => {
            this.viewMode = "main"
            this.menuIndex = 0
            this.refreshContent()
          },
        },
      ]
    }

    // Main Menu
    const options: MenuItem[] = []
    if (radarrEnabled) {
      options.push({
        name: "🎬 Configure Radarr Profile",
        description: "Select TRaSH Guide profile for movies",
        action: () => {
          this.viewMode = "radarr"
          this.menuIndex = 0
          this.refreshContent()
        },
      })
    }
    if (sonarrEnabled) {
      options.push({
        name: "📺 Configure Sonarr Profile",
        description: "Select TRaSH Guide profile for TV shows",
        action: () => {
          this.viewMode = "sonarr"
          this.menuIndex = 0
          this.refreshContent()
        },
      })
    }
    options.push({
      name: "🔄 Run Sync Now",
      description: "Manually trigger Recyclarr sync",
      action: () => this.runSync(),
    })
    options.push({
      name: "💾 Save & Generate Config",
      description: "Save recyclarr.yml configuration",
      action: () => this.saveConfig(),
    })
    options.push({
      name: "↩️  Back",
      description: "Return to main menu",
      action: () => this.cleanup(),
    })

    return options
  }

  protected getMenuDescription(): string {
    if (this.viewMode === "radarr") return "Select a TRaSH Guide profile for Radarr (Movies):"
    if (this.viewMode === "sonarr") return "Select a TRaSH Guide profile for Sonarr (TV Shows):"

    return "Recyclarr syncs TRaSH Guides custom formats and quality profiles to your *arr apps."
  }

  protected renderCustomContent(): boolean {
    if (this.currentStep === "menu" && this.viewMode === "main") {
      const radarrEnabled = this.config.apps.some((a) => a.id === "radarr" && a.enabled)
      const sonarrEnabled = this.config.apps.some((a) => a.id === "sonarr" && a.enabled)
      const recyclarrEnabled = this.config.apps.some((a) => a.id === "recyclarr" && a.enabled)

      if (this.statusMessage) {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: this.statusMessage + "\n\n",
            fg: this.statusColor,
          })
        )
      }

      if (!recyclarrEnabled) {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: "⚠️ Recyclarr is not enabled. Enable it in App Manager first.\n\n",
            fg: "#ff5555",
          })
        )
        // We still show the menu but actions will mostly fail or we can filter them
      }

      // Current config status
      if (radarrEnabled || sonarrEnabled) {
        if (radarrEnabled) {
          const preset = RADARR_PRESETS.find((p) => p.id === this.radarrPreset)
          this.contentBox.add(
            new TextRenderable(this.cliRenderer, {
              content: `🎬 Radarr: ${preset?.name || "Default"}\n`,
              fg: "#50fa7b",
            })
          )
        }
        if (sonarrEnabled) {
          const preset = SONARR_PRESETS.find((p) => p.id === this.sonarrPreset)
          this.contentBox.add(
            new TextRenderable(this.cliRenderer, {
              content: `📺 Sonarr: ${preset?.name || "Default"}\n`,
              fg: "#50fa7b",
            })
          )
        }
        this.contentBox.add(new TextRenderable(this.cliRenderer, { content: "\n" }))
      }

      // Let the base class render the menu after this
      this.renderMenu()
      return true
    }
    return false
  }

  protected handleCustomKeys(key: KeyEvent): boolean {
    if (this.viewMode !== "main" && (key.name === "escape" || key.name === "q")) {
      this.viewMode = "main"
      this.menuIndex = 0
      this.refreshContent()
      return true
    }
    return false
  }

  // ============================================
  // ACTIONS
  // ============================================

  private async runSync(): Promise<void> {
    this.currentStep = "running"
    this.results = [
      { name: "Save Config", status: "configuring" },
      { name: "Recyclarr Sync", status: "pending" },
    ]
    this.refreshContent()

    try {
      // Save config first
      await saveRecyclarrConfig(this.config)
      this.results[0].status = "success"
      this.refreshContent()

      // Run sync
      this.results[1].status = "configuring"
      this.refreshContent()
      const result = await composeRun("recyclarr", "sync")

      if (result.success) {
        this.results[1].status = "success"
        this.statusMessage = "✓ Recyclarr sync completed successfully!"
        this.statusColor = "#50fa7b"
      } else {
        this.results[1].status = "error"
        this.results[1].message = "Sync completed with warnings"
        this.statusMessage = "⚠ Sync completed with warnings"
        this.statusColor = "#f1fa8c"
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const current = this.results.find((r) => r.status === "configuring")
      if (current) {
        current.status = "error"
        current.message = msg
      }
      this.statusMessage = `✗ Sync failed: ${msg}`
      this.statusColor = "#ff5555"
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async saveConfig(): Promise<void> {
    await this.runAction("Save Config", async () => {
      try {
        await saveRecyclarrConfig(this.config)
        this.statusMessage = "✓ Recyclarr config saved!"
        this.statusColor = "#50fa7b"
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.statusMessage = `✗ Failed to save config: ${msg}`
        this.statusColor = "#ff5555"
        return { success: false, message: msg }
      }
    })
  }
}
