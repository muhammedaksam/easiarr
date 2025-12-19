/**
 * Recyclarr Setup Screen
 * Configure TRaSH Guides profile sync and trigger manual runs
 */

import type { CliRenderer, KeyEvent } from "@opentui/core"
import { BoxRenderable, TextRenderable, SelectRenderable, SelectRenderableEvents } from "@opentui/core"
import type { EasiarrConfig } from "../../config/schema"
import { saveRecyclarrConfig } from "../../config/recyclarr-config"
import { createPageLayout } from "../components/PageLayout"
import { composeRun } from "../../docker"
import { RADARR_PRESETS, SONARR_PRESETS } from "../../data/trash-profiles"

type ViewMode = "main" | "radarr" | "sonarr" | "sync"

export class RecyclarrSetup extends BoxRenderable {
  private cliRenderer: CliRenderer
  private config: EasiarrConfig
  private onBack: () => void
  private keyHandler: ((key: KeyEvent) => void) | null = null
  private mode: ViewMode = "main"

  // Selected profiles
  private radarrPreset: string = "hd-bluray-web"
  private sonarrPreset: string = "web-1080p-v4"

  // Status
  private statusMessage: string = ""
  private statusColor: string = "#888888"
  private isSyncing: boolean = false

  constructor(renderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(renderer, {
      id: "recyclarr-setup",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    })

    this.cliRenderer = renderer
    this.config = config
    this.onBack = onBack

    this.renderContent()
  }

  private renderContent(): void {
    // Clear previous
    if (this.keyHandler) {
      this.cliRenderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }

    const children = this.getChildren()
    for (const child of children) {
      this.remove(child.id)
    }

    const radarrEnabled = this.config.apps.some((a) => a.id === "radarr" && a.enabled)
    const sonarrEnabled = this.config.apps.some((a) => a.id === "sonarr" && a.enabled)
    const recyclarrEnabled = this.config.apps.some((a) => a.id === "recyclarr" && a.enabled)

    const { container: page, content } = createPageLayout(this.cliRenderer, {
      title: "♻️ Recyclarr Setup",
      stepInfo: "Configure TRaSH Guides profile sync",
      footerHint: [
        { type: "key", key: "Enter", value: "Select" },
        { type: "key", key: "q", value: "Back" },
      ],
    })

    // Status message
    if (this.statusMessage) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          id: "status",
          content: this.statusMessage,
          fg: this.statusColor,
          marginBottom: 1,
        })
      )
    }

    if (!recyclarrEnabled) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: "⚠️ Recyclarr is not enabled. Enable it in App Manager first.",
          fg: "#ff6666",
        })
      )
      this.setupBackHandler(content)
      this.add(page)
      return
    }

    switch (this.mode) {
      case "main":
        this.renderMainMenu(content, radarrEnabled, sonarrEnabled)
        break
      case "radarr":
        this.renderRadarrProfiles(content)
        break
      case "sonarr":
        this.renderSonarrProfiles(content)
        break
      case "sync":
        this.renderSyncView(content)
        break
    }

    this.add(page)
  }

  private renderMainMenu(content: BoxRenderable, radarrEnabled: boolean, sonarrEnabled: boolean): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Recyclarr syncs TRaSH Guides custom formats and quality profiles to your *arr apps.",
        fg: "#888888",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Current config status
    const configBox = new BoxRenderable(this.cliRenderer, {
      width: "100%",
      flexDirection: "column",
      marginBottom: 1,
    })

    if (radarrEnabled) {
      const preset = RADARR_PRESETS.find((p) => p.id === this.radarrPreset)
      configBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `🎬 Radarr: ${preset?.name || "Default"}`,
          fg: "#50fa7b",
        })
      )
    }

    if (sonarrEnabled) {
      const preset = SONARR_PRESETS.find((p) => p.id === this.sonarrPreset)
      configBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `📺 Sonarr: ${preset?.name || "Default"}`,
          fg: "#50fa7b",
        })
      )
    }

    content.add(configBox)
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Menu options
    const options: Array<{ name: string; description: string }> = []

    if (radarrEnabled) {
      options.push({ name: "🎬 Configure Radarr Profile", description: "Select TRaSH Guide profile for movies" })
    }
    if (sonarrEnabled) {
      options.push({ name: "📺 Configure Sonarr Profile", description: "Select TRaSH Guide profile for TV shows" })
    }
    options.push({ name: "🔄 Run Sync Now", description: "Manually trigger Recyclarr sync" })
    options.push({ name: "💾 Save & Generate Config", description: "Save recyclarr.yml configuration" })
    options.push({ name: "◀ Back", description: "Return to main menu" })

    const menu = new SelectRenderable(this.cliRenderer, {
      id: "recyclarr-main-menu",
      width: "100%",
      height: options.length * 2 + 1,
      options,
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      let currentIdx = 0

      if (radarrEnabled) {
        if (index === currentIdx) {
          this.mode = "radarr"
          this.renderContent()
          return
        }
        currentIdx++
      }

      if (sonarrEnabled) {
        if (index === currentIdx) {
          this.mode = "sonarr"
          this.renderContent()
          return
        }
        currentIdx++
      }

      if (index === currentIdx) {
        // Run Sync
        await this.runSync()
        return
      }
      currentIdx++

      if (index === currentIdx) {
        // Save Config
        await this.saveConfig()
        return
      }
      currentIdx++

      // Back
      this.cleanup()
      this.onBack()
    })

    content.add(menu)
    menu.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q" || key.name === "escape") {
        this.cleanup()
        this.onBack()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private renderRadarrProfiles(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Select a TRaSH Guide profile for Radarr (Movies):",
        fg: "#888888",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    const options = RADARR_PRESETS.map((p) => ({
      name: `${this.radarrPreset === p.id ? "● " : "○ "}${p.name}`,
      description: p.description,
    }))
    options.push({ name: "◀ Back", description: "Return to main menu" })

    const menu = new SelectRenderable(this.cliRenderer, {
      id: "radarr-profiles-menu",
      width: "100%",
      height: options.length * 2 + 1,
      options,
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      if (index < RADARR_PRESETS.length) {
        this.radarrPreset = RADARR_PRESETS[index].id
        this.setStatus(`✓ Radarr profile set to: ${RADARR_PRESETS[index].name}`, "#50fa7b")
      }
      this.mode = "main"
      this.renderContent()
    })

    content.add(menu)
    menu.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q" || key.name === "escape") {
        this.mode = "main"
        this.renderContent()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private renderSonarrProfiles(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Select a TRaSH Guide profile for Sonarr (TV Shows):",
        fg: "#888888",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    const options = SONARR_PRESETS.map((p) => ({
      name: `${this.sonarrPreset === p.id ? "● " : "○ "}${p.name}`,
      description: p.description,
    }))
    options.push({ name: "◀ Back", description: "Return to main menu" })

    const menu = new SelectRenderable(this.cliRenderer, {
      id: "sonarr-profiles-menu",
      width: "100%",
      height: options.length * 2 + 1,
      options,
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      if (index < SONARR_PRESETS.length) {
        this.sonarrPreset = SONARR_PRESETS[index].id
        this.setStatus(`✓ Sonarr profile set to: ${SONARR_PRESETS[index].name}`, "#50fa7b")
      }
      this.mode = "main"
      this.renderContent()
    })

    content.add(menu)
    menu.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q" || key.name === "escape") {
        this.mode = "main"
        this.renderContent()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private renderSyncView(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: this.isSyncing ? "⏳ Running Recyclarr sync..." : "Sync complete!",
        fg: this.isSyncing ? "#f1fa8c" : "#50fa7b",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    if (!this.isSyncing) {
      const menu = new SelectRenderable(this.cliRenderer, {
        id: "sync-done-menu",
        width: "100%",
        height: 2,
        options: [{ name: "◀ Back", description: "Return to main menu" }],
      })

      menu.on(SelectRenderableEvents.ITEM_SELECTED, () => {
        this.mode = "main"
        this.renderContent()
      })

      content.add(menu)
      menu.focus()
    }

    this.keyHandler = (key: KeyEvent) => {
      if (!this.isSyncing && (key.name === "q" || key.name === "escape")) {
        this.mode = "main"
        this.renderContent()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private async runSync(): Promise<void> {
    this.isSyncing = true
    this.mode = "sync"
    this.renderContent()

    try {
      // First save the config
      await this.saveConfig()

      // Run recyclarr sync
      const result = await composeRun("recyclarr", "sync")

      if (result.success) {
        this.setStatus("✓ Recyclarr sync completed successfully!", "#50fa7b")
      } else {
        this.setStatus(`⚠ Sync completed with warnings: ${result.output.substring(0, 100)}`, "#f1fa8c")
      }
    } catch (err) {
      this.setStatus(`✗ Sync failed: ${(err as Error).message}`, "#ff5555")
    }

    this.isSyncing = false
    this.mode = "main"
    this.renderContent()
  }

  private async saveConfig(): Promise<void> {
    try {
      await saveRecyclarrConfig(this.config)
      this.setStatus("✓ Recyclarr config saved!", "#50fa7b")
    } catch (err) {
      this.setStatus(`✗ Failed to save config: ${(err as Error).message}`, "#ff5555")
    }
    this.renderContent()
  }

  private setStatus(message: string, color: string): void {
    this.statusMessage = message
    this.statusColor = color
  }

  private setupBackHandler(content: BoxRenderable): void {
    const menu = new SelectRenderable(this.cliRenderer, {
      id: "recyclarr-back-menu",
      width: "100%",
      height: 2,
      options: [{ name: "◀ Back", description: "Return to main menu" }],
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, () => {
      this.cleanup()
      this.onBack()
    })

    content.add(menu)
    menu.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q" || key.name === "escape") {
        this.cleanup()
        this.onBack()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private cleanup(): void {
    if (this.keyHandler) {
      this.cliRenderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }
  }
}
