/**
 * Full Auto Setup Screen
 * Runs all configuration steps in sequence
 */

import { BoxRenderable, CliRenderer, KeyEvent, TextRenderable } from "@opentui/core"

import type { EasiarrConfig } from "~/config/schema"
import { saveCompose } from "~/compose"
import { saveConfig } from "~/config"
import {
  createSetupContext,
  runJellyseerrFullSetup,
  setupArrAuthentication,
  setupArrExternalUrls,
  setupArrNaming,
  setupArrQuality,
  setupArrRootFolders,
  setupBazarr as setupBazarrAction,
  setupBazarrAuthentication,
  setupCloudflare as setupCloudflareAction,
  setupFlareSolverr,
  setupGrafana as setupGrafanaAction,
  setupHeimdall as setupHeimdallAction,
  setupHomarr as setupHomarrAction,
  setupHuntarr as setupHuntarrAction,
  setupJellyfin as setupJellyfinAction,
  setupMaintainerr as setupMaintainerrAction,
  setupOverseerr as setupOverseerrAction,
  setupPlex as setupPlexAction,
  setupPortainer as setupPortainerAction,
  setupProfilarr as setupProfilarrAction,
  setupProwlarrApps,
  setupQBittorrent as setupQBittorrentAction,
  setupRecyclarr as setupRecyclarrAction,
  setupSlskd as setupSlskdAction,
  setupSoularr as setupSoularrAction,
  setupTautulli as setupTautulliAction,
  setupUptimeKuma as setupUptimeKumaAction,
} from "~/setup"
import { createPageLayout } from "~/ui/components/PageLayout"
import { debugLog } from "~/utils/debug"
import { readEnvSync, updateEnv } from "~/utils/env"

interface SetupStep {
  name: string
  status: "pending" | "running" | "success" | "error" | "skipped"
  message?: string
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
    this.globalUsername = this.env["USERNAME_GLOBAL"] || "admin"
    this.globalPassword = this.env["PASSWORD_GLOBAL"] || "Ch4ng3m3!1234securityReasons"

    this.initKeyHandler()
    this.initSteps()
    this.refreshContent()
  }

  private initSteps(): void {
    this.steps = [
      { name: "Root Folders", status: "pending" },
      { name: "Naming Scheme", status: "pending" },
      { name: "Quality Settings", status: "pending" },
      { name: "Authentication", status: "pending" },
      { name: "External URLs", status: "pending" },
      { name: "Prowlarr Apps", status: "pending" },
      { name: "FlareSolverr", status: "pending" },
      { name: "qBittorrent", status: "pending" },
      { name: "Portainer", status: "pending" },
      { name: "Jellyfin", status: "pending" },
      { name: "Jellyseerr", status: "pending" },
      { name: "Plex", status: "pending" },
      { name: "Overseerr", status: "pending" },
      { name: "Tautulli", status: "pending" },
      { name: "Maintainerr", status: "pending" },
      { name: "Bazarr", status: "pending" },
      { name: "Uptime Kuma", status: "pending" },
      { name: "Grafana", status: "pending" },
      { name: "Homarr", status: "pending" },
      { name: "Heimdall", status: "pending" },
      { name: "Huntarr", status: "pending" },
      { name: "Slskd", status: "pending" },
      { name: "Soularr", status: "pending" },
      { name: "Recyclarr", status: "pending" },
      { name: "Profilarr", status: "pending" },
      { name: "Cloudflare Tunnel", status: "pending" },
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

    // Step 2: Naming Scheme
    await this.setupNaming()

    // Step 2b: Quality Settings
    await this.setupQuality()

    // Step 3: Authentication
    await this.setupAuthentication()

    // Step 3: External URLs
    await this.setupExternalUrls()

    // Step 4: Prowlarr apps
    await this.setupProwlarrApps()

    // Step 5: FlareSolverr
    await this.setupFlareSolverr()

    // Step 6: qBittorrent
    await this.setupQBittorrent()

    // Step 7: Portainer
    await this.setupPortainer()

    // Step 8: Jellyfin
    await this.setupJellyfin()

    // Step 9: Jellyseerr
    await this.setupJellyseerr()

    // Step 10: Plex
    await this.setupPlex()

    // Step 11: Overseerr (requires Plex)
    await this.setupOverseerr()

    // Step 12: Tautulli (Plex monitoring)
    await this.setupTautulli()

    // Step 12b: Maintainerr (Plex media management)
    await this.setupMaintainerr()

    // Step 13: Bazarr (subtitles)
    await this.setupBazarr()

    // Step 14: Uptime Kuma (monitors)
    await this.setupUptimeKuma()

    // Step 15: Grafana (dashboards)
    await this.setupGrafana()

    // Step 16: Homarr (dashboard)
    await this.setupHomarr()

    // Step 17: Heimdall (dashboard)
    await this.setupHeimdall()

    // Step 18: Huntarr (*arr app manager)
    await this.setupHuntarr()

    // Step 19: Slskd (Soulseek client)
    await this.setupSlskd()

    // Step 20: Soularr (Lidarr -> Slskd bridge)
    await this.setupSoularr()

    // Step 21: Recyclarr (TRaSH Guides sync)
    await this.setupRecyclarr()

    // Step 22: Profilarr (Alternative TRaSH Guides sync)
    await this.setupProfilarr()

    // Step 22: Cloudflare Tunnel
    await this.setupCloudflare()

    this.isRunning = false
    this.isDone = true
    this.refreshContent()
  }

  private async setupRootFolders(): Promise<void> {
    this.updateStep("Root Folders", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupArrRootFolders(ctx)

    this.updateStep("Root Folders", result.success ? "success" : "error", result.message)
    this.refreshContent()
  }

  private async setupNaming(): Promise<void> {
    this.updateStep("Naming Scheme", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupArrNaming(ctx)

    this.updateStep("Naming Scheme", result.success ? "success" : "error", result.message)
    this.refreshContent()
  }

  private async setupQuality(): Promise<void> {
    this.updateStep("Quality Settings", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupArrQuality(ctx)

    this.updateStep("Quality Settings", result.success ? "success" : "error", result.message)
    this.refreshContent()
  }

  private async setupAuthentication(): Promise<void> {
    this.updateStep("Authentication", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)

    // Setup *arr apps authentication
    const arrResult = await setupArrAuthentication(ctx)

    // Setup Bazarr authentication and connections
    const bazarrResult = await setupBazarrAuthentication(ctx)

    // Determine overall status
    const success = arrResult.success || bazarrResult.success
    const skipped = !arrResult.success && arrResult.message === "No PASSWORD_GLOBAL set"

    if (skipped) {
      this.updateStep("Authentication", "skipped", "No PASSWORD_GLOBAL set")
    } else {
      this.updateStep("Authentication", success ? "success" : "error", arrResult.message)
    }
    this.refreshContent()
  }

  private async setupExternalUrls(): Promise<void> {
    this.updateStep("External URLs", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupArrExternalUrls(ctx)

    if (result.success) {
      this.updateStep("External URLs", "success", result.message)
    } else {
      this.updateStep("External URLs", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupProwlarrApps(): Promise<void> {
    this.updateStep("Prowlarr Apps", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupProwlarrApps(ctx)

    if (result.success) {
      this.updateStep("Prowlarr Apps", "success", result.message)
    } else {
      this.updateStep("Prowlarr Apps", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupFlareSolverr(): Promise<void> {
    this.updateStep("FlareSolverr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupFlareSolverr(ctx)

    if (result.success) {
      this.updateStep("FlareSolverr", "success", result.message)
    } else {
      this.updateStep("FlareSolverr", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupQBittorrent(): Promise<void> {
    this.updateStep("qBittorrent", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupQBittorrentAction(ctx)

    if (result.success) {
      this.updateStep("qBittorrent", "success", result.message)
    } else {
      this.updateStep("qBittorrent", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupPortainer(): Promise<void> {
    this.updateStep("Portainer", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupPortainerAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Portainer", "success", result.message)
    } else {
      this.updateStep("Portainer", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupJellyfin(): Promise<void> {
    this.updateStep("Jellyfin", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupJellyfinAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Jellyfin", "success", result.message)
    } else {
      this.updateStep("Jellyfin", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupJellyseerr(): Promise<void> {
    this.updateStep("Jellyseerr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await runJellyseerrFullSetup(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Jellyseerr", "success", result.message)
    } else {
      this.updateStep("Jellyseerr", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupPlex(): Promise<void> {
    this.updateStep("Plex", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupPlexAction(ctx)

    if (result.success) {
      this.updateStep("Plex", "success", result.message)
    } else {
      this.updateStep("Plex", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupUptimeKuma(): Promise<void> {
    this.updateStep("Uptime Kuma", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupUptimeKumaAction(ctx)

    if (result.success) {
      this.updateStep("Uptime Kuma", "success", result.message)
    } else {
      this.updateStep("Uptime Kuma", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupGrafana(): Promise<void> {
    this.updateStep("Grafana", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupGrafanaAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Grafana", "success", result.message)
    } else {
      this.updateStep("Grafana", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupCloudflare(): Promise<void> {
    this.updateStep("Cloudflare Tunnel", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupCloudflareAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      // Update config if tunnel was created
      if (this.config.traefik && result.envUpdates?.CLOUDFLARE_DNS_ZONE) {
        this.config.traefik.domain = result.envUpdates.CLOUDFLARE_DNS_ZONE
        this.config.traefik.entrypoint = "web"
        this.config.updatedAt = new Date().toISOString()
        await saveConfig(this.config)
        await saveCompose(this.config)
      }
      this.updateStep("Cloudflare Tunnel", "success", result.message)
    } else {
      this.updateStep("Cloudflare Tunnel", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupOverseerr(): Promise<void> {
    this.updateStep("Overseerr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupOverseerrAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Overseerr", "success", result.message)
    } else {
      this.updateStep("Overseerr", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupTautulli(): Promise<void> {
    this.updateStep("Tautulli", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupTautulliAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Tautulli", "success", result.message)
    } else {
      this.updateStep("Tautulli", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupMaintainerr(): Promise<void> {
    this.updateStep("Maintainerr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupMaintainerrAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Maintainerr", "success", result.message)
    } else {
      this.updateStep("Maintainerr", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupBazarr(): Promise<void> {
    this.updateStep("Bazarr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupBazarrAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Bazarr", "success", result.message)
    } else {
      this.updateStep("Bazarr", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupHomarr(): Promise<void> {
    this.updateStep("Homarr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupHomarrAction(ctx)

    if (result.success) {
      this.updateStep("Homarr", "success", result.message)
    } else {
      this.updateStep("Homarr", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupHuntarr(): Promise<void> {
    this.updateStep("Huntarr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupHuntarrAction(ctx)

    if (result.success) {
      this.updateStep("Huntarr", "success", result.message)
    } else {
      this.updateStep("Huntarr", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupHeimdall(): Promise<void> {
    this.updateStep("Heimdall", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupHeimdallAction(ctx)

    if (result.success) {
      this.updateStep("Heimdall", "success", result.message)
    } else {
      this.updateStep("Heimdall", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupSlskd(): Promise<void> {
    this.updateStep("Slskd", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupSlskdAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Slskd", "success", result.message)
    } else {
      this.updateStep("Slskd", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupSoularr(): Promise<void> {
    this.updateStep("Soularr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupSoularrAction(ctx)

    if (result.success) {
      this.updateStep("Soularr", "success", result.message)
    } else {
      this.updateStep("Soularr", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupRecyclarr(): Promise<void> {
    this.updateStep("Recyclarr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupRecyclarrAction(ctx)

    if (result.success) {
      this.updateStep("Recyclarr", "success", result.message)
    } else {
      this.updateStep("Recyclarr", "skipped", result.message)
    }
    this.refreshContent()
  }

  private async setupProfilarr(): Promise<void> {
    this.updateStep("Profilarr", "running")
    this.refreshContent()

    const ctx = createSetupContext(this.config, this.env)
    const result = await setupProfilarrAction(ctx)

    if (result.success) {
      if (result.envUpdates) {
        await updateEnv(result.envUpdates)
        Object.assign(this.env, result.envUpdates)
      }
      this.updateStep("Profilarr", "success", result.message)
    } else {
      this.updateStep("Profilarr", "skipped", result.message)
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
