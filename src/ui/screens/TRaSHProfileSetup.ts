/**
 * TRaSH Profile Setup Screen
 * Allows users to configure TRaSH-recommended quality profiles and custom formats
 */

import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig, AppId } from "../../config/schema"
import { getApp } from "../../apps/registry"
import { QualityProfileClient } from "../../api/quality-profile-api"
import { CustomFormatClient, getCFNamesForCategories } from "../../api/custom-format-api"
import { getPresetsForApp, TRaSHProfilePreset } from "../../data/trash-profiles"
import { readEnvSync } from "../../utils/env"
import { debugLog } from "../../utils/debug"

interface SetupResult {
  appId: AppId
  appName: string
  profile: string
  cfCount: number
  status: "pending" | "configuring" | "success" | "error"
  message?: string
}

type Step = "select-apps" | "select-profiles" | "importing" | "done"

export class TRaSHProfileSetup extends BoxRenderable {
  private config: EasiarrConfig
  private cliRenderer: CliRenderer
  private onBack: () => void
  private keyHandler!: (key: KeyEvent) => void
  private results: SetupResult[] = []
  private currentStep: Step = "select-apps"
  private contentBox!: BoxRenderable
  private pageContainer!: BoxRenderable

  // Selected apps and profiles
  private selectedApps: Map<AppId, boolean> = new Map()
  private selectedProfiles: Map<AppId, string> = new Map()
  private currentIndex = 0
  private availableApps: AppId[] = []

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    const { container: pageContainer, content: contentBox } = createPageLayout(cliRenderer, {
      title: "TRaSH Guide Setup",
      stepInfo: "Configure quality profiles and custom formats",
      footerHint: "↑↓ Navigate  Space Select  Enter Confirm  Esc Back",
    })
    super(cliRenderer, { width: "100%", height: "100%" })
    this.add(pageContainer)

    this.config = config
    this.cliRenderer = cliRenderer
    this.onBack = onBack
    this.contentBox = contentBox
    this.pageContainer = pageContainer

    // Get enabled *arr apps that support quality profiles
    this.availableApps = config.apps.filter((a) => a.enabled && ["radarr", "sonarr"].includes(a.id)).map((a) => a.id)

    // Initialize selections
    this.availableApps.forEach((id) => {
      this.selectedApps.set(id, true)
      const presets = getPresetsForApp(id as "radarr" | "sonarr")
      if (presets.length > 0) {
        this.selectedProfiles.set(id, presets[0].id)
      }
    })

    this.initKeyHandler()
    this.refreshContent()
  }

  private initKeyHandler(): void {
    this.keyHandler = (key: KeyEvent) => {
      debugLog(
        "TRaSH",
        `Key pressed: name=${key.name}, ctrl=${key.ctrl}, step=${this.currentStep}, index=${this.currentIndex}`
      )

      if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
        this.cleanup()
        return
      }

      switch (this.currentStep) {
        case "select-apps":
          this.handleSelectAppsKeys(key)
          break
        case "select-profiles":
          this.handleSelectProfilesKeys(key)
          break
        case "done":
          if (key.name === "return" || key.name === "escape") {
            this.cleanup()
          }
          break
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
    debugLog("TRaSH", `Key handler registered, availableApps=${this.availableApps.join(",")}`)
  }

  private handleSelectAppsKeys(key: KeyEvent): void {
    const apps = this.availableApps

    if (key.name === "up" && this.currentIndex > 0) {
      debugLog("TRaSH", `Moving up from ${this.currentIndex} to ${this.currentIndex - 1}`)
      this.currentIndex--
      this.refreshContent()
    } else if (key.name === "down" && this.currentIndex < apps.length - 1) {
      debugLog("TRaSH", `Moving down from ${this.currentIndex} to ${this.currentIndex + 1}, apps.length=${apps.length}`)
      this.currentIndex++
      this.refreshContent()
    } else if (key.name === "space") {
      const app = apps[this.currentIndex]
      this.selectedApps.set(app, !this.selectedApps.get(app))
      this.refreshContent()
    } else if (key.name === "return") {
      const hasSelected = Array.from(this.selectedApps.values()).some((v) => v)
      if (hasSelected) {
        this.currentStep = "select-profiles"
        this.currentIndex = 0
        this.refreshContent()
      }
    }
  }

  private handleSelectProfilesKeys(key: KeyEvent): void {
    const selectedAppIds = this.availableApps.filter((id) => this.selectedApps.get(id))
    const app = selectedAppIds[this.currentIndex]
    const presets = getPresetsForApp(app as "radarr" | "sonarr")

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
      this.currentStep = "select-apps"
      this.currentIndex = 0
      this.refreshContent()
    }
  }

  private async startImport(): Promise<void> {
    this.currentStep = "importing"
    this.results = []

    const selectedAppIds = this.availableApps.filter((id) => this.selectedApps.get(id))

    for (const appId of selectedAppIds) {
      const appDef = getApp(appId)
      const profileId = this.selectedProfiles.get(appId)
      const preset = getPresetsForApp(appId as "radarr" | "sonarr").find((p) => p.id === profileId)

      if (!appDef || !preset) continue

      this.results.push({
        appId,
        appName: appDef.name,
        profile: preset.name,
        cfCount: 0,
        status: "configuring",
      })
      this.refreshContent()

      try {
        await this.configureApp(appId, preset)
        const result = this.results.find((r) => r.appId === appId)
        if (result) {
          result.status = "success"
          result.cfCount = Object.keys(preset.cfScores).length
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
    const qpClient = new QualityProfileClient("localhost", port, apiKey)
    const cfClient = new CustomFormatClient("localhost", port, apiKey)

    // Import Custom Formats first
    const cfCategories = ["unwanted", "misc"]
    if (preset.id.includes("uhd") || preset.id.includes("2160")) {
      cfCategories.push("hdr")
    }
    if (preset.id.includes("remux")) {
      cfCategories.push("audio")
    }

    const cfNames = getCFNamesForCategories(appId as "radarr" | "sonarr", cfCategories)
    const { cfs } = await CustomFormatClient.fetchTRaSHCustomFormats(appId as "radarr" | "sonarr", cfNames)
    await cfClient.importCustomFormats(cfs)

    // Create quality profile
    await qpClient.createTRaSHProfile(preset.name, preset.cutoffQuality, preset.allowedQualities, preset.cfScores)
  }

  private refreshContent(): void {
    // Clear content
    this.contentBox.getChildren().forEach((child) => child.destroy())

    switch (this.currentStep) {
      case "select-apps":
        this.renderSelectApps()
        break
      case "select-profiles":
        this.renderSelectProfiles()
        break
      case "importing":
      case "done":
        this.renderResults()
        break
    }
  }

  private renderSelectApps(): void {
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "Select apps to configure with TRaSH profiles:\n(Space to toggle, Enter to continue)\n\n",
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
        content: "Select quality profile for each app:\n(↑↓ change profile, Tab next app, Enter apply)\n\n",
        fg: "#aaaaaa",
      })
    )

    selectedAppIds.forEach((appId, appIdx) => {
      const app = getApp(appId)
      const presets = getPresetsForApp(appId as "radarr" | "sonarr")
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

  private renderResults(): void {
    const headerText = this.currentStep === "done" ? "✓ Configuration Complete!\n\n" : "Configuring...\n\n"
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
        content += ` (${result.cfCount} CF scores)`
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

  private cleanup(): void {
    this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    this.destroy()
    this.onBack()
  }
}
