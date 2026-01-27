/**
 * TRaSH Profile Setup Screen
 * Allows users to configure TRaSH-recommended quality profiles and custom formats
 */

import { CliRenderer, KeyEvent, TextRenderable } from "@opentui/core"

import type {
  SetupResult as BaseSetupResult,
  MenuItem,
} from "~/ui/screens/setup/BaseAppSetupScreen"
import { ArrApiClient } from "~/api/arr-api"
import { CustomFormatClient, getCFNamesForCategories } from "~/api/custom-format-api"
import { QualityProfileClient } from "~/api/quality-profile-api"
import { getApp } from "~/apps/registry"
import { AppId, EasiarrConfig } from "~/config/schema"
import { LIDARR_CUSTOM_FORMATS } from "~/data/lidarr-custom-formats"
import { getPresetsForApp, TRaSHProfilePreset } from "~/data/trash-profiles"
import { BaseAppSetupScreen } from "~/ui/screens/setup/BaseAppSetupScreen"
import { readEnvSync } from "~/utils/env"

interface SetupResult extends BaseSetupResult {
  appId: AppId
  appName: string
  profile: string
  cfCount: number
  namingConfigured: boolean
}

type SubStep = "select-apps" | "select-profiles"

export class TRaSHProfileSetup extends BaseAppSetupScreen {
  private subStep: SubStep = "select-apps"
  private selectedApps: Map<AppId, boolean> = new Map()
  private selectedProfiles: Map<AppId, string> = new Map()
  private currentIndex = 0
  private availableApps: AppId[] = []

  // Override results with more specific type
  protected results: SetupResult[] = []

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(cliRenderer, config, onBack)

    // Get enabled *arr apps that support quality profiles
    this.availableApps = config.apps
      .filter((a) => a.enabled && ["radarr", "sonarr", "lidarr"].includes(a.id))
      .map((a) => a.id)

    // Initialize selections
    this.availableApps.forEach((id) => {
      this.selectedApps.set(id, true)
      const presets = getPresetsForApp(id as "radarr" | "sonarr" | "lidarr")
      if (presets.length > 0) {
        this.selectedProfiles.set(id, presets[0].id)
      }
    })

    this.refreshContent()
  }

  getTitle(): string {
    return "TRaSH Guide Setup"
  }

  getStepInfo(): string {
    return "Configure quality profiles and custom formats"
  }

  // We don't use the default menu items system for this screen's wizard steps
  getMenuItems(): MenuItem[] {
    return []
  }

  protected renderCustomContent(): boolean {
    if (this.currentStep === "running" || this.currentStep === "done") {
      this.renderResults()
      return true
    }

    if (this.subStep === "select-apps") {
      this.renderSelectApps()
      return true
    } else if (this.subStep === "select-profiles") {
      this.renderSelectProfiles()
      return true
    }

    return false
  }

  protected handleCustomKeys(key: KeyEvent): boolean {
    if (this.currentStep === "running") return true
    if (this.currentStep === "done") return false // Base class handles return/esc

    if (this.subStep === "select-apps") {
      this.handleSelectAppsKeys(key)
      return true
    } else if (this.subStep === "select-profiles") {
      this.handleSelectProfilesKeys(key)
      return true
    }

    return false
  }

  // ============================================
  // SELECTION RENDERING
  // ============================================

  private renderSelectApps(): void {
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content:
          "Select apps to configure with TRaSH profiles:\n(Space to toggle, Enter to continue)\n\n",
        fg: "#aaaaaa",
      })
    )

    this.availableApps.forEach((appId, idx) => {
      const app = getApp(appId)
      const selected = this.selectedApps.get(appId)
      const pointer = idx === this.currentIndex ? "→ " : "  "
      const check = selected ? "[✓]" : "[ ]"
      const fg = idx === this.currentIndex ? "#50fa7b" : selected ? "#8be9fd" : "#6272a4"

      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `${pointer}${check} ${app?.name || appId}\n`,
          fg,
        })
      )
    })
  }

  private renderSelectProfiles(): void {
    const selectedAppIds = this.availableApps.filter((id) => this.selectedApps.get(id))

    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content:
          "Select quality profile for each app:\n(↑↓ change profile, Tab next app, Enter apply)\n\n",
        fg: "#aaaaaa",
      })
    )

    selectedAppIds.forEach((appId, appIdx) => {
      const app = getApp(appId)
      const presets = getPresetsForApp(appId as "radarr" | "sonarr" | "lidarr")
      const selectedPresetId = this.selectedProfiles.get(appId)
      const isCurrent = appIdx === this.currentIndex

      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `${isCurrent ? "→ " : "  "}${app?.name}:\n`,
          fg: isCurrent ? "#50fa7b" : "#8be9fd",
        })
      )

      presets.forEach((preset) => {
        const isSelected = preset.id === selectedPresetId
        const bullet = isSelected ? "●" : "○"
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: `    ${bullet} ${preset.name}\n`,
            fg: isSelected ? "#f1fa8c" : "#6272a4",
          })
        )
      })
    })
  }

  protected renderResults(): void {
    const headerText =
      this.currentStep === "done" ? "✓ Configuration Complete!\n\n" : "Configuring...\n\n"
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
      }

      let content = `${status} ${result.appName}: ${result.profile}`
      if (result.status === "success") {
        content += ` (${result.cfCount} CF scores, naming configured)`
      }
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

  // ============================================
  // KEY HANDLING
  // ============================================

  private handleSelectAppsKeys(key: KeyEvent): void {
    if (key.name === "up" && this.currentIndex > 0) {
      this.currentIndex--
      this.refreshContent()
    } else if (key.name === "down" && this.currentIndex < this.availableApps.length - 1) {
      this.currentIndex++
      this.refreshContent()
    } else if (key.name === "space") {
      const app = this.availableApps[this.currentIndex]
      this.selectedApps.set(app, !this.selectedApps.get(app))
      this.refreshContent()
    } else if (key.name === "return") {
      const hasSelected = Array.from(this.selectedApps.values()).some((v) => v)
      if (hasSelected) {
        this.subStep = "select-profiles"
        this.currentIndex = 0
        this.refreshContent()
      }
    }
  }

  private handleSelectProfilesKeys(key: KeyEvent): void {
    const selectedAppIds = this.availableApps.filter((id) => this.selectedApps.get(id))
    const app = selectedAppIds[this.currentIndex]
    const presets = getPresetsForApp(app as "radarr" | "sonarr" | "lidarr")

    if (key.name === "up") {
      const current = this.selectedProfiles.get(app)
      const idx = presets.findIndex((p) => p.id === current)
      if (idx > 0) {
        this.selectedProfiles.set(app, presets[idx - 1].id)
        this.refreshContent()
      }
    } else if (key.name === "down") {
      const current = this.selectedProfiles.get(app)
      const idx = presets.findIndex((p) => p.id === current)
      if (idx < presets.length - 1) {
        this.selectedProfiles.set(app, presets[idx + 1].id)
        this.refreshContent()
      }
    } else if (key.name === "tab" || key.name === "right") {
      if (this.currentIndex < selectedAppIds.length - 1) {
        this.currentIndex++
        this.refreshContent()
      }
    } else if (key.name === "left" && this.currentIndex > 0) {
      this.currentIndex--
      this.refreshContent()
    } else if (key.name === "return") {
      this.startImport()
    } else if (key.name === "backspace" || key.name === "b") {
      this.subStep = "select-apps"
      this.currentIndex = 0
      this.refreshContent()
    }
  }

  // ============================================
  // ACTIONS
  // ============================================

  private async startImport(): Promise<void> {
    this.currentStep = "running"
    this.results = []

    const selectedAppIds = this.availableApps.filter((id) => this.selectedApps.get(id))

    for (const appId of selectedAppIds) {
      const appDef = getApp(appId)
      const profileId = this.selectedProfiles.get(appId)
      const preset = getPresetsForApp(appId as "radarr" | "sonarr" | "lidarr").find(
        (p) => p.id === profileId
      )

      if (!appDef || !preset) continue

      this.results.push({
        name: appId, // Base class requires name
        appId,
        appName: appDef.name,
        profile: preset.name,
        cfCount: 0,
        namingConfigured: false,
        status: "configuring",
      })
      this.refreshContent()

      try {
        await this.configureApp(appId, preset)
        const result = this.results.find((r) => r.appId === appId)
        if (result) {
          result.status = "success"
          result.cfCount = Object.keys(preset.cfScores).length
          result.namingConfigured = true
        }
      } catch (error) {
        const result = this.results.find((r) => r.appId === appId)
        if (result) {
          result.status = "error"
          result.message = error instanceof Error ? error.message : "Unknown error"
        }
      }
      this.refreshContent()
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async configureApp(appId: AppId, preset: TRaSHProfilePreset): Promise<void> {
    const appDef = getApp(appId)
    if (!appDef) throw new Error("App not found")

    const env = readEnvSync()
    const apiKey = env[`API_KEY_${appId.toUpperCase()}`]
    if (!apiKey) throw new Error("API key not found - run Extract API Keys first")

    const port = this.config.apps.find((a) => a.id === appId)?.port || appDef.defaultPort
    const apiVersion = appDef.rootFolder?.apiVersion || "v3"
    const qpClient = new QualityProfileClient("localhost", port, apiKey, apiVersion)
    const cfClient = new CustomFormatClient("localhost", port, apiKey, apiVersion)

    if (appId === "lidarr") {
      await cfClient.importCustomFormats(LIDARR_CUSTOM_FORMATS)
    } else {
      const cfCategories = ["unwanted", "misc"]
      if (preset.id.includes("uhd") || preset.id.includes("2160")) {
        cfCategories.push("hdr")
      }
      if (preset.id.includes("remux")) {
        cfCategories.push("audio")
      }
      const cfNames = getCFNamesForCategories(appId as "radarr" | "sonarr", cfCategories)
      const { cfs } = await CustomFormatClient.fetchTRaSHCustomFormats(
        appId as "radarr" | "sonarr",
        cfNames
      )
      await cfClient.importCustomFormats(cfs)
    }

    await qpClient.createTRaSHProfile(
      preset.name,
      preset.cutoffQuality,
      preset.allowedQualities,
      preset.cfScores
    )

    if (appId !== "lidarr") {
      const arrClient = new ArrApiClient("localhost", port, apiKey, apiVersion)
      await arrClient.configureTRaSHNaming(appId as "radarr" | "sonarr")
    }
  }
}
