/**
 * Jellyseerr Setup Screen
 * Automates the Jellyseerr setup wizard via API
 */

import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig } from "../../config/schema"
import { JellyseerrClient } from "../../api/jellyseerr-api"
import { getApp } from "../../apps/registry"
import { readEnvSync, writeEnvSync } from "../../utils/env"
import { debugLog } from "../../utils/debug"

interface SetupResult {
  name: string
  status: "pending" | "configuring" | "success" | "error" | "skipped"
  message?: string
}

type Step = "menu" | "running" | "done"

export class JellyseerrSetup extends BoxRenderable {
  private config: EasiarrConfig
  private cliRenderer: CliRenderer
  private onBack: () => void
  private keyHandler!: (key: KeyEvent) => void
  private results: SetupResult[] = []
  private currentStep: Step = "menu"
  private contentBox!: BoxRenderable
  private menuIndex = 0
  private jellyseerrClient: JellyseerrClient | null = null
  private mediaServerType: "jellyfin" | "plex" | "emby" | null = null

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    const { container: pageContainer, content: contentBox } = createPageLayout(cliRenderer, {
      title: "Jellyseerr Setup",
      stepInfo: "Configure Jellyseerr via API",
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

    this.initClient()
    this.detectMediaServer()
    this.initKeyHandler()
    this.refreshContent()
  }

  private initClient(): void {
    const jellyseerrConfig = this.config.apps.find((a) => a.id === "jellyseerr")
    if (jellyseerrConfig?.enabled) {
      const port = jellyseerrConfig.port || 5055
      this.jellyseerrClient = new JellyseerrClient("localhost", port)
    }
  }

  private detectMediaServer(): void {
    // Check which media server is enabled
    const jellyfin = this.config.apps.find((a) => a.id === "jellyfin" && a.enabled)
    const plex = this.config.apps.find((a) => a.id === "plex" && a.enabled)

    if (jellyfin) this.mediaServerType = "jellyfin"
    else if (plex) this.mediaServerType = "plex"
  }

  private initKeyHandler(): void {
    this.keyHandler = (key: KeyEvent) => {
      debugLog("Jellyseerr", `Key: ${key.name}, step=${this.currentStep}`)

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
    debugLog("Jellyseerr", "Key handler registered")
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
        description: "Configure media server and create admin user",
        action: () => this.runSetupWizard(),
      },
      {
        name: "📚 Sync Libraries",
        description: "Sync and enable libraries from media server",
        action: () => this.syncLibraries(),
      },
      {
        name: "🔗 Configure Radarr/Sonarr",
        description: "Connect *arr apps for request automation",
        action: () => this.configureArrApps(),
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
    if (!this.jellyseerrClient) {
      this.results = [{ name: "Jellyseerr", status: "error", message: "Not enabled in config" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    if (!this.mediaServerType) {
      this.results = [{ name: "Media Server", status: "error", message: "No media server enabled" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = [
      { name: "Check status", status: "configuring" },
      { name: "Authenticate", status: "pending" },
      { name: "Configure media server", status: "pending" },
      { name: "Sync libraries", status: "pending" },
      { name: "Save API key", status: "pending" },
    ]
    this.refreshContent()

    try {
      // Step 1: Check if already initialized
      const isInit = await this.jellyseerrClient.isInitialized()
      if (isInit) {
        this.results[0].status = "skipped"
        this.results[0].message = "Already initialized"
        this.results.slice(1).forEach((r) => {
          r.status = "skipped"
          r.message = "Setup already complete"
        })
        this.currentStep = "done"
        this.refreshContent()
        return
      }
      this.results[0].status = "success"
      this.results[0].message = "Setup needed"
      this.refreshContent()

      // Get credentials
      const env = readEnvSync()
      const username = env["USERNAME_GLOBAL"] || "admin"
      const password = env["PASSWORD_GLOBAL"] || "Ch4ng3m3!1234securityReasons"

      if (this.mediaServerType === "jellyfin") {
        const jellyfinDef = getApp("jellyfin")
        // Use internal port for container-to-container communication (always 8096)
        const internalPort = jellyfinDef?.internalPort || jellyfinDef?.defaultPort || 8096
        const jellyfinHost = "jellyfin" // Hostname only for auth
        const jellyfinFullUrl = `http://${jellyfinHost}:${internalPort}` // Full URL for settings
        const userEmail = `${username}@easiarr.local`

        debugLog("Jellyseerr", `Connecting to Jellyfin at ${jellyfinFullUrl}`)

        try {
          // Step 2: Authenticate FIRST (creates admin user AND gets session cookie)
          this.results[1].status = "configuring"
          this.refreshContent()
          // Auth endpoint constructs URL: http://{hostname}:{port}
          await this.jellyseerrClient.authenticateJellyfin(username, password, jellyfinHost, internalPort, userEmail)
          this.results[1].status = "success"
          this.results[1].message = `User: ${username}`
          this.refreshContent()

          // Step 3: Configure media server (now we have the session cookie)
          this.results[2].status = "configuring"
          this.refreshContent()
          await this.jellyseerrClient.updateJellyfinSettings({
            hostname: jellyfinFullUrl,
            adminUser: username,
            adminPass: password,
          })
          this.results[2].status = "success"
          this.results[2].message = `Jellyfin @ ${jellyfinHost}`
          this.refreshContent()
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error))
          debugLog("Jellyseerr", `Auth failed: ${err.message}`)
          this.results[1].status = "error"
          this.results[1].message = "Auth Failed"

          if (err.message.includes("NO_ADMIN_USER")) {
            this.results[2].message = "Jellyfin user not Admin"
            this.results[2].status = "error"
            // Wait for user to read the message
            await new Promise((resolve) => setTimeout(resolve, 8000))
          } else if (err.message.includes("401")) {
            this.results[2].message = "Invalid Credentials"
            this.results[2].status = "error"
            await new Promise((resolve) => setTimeout(resolve, 8000))
          } else {
            this.results[2].message = "Connection Error"
            this.results[2].status = "error"
            await new Promise((resolve) => setTimeout(resolve, 5000))
          }
          throw err // Re-throw to stop the wizard
        }
      } else {
        // Plex/Emby - skip for now, needs token-based auth
        this.results[1].status = "skipped"
        this.results[1].message = "Token auth needed"
        this.results[2].status = "skipped"
        this.results[2].message = `${this.mediaServerType} requires manual setup`
        this.refreshContent()
      }

      // Step 4: Sync libraries
      this.results[3].status = "configuring"
      this.refreshContent()
      try {
        const libraries = await this.jellyseerrClient.syncJellyfinLibraries()
        const libraryIds = libraries.map((lib) => lib.id)
        if (libraryIds.length > 0) {
          await this.jellyseerrClient.enableLibraries(libraryIds)
        }
        this.results[3].status = "success"
        this.results[3].message = `${libraries.length} libraries synced`
      } catch {
        this.results[3].status = "error"
        this.results[3].message = "Library sync failed"
      }
      this.refreshContent()

      // Step 5: Save API key
      this.results[4].status = "configuring"
      this.refreshContent()
      try {
        const mainSettings = await this.jellyseerrClient.getMainSettings()
        if (mainSettings.apiKey) {
          env["API_KEY_JELLYSEERR"] = mainSettings.apiKey
          writeEnvSync(env)
          this.results[4].status = "success"
          this.results[4].message = `Key: ${mainSettings.apiKey.substring(0, 8)}...`
        } else {
          this.results[4].status = "error"
          this.results[4].message = "No API key returned"
        }
      } catch {
        this.results[4].status = "error"
        this.results[4].message = "Failed to get API key"
      }
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

  private async syncLibraries(): Promise<void> {
    if (!this.jellyseerrClient) {
      this.results = [{ name: "Jellyseerr", status: "error", message: "Not enabled" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = [
      { name: "Sync libraries", status: "configuring" },
      { name: "Enable all", status: "pending" },
    ]
    this.refreshContent()

    try {
      const libraries = await this.jellyseerrClient.syncJellyfinLibraries()
      this.results[0].status = "success"
      this.results[0].message = `Found ${libraries.length} libraries`
      this.refreshContent()

      this.results[1].status = "configuring"
      this.refreshContent()
      const libraryIds = libraries.map((lib) => lib.id)
      if (libraryIds.length > 0) {
        await this.jellyseerrClient.enableLibraries(libraryIds)
      }
      this.results[1].status = "success"
      this.results[1].message = libraries.map((l) => l.name).join(", ")
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

  private async configureArrApps(): Promise<void> {
    if (!this.jellyseerrClient) {
      this.results = [{ name: "Jellyseerr", status: "error", message: "Not enabled" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = []

    const env = readEnvSync()

    // Check for Radarr
    const radarrConfig = this.config.apps.find((a) => a.id === "radarr" && a.enabled)
    if (radarrConfig) {
      this.results.push({ name: "Radarr", status: "pending" })
    }

    // Check for Sonarr
    const sonarrConfig = this.config.apps.find((a) => a.id === "sonarr" && a.enabled)
    if (sonarrConfig) {
      this.results.push({ name: "Sonarr", status: "pending" })
    }

    if (this.results.length === 0) {
      this.results = [{ name: "No *arr apps", status: "skipped", message: "Enable Radarr/Sonarr first" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.refreshContent()

    // Configure Radarr
    if (radarrConfig) {
      const idx = this.results.findIndex((r) => r.name === "Radarr")
      this.results[idx].status = "configuring"
      this.refreshContent()

      const apiKey = env["API_KEY_RADARR"]
      if (!apiKey) {
        this.results[idx].status = "error"
        this.results[idx].message = "No API key in .env"
      } else {
        try {
          const radarrDef = getApp("radarr")
          const port = radarrConfig.port || radarrDef?.defaultPort || 7878
          const rootFolder = radarrDef?.rootFolder?.path || "/data/media/movies"

          const result = await this.jellyseerrClient.configureRadarr("radarr", port, apiKey, rootFolder)
          if (result) {
            this.results[idx].status = "success"
            this.results[idx].message = `Profile: ${result.activeProfileName}`
          } else {
            this.results[idx].status = "error"
            this.results[idx].message = "Configuration failed"
          }
        } catch (e) {
          this.results[idx].status = "error"
          this.results[idx].message = e instanceof Error ? e.message : String(e)
        }
      }
      this.refreshContent()
    }

    // Configure Sonarr
    if (sonarrConfig) {
      const idx = this.results.findIndex((r) => r.name === "Sonarr")
      this.results[idx].status = "configuring"
      this.refreshContent()

      const apiKey = env["API_KEY_SONARR"]
      if (!apiKey) {
        this.results[idx].status = "error"
        this.results[idx].message = "No API key in .env"
      } else {
        try {
          const sonarrDef = getApp("sonarr")
          const port = sonarrConfig.port || sonarrDef?.defaultPort || 8989
          const rootFolder = sonarrDef?.rootFolder?.path || "/data/media/tv"

          const result = await this.jellyseerrClient.configureSonarr("sonarr", port, apiKey, rootFolder)
          if (result) {
            this.results[idx].status = "success"
            this.results[idx].message = `Profile: ${result.activeProfileName}`
          } else {
            this.results[idx].status = "error"
            this.results[idx].message = "Configuration failed"
          }
        } catch (e) {
          this.results[idx].status = "error"
          this.results[idx].message = e instanceof Error ? e.message : String(e)
        }
      }
      this.refreshContent()
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
    // Show status
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
    if (!this.jellyseerrClient) {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "⚠️ Jellyseerr not enabled in config!\n\n",
          fg: "#ff5555",
        })
      )
      return
    }

    if (!this.mediaServerType) {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "⚠️ No media server enabled (Jellyfin/Plex/Emby)\n\n",
          fg: "#ff5555",
        })
      )
      return
    }

    try {
      const isHealthy = await this.jellyseerrClient.isHealthy()
      const isInit = isHealthy ? await this.jellyseerrClient.isInitialized() : false

      if (!isHealthy) {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: "⚠️ Jellyseerr is not reachable. Make sure the container is running.\n\n",
            fg: "#ffb86c",
          })
        )
      } else if (!isInit) {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: `✨ Jellyseerr needs setup. Will connect to ${this.mediaServerType}.\n\n`,
            fg: "#50fa7b",
          })
        )
      } else {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: "✓ Jellyseerr is running and configured.\n\n",
            fg: "#50fa7b",
          })
        )
      }
    } catch {
      // Ignore
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
