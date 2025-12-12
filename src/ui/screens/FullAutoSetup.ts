/**
 * Full Auto Setup Screen
 * Runs all configuration steps in sequence
 */

import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import type { EasiarrConfig } from "../../config/schema"
import { ArrApiClient, type AddRootFolderOptions } from "../../api/arr-api"
import { ProwlarrClient, type ArrAppType } from "../../api/prowlarr-api"
import { QBittorrentClient, type QBittorrentCategory } from "../../api/qbittorrent-api"
import { PortainerApiClient } from "../../api/portainer-api"
import { getApp } from "../../apps/registry"
// import type { AppId } from "../../config/schema"
import { getCategoriesForApps } from "../../utils/categories"
import { readEnvSync, updateEnv } from "../../utils/env"
import { debugLog } from "../../utils/debug"

interface SetupStep {
  name: string
  status: "pending" | "running" | "success" | "error" | "skipped"
  message?: string
}

const ARR_APP_TYPES: Record<string, ArrAppType> = {
  radarr: "Radarr",
  sonarr: "Sonarr",
  lidarr: "Lidarr",
  readarr: "Readarr",
}

export class FullAutoSetup extends BoxRenderable {
  private config: EasiarrConfig
  private cliRenderer: CliRenderer
  private onBack: () => void
  private keyHandler!: (key: KeyEvent) => void
  private contentBox!: BoxRenderable
  private pageContainer!: BoxRenderable

  private isRunning = false
  private isDone = false
  private steps: SetupStep[] = []
  private globalUsername = ""
  private globalPassword = ""
  private env: Record<string, string> = {}

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    const { container: pageContainer, content: contentBox } = createPageLayout(cliRenderer, {
      title: "Full Auto Setup",
      stepInfo: "Configure all services automatically",
      footerHint: [
        { type: "key", key: "Enter", value: "Start/Continue" },
        { type: "key", key: "Esc", value: "Back" },
      ],
    })
    super(cliRenderer, { width: "100%", height: "100%" })
    this.add(pageContainer)

    this.config = config
    this.cliRenderer = cliRenderer
    this.onBack = onBack
    this.contentBox = contentBox
    this.pageContainer = pageContainer

    this.env = readEnvSync()
    this.globalUsername = this.env["GLOBAL_USERNAME"] || "admin"
    this.globalPassword = this.env["GLOBAL_PASSWORD"] || ""

    this.initKeyHandler()
    this.initSteps()
    this.refreshContent()
  }

  private initSteps(): void {
    this.steps = [
      { name: "Root Folders", status: "pending" },
      { name: "Authentication", status: "pending" },
      { name: "Prowlarr Apps", status: "pending" },
      { name: "FlareSolverr", status: "pending" },
      { name: "qBittorrent", status: "pending" },
      { name: "Portainer", status: "pending" },
    ]
  }

  private initKeyHandler(): void {
    this.keyHandler = (key: KeyEvent) => {
      debugLog("FullAutoSetup", `Key: ${key.name}, running=${this.isRunning}`)

      if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
        if (!this.isRunning) {
          this.cleanup()
        }
        return
      }

      if (key.name === "return") {
        if (this.isDone) {
          this.cleanup()
        } else if (!this.isRunning) {
          this.runSetup()
        }
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
    debugLog("FullAutoSetup", "Key handler registered")
  }

  private async runSetup(): Promise<void> {
    this.isRunning = true
    this.refreshContent()

    // Step 1: Root folders
    await this.setupRootFolders()

    // Step 2: Authentication
    await this.setupAuthentication()

    // Step 3: Prowlarr apps
    await this.setupProwlarrApps()

    // Step 4: FlareSolverr
    await this.setupFlareSolverr()

    // Step 5: qBittorrent
    await this.setupQBittorrent()

    // Step 6: Portainer
    await this.setupPortainer()

    this.isRunning = false
    this.isDone = true
    this.refreshContent()
  }

  private async setupRootFolders(): Promise<void> {
    this.updateStep("Root Folders", "running")
    this.refreshContent()

    try {
      const arrApps = this.config.apps.filter((a) => {
        const def = getApp(a.id)
        return a.enabled && def?.rootFolder
      })

      for (const app of arrApps) {
        const def = getApp(app.id)
        if (!def?.rootFolder) continue

        const apiKey = this.env[`API_KEY_${app.id.toUpperCase()}`]
        if (!apiKey) continue

        const port = app.port || def.defaultPort
        const client = new ArrApiClient("localhost", port, apiKey, def.rootFolder.apiVersion)

        try {
          const existing = await client.getRootFolders()
          if (existing.length === 0) {
            const options: AddRootFolderOptions = { path: def.rootFolder.path }
            if (app.id === "lidarr") options.name = "Music"
            await client.addRootFolder(options)
          }
        } catch {
          // Skip individual failures
        }
      }

      this.updateStep("Root Folders", "success")
    } catch (e) {
      this.updateStep("Root Folders", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupAuthentication(): Promise<void> {
    this.updateStep("Authentication", "running")
    this.refreshContent()

    if (!this.globalPassword) {
      this.updateStep("Authentication", "skipped", "No GLOBAL_PASSWORD set")
      this.refreshContent()
      return
    }

    try {
      const arrApps = this.config.apps.filter((a) => {
        const def = getApp(a.id)
        return a.enabled && (def?.rootFolder || a.id === "prowlarr")
      })

      for (const app of arrApps) {
        const def = getApp(app.id)
        if (!def) continue

        const apiKey = this.env[`API_KEY_${app.id.toUpperCase()}`]
        if (!apiKey) continue

        const port = app.port || def.defaultPort
        const apiVersion = app.id === "prowlarr" ? "v1" : def.rootFolder?.apiVersion || "v3"
        const client = new ArrApiClient("localhost", port, apiKey, apiVersion)

        try {
          await client.updateHostConfig(this.globalUsername, this.globalPassword, false)
        } catch {
          // Skip individual failures
        }
      }

      this.updateStep("Authentication", "success")
    } catch (e) {
      this.updateStep("Authentication", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupProwlarrApps(): Promise<void> {
    this.updateStep("Prowlarr Apps", "running")
    this.refreshContent()

    const apiKey = this.env["API_KEY_PROWLARR"]
    if (!apiKey) {
      this.updateStep("Prowlarr Apps", "skipped", "No Prowlarr API key")
      this.refreshContent()
      return
    }

    try {
      const prowlarrConfig = this.config.apps.find((a) => a.id === "prowlarr")
      const prowlarrPort = prowlarrConfig?.port || 9696
      const prowlarr = new ProwlarrClient("localhost", prowlarrPort, apiKey)

      const arrApps = this.config.apps.filter((a) => {
        return a.enabled && ARR_APP_TYPES[a.id]
      })

      for (const app of arrApps) {
        const appType = ARR_APP_TYPES[app.id]
        if (!appType) continue

        const appApiKey = this.env[`API_KEY_${app.id.toUpperCase()}`]
        if (!appApiKey) continue

        const def = getApp(app.id)
        const port = app.port || def?.defaultPort || 7878

        try {
          await prowlarr.addArrApp(appType, app.id, port, appApiKey, "prowlarr", prowlarrPort)
        } catch {
          // Skip - may already exist
        }
      }

      // Trigger sync
      try {
        await prowlarr.syncApplications()
      } catch {
        // May fail if no indexers
      }

      this.updateStep("Prowlarr Apps", "success")
    } catch (e) {
      this.updateStep("Prowlarr Apps", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupFlareSolverr(): Promise<void> {
    this.updateStep("FlareSolverr", "running")
    this.refreshContent()

    const apiKey = this.env["API_KEY_PROWLARR"]
    const flaresolverr = this.config.apps.find((a) => a.id === "flaresolverr" && a.enabled)

    if (!apiKey || !flaresolverr) {
      this.updateStep("FlareSolverr", "skipped", "Not enabled or no Prowlarr")
      this.refreshContent()
      return
    }

    try {
      const prowlarrConfig = this.config.apps.find((a) => a.id === "prowlarr")
      const prowlarrPort = prowlarrConfig?.port || 9696
      const prowlarr = new ProwlarrClient("localhost", prowlarrPort, apiKey)

      await prowlarr.configureFlareSolverr("http://flaresolverr:8191")
      this.updateStep("FlareSolverr", "success")
    } catch (e) {
      this.updateStep("FlareSolverr", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupQBittorrent(): Promise<void> {
    this.updateStep("qBittorrent", "running")
    this.refreshContent()

    const qbConfig = this.config.apps.find((a) => a.id === "qbittorrent" && a.enabled)
    if (!qbConfig) {
      this.updateStep("qBittorrent", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const host = "localhost"
      const port = qbConfig.port || 8080
      const user = this.env["QBITTORRENT_USER"] || "admin"
      const pass = this.env["QBITTORRENT_PASSWORD"] || this.env["QBITTORRENT_PASS"] || ""

      if (!pass) {
        this.updateStep("qBittorrent", "skipped", "No QBITTORRENT_PASSWORD in .env")
        this.refreshContent()
        return
      }

      const client = new QBittorrentClient(host, port, user, pass)
      const loggedIn = await client.login()

      if (!loggedIn) {
        this.updateStep("qBittorrent", "error", "Login failed")
        this.refreshContent()
        return
      }

      const enabledApps = this.config.apps.filter((a) => a.enabled).map((a) => a.id)
      const categories: QBittorrentCategory[] = getCategoriesForApps(enabledApps).map((cat) => ({
        name: cat.name,
        savePath: `/data/torrents/${cat.name}`,
      }))

      await client.configureTRaSHCompliant(categories, { user, pass })
      this.updateStep("qBittorrent", "success")
    } catch (e) {
      this.updateStep("qBittorrent", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupPortainer(): Promise<void> {
    this.updateStep("Portainer", "running")
    this.refreshContent()

    const portainerConfig = this.config.apps.find((a) => a.id === "portainer" && a.enabled)
    if (!portainerConfig) {
      this.updateStep("Portainer", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    if (!this.globalPassword) {
      this.updateStep("Portainer", "skipped", "No GLOBAL_PASSWORD set")
      this.refreshContent()
      return
    }

    try {
      const port = portainerConfig.port || 9000
      const client = new PortainerApiClient("localhost", port)

      // Check if we can reach Portainer
      const healthy = await client.isHealthy()
      if (!healthy) {
        this.updateStep("Portainer", "skipped", "Not reachable yet")
        this.refreshContent()
        return
      }

      // Initialize admin user (auto-pads password if needed)
      const result = await client.initializeAdmin(this.globalUsername, this.globalPassword)

      if (result) {
        // Generate API key and save to .env
        const apiKey = await client.generateApiKey(result.actualPassword, "easiarr-api-key")

        const envUpdates: Record<string, string> = {
          API_KEY_PORTAINER: apiKey,
        }

        // Save password if it was padded (different from global)
        if (result.passwordWasPadded) {
          envUpdates.PORTAINER_PASSWORD = result.actualPassword
        }

        await updateEnv(envUpdates)
        this.updateStep("Portainer", "success", "Admin + API key created")
      } else {
        // Already initialized, try to login and get API key if we don't have one
        if (!this.env["API_KEY_PORTAINER"]) {
          try {
            // Use saved Portainer password if available (may have been padded)
            const portainerPassword = this.env["PORTAINER_PASSWORD"] || this.globalPassword
            await client.login(this.globalUsername, portainerPassword)
            const apiKey = await client.generateApiKey(portainerPassword, "easiarr-api-key")
            await updateEnv({ API_KEY_PORTAINER: apiKey })
            this.updateStep("Portainer", "success", "API key generated")
          } catch {
            this.updateStep("Portainer", "skipped", "Already initialized")
          }
        } else {
          this.updateStep("Portainer", "skipped", "Already configured")
        }
      }
    } catch (e) {
      this.updateStep("Portainer", "error", `${e}`)
    }
    this.refreshContent()
  }

  private updateStep(name: string, status: SetupStep["status"], message?: string): void {
    const step = this.steps.find((s) => s.name === name)
    if (step) {
      step.status = status
      step.message = message
    }
  }

  private refreshContent(): void {
    this.contentBox.getChildren().forEach((child) => child.destroy())

    if (!this.isRunning && !this.isDone) {
      // Show intro
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "This will automatically configure:\n\n",
          fg: "#8be9fd",
        })
      )
      this.steps.forEach((step) => {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: `  • ${step.name}\n`,
            fg: "#aaaaaa",
          })
        )
      })
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "\n\nPress Enter to start, Esc to go back.\n",
          fg: "#50fa7b",
        })
      )
    } else {
      // Show progress
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: this.isDone ? "Setup Complete!\n\n" : "Setting up...\n\n",
          fg: this.isDone ? "#50fa7b" : "#f1fa8c",
        })
      )

      this.steps.forEach((step) => {
        let icon = "⏳"
        let color = "#aaaaaa"
        if (step.status === "success") {
          icon = "✅"
          color = "#50fa7b"
        } else if (step.status === "error") {
          icon = "❌"
          color = "#ff5555"
        } else if (step.status === "skipped") {
          icon = "⏭️"
          color = "#6272a4"
        } else if (step.status === "running") {
          icon = "🔄"
          color = "#f1fa8c"
        }

        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: `${icon} ${step.name}`,
            fg: color,
          })
        )
        if (step.message) {
          this.contentBox.add(
            new TextRenderable(this.cliRenderer, {
              content: ` - ${step.message}`,
              fg: "#6272a4",
            })
          )
        }
        this.contentBox.add(new TextRenderable(this.cliRenderer, { content: "\n", fg: "#aaaaaa" }))
      })

      if (this.isDone) {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: "\nPress Enter to go back.\n",
            fg: "#50fa7b",
          })
        )
      }
    }
  }

  private cleanup(): void {
    this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    debugLog("FullAutoSetup", "Key handler removed")
    this.destroy()
    this.onBack()
  }
}
