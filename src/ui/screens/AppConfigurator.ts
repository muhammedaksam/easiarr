/**
 * App Configurator Screen
 * Configures *arr apps via API - sets root folders and download clients
 */

import {
  BoxRenderable,
  CliRenderer,
  TextRenderable,
  InputRenderable,
  InputRenderableEvents,
  KeyEvent,
} from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig, AppId } from "../../config/schema"
import { getApp } from "../../apps/registry"
import { ArrApiClient, createQBittorrentConfig, createSABnzbdConfig } from "../../api/arr-api"
import { QBittorrentClient } from "../../api/qbittorrent-api"
import { getCategoriesForApps } from "../../utils/categories"
import { readEnvSync, updateEnv } from "../../utils/env"

interface ConfigResult {
  appId: AppId
  appName: string
  status: "pending" | "configuring" | "success" | "error" | "skipped"
  message?: string
}

type Step = "credentials" | "configure" | "qbittorrent" | "sabnzbd" | "done"

export class AppConfigurator extends BoxRenderable {
  private config: EasiarrConfig
  private cliRenderer: CliRenderer
  private keyHandler!: (key: KeyEvent) => void
  private results: ConfigResult[] = []
  private currentStep: Step = "credentials"
  private contentBox!: BoxRenderable
  private pageContainer!: BoxRenderable

  // Global *arr credentials
  private globalUsername = "admin"
  private globalPassword = ""
  private overrideExisting = false

  // Download client credentials
  private qbHost = "qbittorrent"
  private qbPort = 8080
  private qbUser = "admin"
  private qbPass = ""
  private sabHost = "sabnzbd"
  private sabPort = 8080
  private sabApiKey = ""

  // Check which download clients are enabled
  private hasQBittorrent = false
  private hasSABnzbd = false

  constructor(
    renderer: CliRenderer,
    config: EasiarrConfig,
    private onBack: () => void
  ) {
    super(renderer, {
      id: "app-configurator",
      width: "100%",
      height: "100%",
      backgroundColor: "#111111",
      zIndex: 200,
    })
    this.cliRenderer = renderer
    this.config = config

    // Check enabled download clients
    this.hasQBittorrent = config.apps.some((a) => a.id === "qbittorrent" && a.enabled)
    this.hasSABnzbd = config.apps.some((a) => a.id === "sabnzbd" && a.enabled)

    // Load saved credentials from .env
    this.loadSavedCredentials()

    // Start with credentials prompt
    this.renderCredentialsPrompt()
  }

  private loadSavedCredentials() {
    const env = readEnvSync()
    if (env.GLOBAL_USERNAME) this.globalUsername = env.GLOBAL_USERNAME
    if (env.GLOBAL_PASSWORD) this.globalPassword = env.GLOBAL_PASSWORD
    if (env.QBITTORRENT_PASSWORD) this.qbPass = env.QBITTORRENT_PASSWORD
    if (env.SABNZBD_API_KEY) this.sabApiKey = env.SABNZBD_API_KEY
  }

  private renderCredentialsPrompt() {
    this.clear()

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "Configure Apps",
      stepInfo: "Global Credentials",
      footerHint: "Tab Cycle Fields/Shortcuts  O Override  Enter Continue  Esc Skip",
    })
    this.pageContainer = container
    this.add(container)

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Set a global username/password for all *arr applications:\n",
        fg: "#4a9eff",
      })
    )

    // Username input
    content.add(new TextRenderable(this.cliRenderer, { content: "Username:", fg: "#aaaaaa" }))
    const userInput = new InputRenderable(this.cliRenderer, {
      id: "global-user-input",
      width: 30,
      placeholder: "admin",
      value: this.globalUsername,
      focusedBackgroundColor: "#1a1a1a",
    })
    content.add(userInput)

    content.add(new BoxRenderable(this.cliRenderer, { width: 1, height: 1 })) // Spacer

    // Password input
    content.add(new TextRenderable(this.cliRenderer, { content: "Password:", fg: "#aaaaaa" }))
    const passInput = new InputRenderable(this.cliRenderer, {
      id: "global-pass-input",
      width: 30,
      placeholder: "Enter password",
      value: this.globalPassword,
      focusedBackgroundColor: "#1a1a1a",
    })
    content.add(passInput)

    content.add(new BoxRenderable(this.cliRenderer, { width: 1, height: 1 })) // Spacer

    // Override toggle
    const overrideText = new TextRenderable(this.cliRenderer, {
      id: "override-toggle",
      content: `[O] Override existing: ${this.overrideExisting ? "Yes" : "No"}`,
      fg: this.overrideExisting ? "#50fa7b" : "#6272a4",
    })
    content.add(overrideText)

    userInput.focus()
    let focusedInput: InputRenderable | null = userInput

    // Handle key events
    this.keyHandler = (key: KeyEvent) => {
      // Skip shortcut keys when an input is focused (allow typing 'o')
      const inputIsFocused = focusedInput !== null

      if (key.name === "o" && !inputIsFocused) {
        // Toggle override only when no input is focused
        this.overrideExisting = !this.overrideExisting
        overrideText.content = `[O] Override existing: ${this.overrideExisting ? "Yes" : "No"}`
        overrideText.fg = this.overrideExisting ? "#50fa7b" : "#6272a4"
      } else if (key.name === "tab") {
        // Cycle focus: username -> password -> no focus (shortcuts work) -> username
        if (focusedInput === userInput) {
          userInput.blur()
          passInput.focus()
          focusedInput = passInput
        } else if (focusedInput === passInput) {
          passInput.blur()
          focusedInput = null // No focus state - shortcuts available
        } else {
          // No input focused, go back to username
          userInput.focus()
          focusedInput = userInput
        }
      } else if (key.name === "escape") {
        // Skip credentials setup
        this.cliRenderer.keyInput.off("keypress", this.keyHandler)
        userInput.blur()
        passInput.blur()
        focusedInput = null
        this.currentStep = "configure"
        this.runConfiguration()
      } else if (key.name === "return") {
        // Save and continue
        this.globalUsername = userInput.value || "admin"
        this.globalPassword = passInput.value

        this.cliRenderer.keyInput.off("keypress", this.keyHandler)
        userInput.blur()
        passInput.blur()
        focusedInput = null

        // Save credentials to .env
        this.saveGlobalCredentialsToEnv()

        this.currentStep = "configure"
        this.runConfiguration()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private async saveGlobalCredentialsToEnv() {
    try {
      const updates: Record<string, string> = {}
      if (this.globalUsername) updates.GLOBAL_USERNAME = this.globalUsername
      if (this.globalPassword) updates.GLOBAL_PASSWORD = this.globalPassword
      await updateEnv(updates)
    } catch {
      // Ignore errors - not critical
    }
  }

  private async runConfiguration() {
    // Initialize results for apps that have rootFolder
    for (const appConfig of this.config.apps) {
      if (!appConfig.enabled) continue
      const appDef = getApp(appConfig.id)
      if (!appDef?.rootFolder) continue

      this.results.push({
        appId: appConfig.id,
        appName: appDef.name,
        status: "pending",
      })
    }

    this.renderConfigProgress()

    // Configure each app
    for (let i = 0; i < this.results.length; i++) {
      const result = this.results[i]
      result.status = "configuring"
      this.updateDisplay()

      try {
        await this.configureApp(result.appId)
        result.status = "success"
        result.message = "Root folder configured"
      } catch (e) {
        result.status = "error"
        result.message = e instanceof Error ? e.message : String(e)
      }
      this.updateDisplay()
    }

    // Setup auth for *arr apps without root folders (e.g., Prowlarr)
    if (this.globalPassword) {
      const arrAppsNeedingAuth = ["prowlarr"]
      for (const appId of arrAppsNeedingAuth) {
        const appConfig = this.config.apps.find((a) => a.id === appId && a.enabled)
        if (!appConfig) continue

        const apiKey = this.extractApiKey(appId as AppId)
        if (!apiKey) continue

        const appDef = getApp(appId as AppId)
        const port = appConfig.port || appDef?.defaultPort || 9696
        const client = new ArrApiClient("localhost", port, apiKey)

        try {
          await client.updateHostConfig(this.globalUsername, this.globalPassword, this.overrideExisting)
        } catch {
          // Auth setup for these apps is best-effort
        }
      }
    }

    // After root folders, prompt for download clients if needed
    if (this.hasQBittorrent || this.hasSABnzbd) {
      if (this.hasQBittorrent) {
        this.currentStep = "qbittorrent"
        this.renderQBittorrentPrompt()
      } else if (this.hasSABnzbd) {
        this.currentStep = "sabnzbd"
        this.renderSABnzbdPrompt()
      }
    } else {
      this.currentStep = "done"
      this.renderDone()
    }
  }

  private async configureApp(appId: AppId): Promise<void> {
    const appDef = getApp(appId)
    if (!appDef?.rootFolder || !appDef.apiKeyMeta) {
      throw new Error("Missing configuration")
    }

    // Get API key from config file
    const apiKey = this.extractApiKey(appId)
    if (!apiKey) {
      throw new Error("API key not found - start container first")
    }

    // Wait for app to be healthy
    const port = this.config.apps.find((a) => a.id === appId)?.port || appDef.defaultPort
    const client = new ArrApiClient("localhost", port, apiKey, appDef.rootFolder.apiVersion)

    // Retry health check a few times
    let healthy = false
    for (let i = 0; i < 3; i++) {
      healthy = await client.isHealthy()
      if (healthy) break
      await new Promise((r) => setTimeout(r, 1000))
    }

    if (!healthy) {
      throw new Error("App not responding - start containers first")
    }

    // Check if root folder already exists
    const existingFolders = await client.getRootFolders()
    const alreadyExists = existingFolders.some((f) => f.path === appDef.rootFolder!.path)

    if (alreadyExists) {
      throw new Error("Already configured")
    }

    // Add root folder - Lidarr requires profile IDs
    if (appId === "lidarr") {
      const metadataProfiles = await client.getMetadataProfiles()
      const qualityProfiles = await client.getQualityProfiles()
      await client.addRootFolder({
        path: appDef.rootFolder.path,
        defaultMetadataProfileId: metadataProfiles[0]?.id || 1,
        defaultQualityProfileId: qualityProfiles[0]?.id || 1,
      })
    } else {
      await client.addRootFolder(appDef.rootFolder.path)
    }

    // Set up authentication if credentials provided
    if (this.globalPassword) {
      try {
        await client.updateHostConfig(this.globalUsername, this.globalPassword, this.overrideExisting)
      } catch {
        // Ignore auth setup errors - not critical
      }
    }
  }

  private extractApiKey(appId: AppId): string | null {
    // Use API keys from .env file (format: API_KEY_APPNAME)
    const envKey = `API_KEY_${appId.toUpperCase()}`
    return readEnvSync()[envKey] ?? null
  }

  /**
   * Get qBittorrent categories based on enabled *arr apps
   */
  private getEnabledCategories(): { name: string; savePath: string }[] {
    const enabledAppIds = this.config.apps.filter((a) => a.enabled).map((a) => a.id)
    return getCategoriesForApps(enabledAppIds)
  }

  private renderConfigProgress() {
    this.clear()

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "Configure Apps",
      stepInfo: "Setting up root folders",
      footerHint: "Please wait...",
    })
    this.pageContainer = container
    this.contentBox = content
    this.add(container)

    this.updateDisplay()
  }

  private updateDisplay() {
    // Clear content and rebuild - remove all children from contentBox
    const contentChildren = [...this.contentBox.getChildren()]
    for (const child of contentChildren) {
      if (child.id) {
        try {
          this.contentBox.remove(child.id)
        } catch {
          /* ignore */
        }
      }
    }

    // Header
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "Configuring *arr applications...\n",
        fg: "#4a9eff",
      })
    )

    // Results
    for (const result of this.results) {
      const icon =
        result.status === "pending"
          ? "⏳"
          : result.status === "configuring"
            ? "🔄"
            : result.status === "success"
              ? "✓"
              : result.status === "skipped"
                ? "⏭"
                : "✗"

      const color =
        result.status === "success"
          ? "#50fa7b"
          : result.status === "error"
            ? "#ff5555"
            : result.status === "skipped"
              ? "#6272a4"
              : "#f1fa8c"

      const message = result.message ? ` - ${result.message}` : ""

      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `${icon} ${result.appName.padEnd(15)} ${message}`,
          fg: color,
        })
      )
    }
  }

  private renderQBittorrentPrompt() {
    this.clear()

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "Configure Apps",
      stepInfo: "qBittorrent Credentials",
      footerHint: "Enter credentials from qBittorrent WebUI  Esc Skip",
    })
    this.pageContainer = container
    this.add(container)

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Enter qBittorrent credentials (from Settings → WebUI):\n",
        fg: "#4a9eff",
      })
    )

    // Password input - pre-fill with saved value
    content.add(new TextRenderable(this.cliRenderer, { content: "Password:", fg: "#aaaaaa" }))
    const passInput = new InputRenderable(this.cliRenderer, {
      id: "qb-pass-input",
      width: 30,
      placeholder: "WebUI Password",
      value: this.qbPass,
      focusedBackgroundColor: "#1a1a1a",
    })
    content.add(passInput)

    passInput.focus()

    // Handle Enter via SUBMIT event
    passInput.on(InputRenderableEvents.ENTER, () => {
      this.qbPass = passInput.value
      if (this.keyHandler) this.cliRenderer.keyInput.off("keypress", this.keyHandler)
      passInput.blur()
      this.addDownloadClients("qbittorrent")
    })

    // Handle Escape via keypress
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.cliRenderer.keyInput.off("keypress", this.keyHandler)
        passInput.blur()
        if (this.hasSABnzbd) {
          this.currentStep = "sabnzbd"
          this.renderSABnzbdPrompt()
        } else {
          this.currentStep = "done"
          this.renderDone()
        }
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private renderSABnzbdPrompt() {
    this.clear()

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "Configure Apps",
      stepInfo: "SABnzbd Credentials",
      footerHint: "Enter API key from SABnzbd Config → General  Esc Skip",
    })
    this.pageContainer = container
    this.add(container)

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Enter SABnzbd API Key (from Config → General → API Key):\n",
        fg: "#4a9eff",
      })
    )

    // API key input - pre-fill with saved value
    content.add(new TextRenderable(this.cliRenderer, { content: "API Key:", fg: "#aaaaaa" }))
    const keyInput = new InputRenderable(this.cliRenderer, {
      id: "sab-key-input",
      width: 40,
      placeholder: "SABnzbd API Key",
      value: this.sabApiKey,
      focusedBackgroundColor: "#1a1a1a",
    })
    content.add(keyInput)

    keyInput.focus()

    // Handle Enter via SUBMIT event
    keyInput.on(InputRenderableEvents.ENTER, () => {
      this.sabApiKey = keyInput.value
      if (this.keyHandler) this.cliRenderer.keyInput.off("keypress", this.keyHandler)
      keyInput.blur()
      this.addDownloadClients("sabnzbd")
    })

    // Handle Escape via keypress
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.cliRenderer.keyInput.off("keypress", this.keyHandler)
        keyInput.blur()
        this.currentStep = "done"
        this.renderDone()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private async addDownloadClients(type: "qbittorrent" | "sabnzbd") {
    // Configure qBittorrent settings via its API first
    if (type === "qbittorrent") {
      try {
        const qbClient = new QBittorrentClient(this.qbHost, this.qbPort, this.qbUser, this.qbPass)
        const loggedIn = await qbClient.login()
        if (loggedIn) {
          // Generate categories from enabled *arr apps that use download clients
          const categories = this.getEnabledCategories()
          // Configure TRaSH-compliant settings: save_path, auto_tmm, categories
          await qbClient.configureTRaSHCompliant(categories)
        }
      } catch {
        // Ignore qBittorrent config errors - may not be ready or have different auth
      }
    }

    // Add download client to all *arr apps
    const servarrApps = this.config.apps.filter((a) => {
      const def = getApp(a.id)
      return a.enabled && def?.rootFolder
    })

    for (const appConfig of servarrApps) {
      const appDef = getApp(appConfig.id)
      if (!appDef?.rootFolder || !appDef.apiKeyMeta) continue

      const apiKey = this.extractApiKey(appConfig.id)
      if (!apiKey) continue

      const port = appConfig.port || appDef.defaultPort
      const client = new ArrApiClient("localhost", port, apiKey, appDef.rootFolder.apiVersion)

      try {
        if (type === "qbittorrent") {
          const config = createQBittorrentConfig(this.qbHost, this.qbPort, this.qbUser, this.qbPass, appConfig.id)
          await client.addDownloadClient(config)
        } else {
          const config = createSABnzbdConfig(this.sabHost, this.sabPort, this.sabApiKey, appConfig.id)
          await client.addDownloadClient(config)
        }
      } catch {
        // Ignore errors - client may already exist
      }
    }

    // Save credentials to .env
    await this.saveCredentialsToEnv(type)

    // Move to next step
    if (type === "qbittorrent" && this.hasSABnzbd) {
      this.currentStep = "sabnzbd"
      this.renderSABnzbdPrompt()
    } else {
      this.currentStep = "done"
      this.renderDone()
    }
  }

  private async saveCredentialsToEnv(type: "qbittorrent" | "sabnzbd") {
    try {
      const updates: Record<string, string> = {}
      if (type === "qbittorrent" && this.qbPass) {
        updates.QBITTORRENT_PASSWORD = this.qbPass
      } else if (type === "sabnzbd" && this.sabApiKey) {
        updates.SABNZBD_API_KEY = this.sabApiKey
      }
      await updateEnv(updates)
    } catch {
      // Ignore errors - not critical
    }
  }

  private renderDone() {
    this.clear()

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "Configure Apps",
      stepInfo: "Complete",
      footerHint: "Press any key to return",
    })
    this.add(container)

    const successCount = this.results.filter((r) => r.status === "success").length
    const errorCount = this.results.filter((r) => r.status === "error").length

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Configuration complete!\n",
        fg: "#50fa7b",
      })
    )

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: `✓ ${successCount} app(s) configured`,
        fg: "#50fa7b",
      })
    )

    if (errorCount > 0) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: `✗ ${errorCount} app(s) had errors (see above)`,
          fg: "#ff5555",
        })
      )
    }

    content.add(new BoxRenderable(this.cliRenderer, { width: 1, height: 1 })) // Spacer

    // Show results summary
    for (const result of this.results) {
      const icon = result.status === "success" ? "✓" : result.status === "skipped" ? "⏭" : "✗"
      const color = result.status === "success" ? "#50fa7b" : result.status === "skipped" ? "#6272a4" : "#ff5555"
      const message = result.message ? ` - ${result.message}` : ""

      content.add(
        new TextRenderable(this.cliRenderer, {
          content: `${icon} ${result.appName}${message}`,
          fg: color,
        })
      )
    }

    this.keyHandler = () => {
      this.destroy()
      this.onBack()
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private clear() {
    // Remove all children
    const children = [...this.getChildren()]
    for (const child of children) {
      if (child.id) {
        try {
          this.remove(child.id)
        } catch {
          /* ignore */
        }
      }
    }
  }

  public destroy() {
    if (this.keyHandler) {
      this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    }
    if (this.parent && this.id) {
      try {
        this.parent.remove(this.id)
      } catch {
        /* ignore */
      }
    }
  }
}
