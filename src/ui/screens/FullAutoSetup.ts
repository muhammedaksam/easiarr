/**
 * Full Auto Setup Screen
 * Runs all configuration steps in sequence
 */

import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import type { EasiarrConfig } from "../../config/schema"
import { ArrApiClient, type AddRootFolderOptions } from "../../api/arr-api"
import { BazarrApiClient } from "../../api/bazarr-api"
import { ProwlarrClient, type ArrAppType } from "../../api/prowlarr-api"
import { QBittorrentClient, type QBittorrentCategory } from "../../api/qbittorrent-api"
import { PortainerApiClient } from "../../api/portainer-api"
import { JellyfinClient } from "../../api/jellyfin-api"
import { JellyseerrClient } from "../../api/jellyseerr-api"
import { CloudflareApi, setupCloudflaredTunnel } from "../../api/cloudflare-api"
import { PlexApiClient } from "../../api/plex-api"
import { UptimeKumaClient } from "../../api/uptime-kuma-api"
import { GrafanaClient } from "../../api/grafana-api"
import { OverseerrClient } from "../../api/overseerr-api"
import { TautulliClient } from "../../api/tautulli-api"
import { HomarrClient } from "../../api/homarr-api"
import { HeimdallClient } from "../../api/heimdall-api"
import { HuntarrClient } from "../../api/huntarr-api"
import { saveConfig } from "../../config"
import { saveCompose } from "../../compose"
import { getApp } from "../../apps/registry"
// import type { AppId } from "../../config/schema"
import { getCategoriesForApps } from "../../utils/categories"
import { readEnvSync, updateEnv } from "../../utils/env"
import { debugLog } from "../../utils/debug"
import { getApplicationUrl } from "../../utils/url-utils"

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
  whisparr: "Whisparr",
  mylar3: "Mylar",
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
      { name: "Bazarr", status: "pending" },
      { name: "Uptime Kuma", status: "pending" },
      { name: "Grafana", status: "pending" },
      { name: "Homarr", status: "pending" },
      { name: "Heimdall", status: "pending" },
      { name: "Huntarr", status: "pending" },
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

    // Step 19: Cloudflare Tunnel
    await this.setupCloudflare()

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

  private async setupNaming(): Promise<void> {
    this.updateStep("Naming Scheme", "running")
    this.refreshContent()

    try {
      const arrApps = this.config.apps.filter((a) => {
        return a.enabled && (a.id === "radarr" || a.id === "sonarr")
      })

      for (const app of arrApps) {
        const apiKey = this.env[`API_KEY_${app.id.toUpperCase()}`]
        if (!apiKey) continue

        const def = getApp(app.id)
        if (!def) continue

        const port = app.port || def.defaultPort
        const client = new ArrApiClient("localhost", port, apiKey, def.rootFolder?.apiVersion || "v3")

        try {
          await client.configureTRaSHNaming(app.id as "radarr" | "sonarr")
          debugLog("FullAutoSetup", `Configured naming for ${app.id}`)
        } catch (e) {
          debugLog("FullAutoSetup", `Failed to configure naming for ${app.id}: ${e}`)
        }
      }

      this.updateStep("Naming Scheme", "success")
    } catch (e) {
      this.updateStep("Naming Scheme", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupAuthentication(): Promise<void> {
    this.updateStep("Authentication", "running")
    this.refreshContent()

    if (!this.globalPassword) {
      this.updateStep("Authentication", "skipped", "No PASSWORD_GLOBAL set")
      this.refreshContent()
      return
    }

    try {
      // Setup *arr apps (Radarr, Sonarr, Lidarr, etc.) with form auth
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

      // Setup Bazarr form authentication and Radarr/Sonarr connections
      const bazarrConfig = this.config.apps.find((a) => a.id === "bazarr" && a.enabled)
      if (bazarrConfig) {
        const bazarrApiKey = this.env["API_KEY_BAZARR"]
        if (bazarrApiKey) {
          const bazarrDef = getApp("bazarr")
          const bazarrPort = bazarrConfig.port || bazarrDef?.defaultPort || 6767
          const bazarrClient = new BazarrApiClient("localhost", bazarrPort)
          bazarrClient.setApiKey(bazarrApiKey)

          try {
            // Enable form auth
            await bazarrClient.enableFormAuth(this.globalUsername, this.globalPassword, false)
          } catch {
            // Skip Bazarr auth failure - non-critical
            debugLog("FullAutoSetup", "Bazarr form auth failed, continuing...")
          }

          // Configure Radarr connection if Radarr is enabled
          // Use container name 'radarr' since Bazarr runs in Docker
          const radarrConfig = this.config.apps.find((a) => a.id === "radarr" && a.enabled)
          const radarrApiKey = this.env["API_KEY_RADARR"]
          if (radarrConfig && radarrApiKey) {
            try {
              const radarrDef = getApp("radarr")
              const radarrPort = radarrConfig.port || radarrDef?.defaultPort || 7878
              await bazarrClient.configureRadarr("radarr", radarrPort, radarrApiKey)
              debugLog("FullAutoSetup", "Bazarr -> Radarr connection configured")
            } catch {
              debugLog("FullAutoSetup", "Failed to configure Bazarr -> Radarr connection")
            }
          }

          // Configure Sonarr connection if Sonarr is enabled
          // Use container name 'sonarr' since Bazarr runs in Docker
          const sonarrConfig = this.config.apps.find((a) => a.id === "sonarr" && a.enabled)
          const sonarrApiKey = this.env["API_KEY_SONARR"]
          if (sonarrConfig && sonarrApiKey) {
            try {
              const sonarrDef = getApp("sonarr")
              const sonarrPort = sonarrConfig.port || sonarrDef?.defaultPort || 8989
              await bazarrClient.configureSonarr("sonarr", sonarrPort, sonarrApiKey)
              debugLog("FullAutoSetup", "Bazarr -> Sonarr connection configured")
            } catch {
              debugLog("FullAutoSetup", "Failed to configure Bazarr -> Sonarr connection")
            }
          }
        }
      }

      this.updateStep("Authentication", "success")
    } catch (e) {
      this.updateStep("Authentication", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupExternalUrls(): Promise<void> {
    this.updateStep("External URLs", "running")
    this.refreshContent()

    let configured = 0

    try {
      // Configure *arr apps (Radarr, Sonarr, Lidarr, Readarr, Whisparr, Prowlarr)
      const arrApps = this.config.apps.filter((a) => {
        const def = getApp(a.id)
        return a.enabled && (def?.rootFolder || a.id === "prowlarr")
      })

      for (const app of arrApps) {
        const def = getApp(app.id)
        if (!def) continue

        const apiKey = this.env[`API_KEY_${app.id.toUpperCase()}`]
        if (!apiKey) {
          continue
        }

        const port = app.port || def.defaultPort
        const apiVersion = app.id === "prowlarr" ? "v1" : def.rootFolder?.apiVersion || "v3"
        const client = new ArrApiClient("localhost", port, apiKey, apiVersion)

        try {
          const applicationUrl = getApplicationUrl(app.id, port, this.config)
          await client.setApplicationUrl(applicationUrl)
          debugLog("FullAutoSetup", `Set applicationUrl for ${app.id}: ${applicationUrl}`)
          configured++
        } catch (e) {
          debugLog("FullAutoSetup", `Failed to set applicationUrl for ${app.id}: ${e}`)
        }
      }

      // Note: Jellyseerr and Overseerr are handled in their own setup steps
      // (setupJellyseerr/setupOverseerr) because they require authentication first

      // Configure Bazarr
      const bazarrConfig = this.config.apps.find((a) => a.id === "bazarr" && a.enabled)
      if (bazarrConfig) {
        const bazarrApiKey = this.env["API_KEY_BAZARR"]
        if (bazarrApiKey) {
          const port = bazarrConfig.port || 6767
          const client = new BazarrApiClient("localhost", port)
          client.setApiKey(bazarrApiKey)

          try {
            const baseUrl = getApplicationUrl("bazarr", port, this.config)
            await client.setBaseUrl(baseUrl)
            debugLog("FullAutoSetup", `Set baseUrl for bazarr: ${baseUrl}`)
            configured++
          } catch (e) {
            debugLog("FullAutoSetup", `Failed to set baseUrl for bazarr: ${e}`)
          }
        }
      }

      if (configured > 0) {
        this.updateStep("External URLs", "success", `${configured} apps configured`)
      } else {
        this.updateStep("External URLs", "skipped", "No apps with API keys")
      }
    } catch (e) {
      this.updateStep("External URLs", "error", `${e}`)
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
      const user = this.env["USERNAME_QBITTORRENT"] || "admin"
      const pass = this.env["PASSWORD_QBITTORRENT"] || this.env["QBITTORRENT_PASS"] || ""

      if (!pass) {
        this.updateStep("qBittorrent", "skipped", "No PASSWORD_QBITTORRENT in .env")
        this.refreshContent()
        return
      }

      const client = new QBittorrentClient(host, port, user, pass)

      const result = await client.setup({
        username: user,
        password: pass,
        env: this.env,
      })

      if (result.success) {
        // Configure categories after basic setup
        const enabledApps = this.config.apps.filter((a) => a.enabled).map((a) => a.id)
        const categories: QBittorrentCategory[] = getCategoriesForApps(enabledApps).map((cat) => ({
          name: cat.name,
          savePath: `/data/torrents/${cat.name}`,
        }))

        await client.configureTRaSHCompliant(categories, { user, pass })
        this.updateStep("qBittorrent", "success", result.message)
      } else {
        this.updateStep("qBittorrent", "error", result.message)
      }
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
      this.updateStep("Portainer", "skipped", "No PASSWORD_GLOBAL set")
      this.refreshContent()
      return
    }

    try {
      const port = portainerConfig.port || 9000
      const client = new PortainerApiClient("localhost", port)

      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        if (result.envUpdates) {
          await updateEnv(result.envUpdates)
          Object.assign(this.env, result.envUpdates)
        }
        this.updateStep("Portainer", "success", result.message)
      } else {
        this.updateStep("Portainer", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Portainer", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupJellyfin(): Promise<void> {
    this.updateStep("Jellyfin", "running")
    this.refreshContent()

    const jellyfinConfig = this.config.apps.find((a) => a.id === "jellyfin" && a.enabled)
    if (!jellyfinConfig) {
      this.updateStep("Jellyfin", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const port = jellyfinConfig.port || 8096
      const client = new JellyfinClient("localhost", port)

      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        if (result.envUpdates) {
          await updateEnv(result.envUpdates)
          Object.assign(this.env, result.envUpdates)
        }
        this.updateStep("Jellyfin", "success", result.message)
      } else {
        this.updateStep("Jellyfin", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Jellyfin", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupJellyseerr(): Promise<void> {
    this.updateStep("Jellyseerr", "running")
    this.refreshContent()

    const jellyseerrConfig = this.config.apps.find((a) => a.id === "jellyseerr" && a.enabled)
    if (!jellyseerrConfig) {
      this.updateStep("Jellyseerr", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    // Check if a media server is enabled
    const jellyfinConfig = this.config.apps.find((a) => a.id === "jellyfin" && a.enabled)
    const plexConfig = this.config.apps.find((a) => a.id === "plex" && a.enabled)

    if (!jellyfinConfig && !plexConfig) {
      this.updateStep("Jellyseerr", "skipped", "No media server enabled")
      this.refreshContent()
      return
    }

    // Jellyseerr only supports Jellyfin automation (Plex requires manual setup)
    if (!jellyfinConfig) {
      this.updateStep("Jellyseerr", "skipped", "Plex requires manual setup")
      this.refreshContent()
      return
    }

    try {
      const port = jellyseerrConfig.port || 5055
      const client = new JellyseerrClient("localhost", port)

      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        if (result.envUpdates) {
          await updateEnv(result.envUpdates)
          Object.assign(this.env, result.envUpdates)
        }

        // Configure Radarr/Sonarr connections after base setup
        const radarrConfig = this.config.apps.find((a) => a.id === "radarr" && a.enabled)
        if (radarrConfig && this.env["API_KEY_RADARR"]) {
          try {
            const radarrDef = getApp("radarr")
            const radarrPort = radarrConfig.port || radarrDef?.defaultPort || 7878
            const radarrExternalUrl = getApplicationUrl("radarr", radarrPort, this.config)
            await client.configureRadarr(
              "radarr",
              radarrPort,
              this.env["API_KEY_RADARR"],
              radarrDef?.rootFolder?.path || "/data/media/movies",
              radarrExternalUrl
            )
            debugLog("FullAutoSetup", `Jellyseerr: Radarr externalUrl set to ${radarrExternalUrl}`)
          } catch {
            /* Radarr config failed */
          }
        }

        const sonarrConfig = this.config.apps.find((a) => a.id === "sonarr" && a.enabled)
        if (sonarrConfig && this.env["API_KEY_SONARR"]) {
          try {
            const sonarrDef = getApp("sonarr")
            const sonarrPort = sonarrConfig.port || sonarrDef?.defaultPort || 8989
            const sonarrExternalUrl = getApplicationUrl("sonarr", sonarrPort, this.config)
            await client.configureSonarr(
              "sonarr",
              sonarrPort,
              this.env["API_KEY_SONARR"],
              sonarrDef?.rootFolder?.path || "/data/media/tv",
              sonarrExternalUrl
            )
            debugLog("FullAutoSetup", `Jellyseerr: Sonarr externalUrl set to ${sonarrExternalUrl}`)
          } catch {
            /* Sonarr config failed */
          }
        }

        // Set Jellyfin's externalHostname for navigation links
        const jellyfinConfig = this.config.apps.find((a) => a.id === "jellyfin" && a.enabled)
        if (jellyfinConfig) {
          try {
            const jellyfinPort = jellyfinConfig.port || 8096
            const jellyfinUrl = getApplicationUrl("jellyfin", jellyfinPort, this.config)
            await client.updateJellyfinSettings({ externalHostname: jellyfinUrl })
            debugLog("FullAutoSetup", `Jellyseerr: Jellyfin externalHostname set to ${jellyfinUrl}`)
          } catch {
            debugLog("FullAutoSetup", "Failed to set Jellyfin externalHostname in Jellyseerr")
          }
        }

        // Set Jellyseerr's own applicationUrl (we're already authenticated from setup)
        try {
          const jellyseerrUrl = getApplicationUrl("jellyseerr", port, this.config)
          await client.setApplicationUrl(jellyseerrUrl)
          debugLog("FullAutoSetup", `Jellyseerr: applicationUrl set to ${jellyseerrUrl}`)
        } catch {
          debugLog("FullAutoSetup", "Failed to set Jellyseerr applicationUrl")
        }

        this.updateStep("Jellyseerr", "success", result.message)
      } else {
        this.updateStep("Jellyseerr", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Jellyseerr", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupPlex(): Promise<void> {
    this.updateStep("Plex", "running")
    this.refreshContent()

    const plexConfig = this.config.apps.find((a) => a.id === "plex" && a.enabled)
    if (!plexConfig) {
      this.updateStep("Plex", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const port = plexConfig.port || 32400
      const client = new PlexApiClient("localhost", port)

      // Check if reachable
      const healthy = await client.isHealthy()
      if (!healthy) {
        this.updateStep("Plex", "skipped", "Not reachable yet")
        this.refreshContent()
        return
      }

      // Run auto-setup
      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        this.updateStep("Plex", "success", result.message)
      } else {
        this.updateStep("Plex", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Plex", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupUptimeKuma(): Promise<void> {
    this.updateStep("Uptime Kuma", "running")
    this.refreshContent()

    const uptimeKumaConfig = this.config.apps.find((a) => a.id === "uptime-kuma" && a.enabled)
    if (!uptimeKumaConfig) {
      this.updateStep("Uptime Kuma", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const port = uptimeKumaConfig.port || 3001
      const client = new UptimeKumaClient("localhost", port)

      // Check if reachable
      const healthy = await client.isHealthy()
      if (!healthy) {
        this.updateStep("Uptime Kuma", "skipped", "Not reachable yet")
        this.refreshContent()
        return
      }

      // Run auto-setup (creates admin or logs in)
      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        // Now add monitors for enabled apps
        try {
          // Re-login since setup disconnects
          const loggedIn = await client.login(this.globalUsername, this.globalPassword)
          if (loggedIn) {
            const addedCount = await client.setupEasiarrMonitors(this.config.apps)
            client.disconnect()
            this.updateStep("Uptime Kuma", "success", `${result.message}, ${addedCount} monitors added`)
          } else {
            client.disconnect()
            this.updateStep("Uptime Kuma", "success", result.message)
          }
        } catch {
          client.disconnect()
          this.updateStep("Uptime Kuma", "success", result.message)
        }
      } else {
        this.updateStep("Uptime Kuma", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Uptime Kuma", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupGrafana(): Promise<void> {
    this.updateStep("Grafana", "running")
    this.refreshContent()

    const grafanaConfig = this.config.apps.find((a) => a.id === "grafana" && a.enabled)
    if (!grafanaConfig) {
      this.updateStep("Grafana", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const port = grafanaConfig.port || 3001
      const client = new GrafanaClient("localhost", port)

      // Check if reachable
      const healthy = await client.isHealthy()
      if (!healthy) {
        this.updateStep("Grafana", "skipped", "Not reachable yet")
        this.refreshContent()
        return
      }

      // Run auto-setup
      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        // Save any env updates (e.g., API key)
        if (result.envUpdates) {
          await updateEnv(result.envUpdates)
          // Update local env cache
          Object.assign(this.env, result.envUpdates)
        }
        this.updateStep("Grafana", "success", result.message)
      } else {
        this.updateStep("Grafana", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Grafana", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupCloudflare(): Promise<void> {
    this.updateStep("Cloudflare Tunnel", "running")
    this.refreshContent()

    const cloudflaredConfig = this.config.apps.find((a) => a.id === "cloudflared" && a.enabled)
    if (!cloudflaredConfig) {
      this.updateStep("Cloudflare Tunnel", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    const apiToken = this.env["CLOUDFLARE_API_TOKEN"]
    if (!apiToken) {
      this.updateStep("Cloudflare Tunnel", "skipped", "No CLOUDFLARE_API_TOKEN in .env")
      this.refreshContent()
      return
    }

    const domain = this.env["CLOUDFLARE_DNS_ZONE"] || this.config.traefik?.domain
    if (!domain) {
      this.updateStep("Cloudflare Tunnel", "skipped", "No domain configured")
      this.refreshContent()
      return
    }

    try {
      // Create/update tunnel
      const result = await setupCloudflaredTunnel(apiToken, domain, "easiarr")

      // Save tunnel token and IDs to .env (IDs needed for Homepage widget)
      await updateEnv({
        CLOUDFLARE_TUNNEL_TOKEN: result.tunnelToken,
        CLOUDFLARE_TUNNEL_ID: result.tunnelId,
        CLOUDFLARE_ACCOUNT_ID: result.accountId,
        CLOUDFLARE_DNS_ZONE: domain,
      })
      Object.assign(this.env, {
        CLOUDFLARE_TUNNEL_ID: result.tunnelId,
        CLOUDFLARE_ACCOUNT_ID: result.accountId,
      })

      // Update config
      if (this.config.traefik) {
        this.config.traefik.domain = domain
        this.config.traefik.entrypoint = "web"
      }
      this.config.updatedAt = new Date().toISOString()
      await saveConfig(this.config)
      await saveCompose(this.config)

      // Optional: Set up Cloudflare Access if email is available
      // Check CLOUDFLARE_ACCESS_EMAIL first, then fall back to EMAIL_GLOBAL
      const accessEmail = this.env["CLOUDFLARE_ACCESS_EMAIL"] || this.env["EMAIL_GLOBAL"]
      if (accessEmail) {
        try {
          const api = new CloudflareApi(apiToken)
          await api.setupAccessProtection(domain, [accessEmail], "easiarr")
          this.updateStep("Cloudflare Tunnel", "success", `Tunnel + Access for ${accessEmail}`)
        } catch {
          // Access setup failed, but tunnel is still working
          this.updateStep("Cloudflare Tunnel", "success", "Tunnel created (Access failed)")
        }
      } else {
        this.updateStep("Cloudflare Tunnel", "success", "Tunnel created")
      }
    } catch (e) {
      this.updateStep("Cloudflare Tunnel", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupOverseerr(): Promise<void> {
    this.updateStep("Overseerr", "running")
    this.refreshContent()

    const overseerrConfig = this.config.apps.find((a) => a.id === "overseerr" && a.enabled)
    if (!overseerrConfig) {
      this.updateStep("Overseerr", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    // Overseerr requires Plex
    const plexConfig = this.config.apps.find((a) => a.id === "plex" && a.enabled)
    if (!plexConfig) {
      this.updateStep("Overseerr", "skipped", "Plex not enabled")
      this.refreshContent()
      return
    }

    const plexToken = this.env["PLEX_TOKEN"]
    if (!plexToken) {
      this.updateStep("Overseerr", "skipped", "No PLEX_TOKEN in .env")
      this.refreshContent()
      return
    }

    try {
      const port = overseerrConfig.port || 5055
      const client = new OverseerrClient("localhost", port)

      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
        plexToken,
      })

      if (result.success) {
        if (result.envUpdates) {
          await updateEnv(result.envUpdates)
          Object.assign(this.env, result.envUpdates)
        }

        // Set Overseerr's applicationUrl (we're already authenticated from setup)
        try {
          const overseerrUrl = getApplicationUrl("overseerr", port, this.config)
          await client.setApplicationUrl(overseerrUrl)
          debugLog("FullAutoSetup", `Overseerr: applicationUrl set to ${overseerrUrl}`)
        } catch {
          debugLog("FullAutoSetup", "Failed to set Overseerr applicationUrl")
        }

        this.updateStep("Overseerr", "success", result.message)
      } else {
        this.updateStep("Overseerr", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Overseerr", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupTautulli(): Promise<void> {
    this.updateStep("Tautulli", "running")
    this.refreshContent()

    const tautulliConfig = this.config.apps.find((a) => a.id === "tautulli" && a.enabled)
    if (!tautulliConfig) {
      this.updateStep("Tautulli", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const port = tautulliConfig.port || 8181
      const client = new TautulliClient("localhost", port)

      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        if (result.envUpdates) {
          await updateEnv(result.envUpdates)
          Object.assign(this.env, result.envUpdates)
        }
        // Check if wizard still needed
        const requiresWizard = result.data?.requiresWizard
        const msg = requiresWizard ? `${result.message} (manual Plex setup needed)` : result.message
        this.updateStep("Tautulli", "success", msg)
      } else {
        this.updateStep("Tautulli", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Tautulli", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupBazarr(): Promise<void> {
    this.updateStep("Bazarr", "running")
    this.refreshContent()

    const bazarrConfig = this.config.apps.find((a) => a.id === "bazarr" && a.enabled)
    if (!bazarrConfig) {
      this.updateStep("Bazarr", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const port = bazarrConfig.port || 6767
      const client = new BazarrApiClient("localhost", port)

      // Get and set API key if available
      const existingApiKey = this.env["API_KEY_BAZARR"]
      if (existingApiKey) {
        client.setApiKey(existingApiKey)
      }

      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        if (result.envUpdates) {
          await updateEnv(result.envUpdates)
          Object.assign(this.env, result.envUpdates)
        }

        // Configure Radarr/Sonarr connections
        let configured = 0
        const radarrConfig = this.config.apps.find((a) => a.id === "radarr" && a.enabled)
        if (radarrConfig && this.env["API_KEY_RADARR"]) {
          try {
            await client.configureRadarr("radarr", radarrConfig.port || 7878, this.env["API_KEY_RADARR"])
            configured++
          } catch {
            /* connection failed */
          }
        }

        const sonarrConfig = this.config.apps.find((a) => a.id === "sonarr" && a.enabled)
        if (sonarrConfig && this.env["API_KEY_SONARR"]) {
          try {
            await client.configureSonarr("sonarr", sonarrConfig.port || 8989, this.env["API_KEY_SONARR"])
            configured++
          } catch {
            /* connection failed */
          }
        }

        this.updateStep("Bazarr", "success", configured > 0 ? `${configured} apps connected` : result.message)
      } else {
        this.updateStep("Bazarr", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Bazarr", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupHomarr(): Promise<void> {
    this.updateStep("Homarr", "running")
    this.refreshContent()

    const homarrConfig = this.config.apps.find((a) => a.id === "homarr" && a.enabled)
    if (!homarrConfig) {
      this.updateStep("Homarr", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const port = homarrConfig.port || 7575
      const client = new HomarrClient("localhost", port)

      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        // Add enabled apps to Homarr dashboard
        try {
          const addedCount = await client.setupEasiarrApps(this.config.apps)
          this.updateStep("Homarr", "success", `${result.message}, ${addedCount} apps added`)
        } catch {
          this.updateStep("Homarr", "success", result.message)
        }
      } else {
        this.updateStep("Homarr", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Homarr", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupHuntarr(): Promise<void> {
    this.updateStep("Huntarr", "running")
    this.refreshContent()

    const huntarrConfig = this.config.apps.find((a) => a.id === "huntarr" && a.enabled)
    if (!huntarrConfig) {
      this.updateStep("Huntarr", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const port = huntarrConfig.port || 9705
      const client = new HuntarrClient("localhost", port)

      // Check if reachable
      const healthy = await client.isHealthy()
      if (!healthy) {
        this.updateStep("Huntarr", "skipped", "Not reachable yet")
        this.refreshContent()
        return
      }

      // Authenticate (creates user if needed, otherwise logs in)
      const authenticated = await client.authenticate(this.globalUsername, this.globalPassword)
      if (!authenticated) {
        this.updateStep("Huntarr", "skipped", "Auth failed")
        this.refreshContent()
        return
      }

      // Add enabled *arr apps to Huntarr
      try {
        const result = await client.setupEasiarrApps(this.config.apps, this.env)
        this.updateStep("Huntarr", "success", `${result.added} *arr apps added`)
      } catch {
        this.updateStep("Huntarr", "success", "Ready")
      }
    } catch (e) {
      this.updateStep("Huntarr", "error", `${e}`)
    }
    this.refreshContent()
  }

  private async setupHeimdall(): Promise<void> {
    this.updateStep("Heimdall", "running")
    this.refreshContent()

    const heimdallConfig = this.config.apps.find((a) => a.id === "heimdall" && a.enabled)
    if (!heimdallConfig) {
      this.updateStep("Heimdall", "skipped", "Not enabled")
      this.refreshContent()
      return
    }

    try {
      const port = heimdallConfig.port || 8090
      const client = new HeimdallClient("localhost", port)

      const result = await client.setup({
        username: this.globalUsername,
        password: this.globalPassword,
        env: this.env,
      })

      if (result.success) {
        // Add enabled apps to Heimdall dashboard
        try {
          const addedCount = await client.setupEasiarrApps(this.config.apps)
          this.updateStep("Heimdall", "success", `${result.message}, ${addedCount} apps added`)
        } catch {
          this.updateStep("Heimdall", "success", result.message)
        }
      } else {
        this.updateStep("Heimdall", "skipped", result.message)
      }
    } catch (e) {
      this.updateStep("Heimdall", "error", `${e}`)
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
