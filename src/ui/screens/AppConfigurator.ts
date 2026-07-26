/**
 * App Configurator Screen
 * Configures *arr apps via API - sets root folders and download clients
 */

import { BoxRenderable, CliRenderer, KeyEvent, TextRenderable } from "@opentui/core"

import {
  AddRootFolderOptions,
  ArrApiClient,
  createQBittorrentConfig,
  createSABnzbdConfig,
} from "~/api/arr-api"
import { QBittorrentClient } from "~/api/qbittorrent-api"
import { getApp } from "~/apps/registry"
import { AppId, EasiarrConfig } from "~/config/schema"
import { CredentialsForm, CredentialsFormResult } from "~/ui/components/CredentialsForm"
import { DownloadClientForm, DownloadClientFormResult } from "~/ui/components/DownloadClientForm"
import { createPageLayout } from "~/ui/components/PageLayout"
import { getCategoriesForApps } from "~/utils/categories"
import { readEnvSync, updateEnv } from "~/utils/env"

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
  private globalEmail = ""
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
    if (env.USERNAME_GLOBAL) this.globalUsername = env.USERNAME_GLOBAL
    this.globalPassword = env.PASSWORD_GLOBAL || "Ch4ng3m3!1234securityReasons"
    if (env.EMAIL_GLOBAL) this.globalEmail = env.EMAIL_GLOBAL
    if (env.PASSWORD_QBITTORRENT) this.qbPass = env.PASSWORD_QBITTORRENT
    if (env.API_KEY_SABNZBD) this.sabApiKey = env.API_KEY_SABNZBD
  }

  private renderCredentialsPrompt() {
    this.clear()

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "Configure Apps",
      stepInfo: "Global Credentials",
      footerHint: [
        { type: "key", key: "Tab", value: "Cycle Fields/Shortcuts" },
        { type: "key", key: "O", value: "Override" },
        { type: "key", key: "Enter", value: "Continue" },
        { type: "key", key: "Esc", value: "Skip" },
      ],
    })
    this.pageContainer = container
    this.add(container)

    const form = new CredentialsForm(
      this.cliRenderer,
      {
        title: "Set a global username/password for all *arr applications:",
        initialUsername: this.globalUsername,
        initialPassword: this.globalPassword,
        initialEmail: this.globalEmail,
        showEmail: true,
        showOverride: true,
        initialOverride: this.overrideExisting,
      },
      (result: CredentialsFormResult) => {
        this.globalUsername = result.username
        this.globalPassword = result.password
        this.globalEmail = result.email
        this.overrideExisting = result.override
        this.saveGlobalCredentialsToEnv()
        this.currentStep = "configure"
        this.runConfiguration()
      },
      () => {
        // Cancelled - skip credentials
        this.currentStep = "configure"
        this.runConfiguration()
      }
    )
    content.add(form)
  }

  private async saveGlobalCredentialsToEnv() {
    try {
      const updates: Record<string, string> = {}
      if (this.globalUsername) updates.USERNAME_GLOBAL = this.globalUsername
      if (this.globalPassword) updates.PASSWORD_GLOBAL = this.globalPassword
      if (this.globalEmail) updates.EMAIL_GLOBAL = this.globalEmail
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
      await this.configureApp(result.appId)
    }

    // After all apps configured, handle download clients
    if (this.hasQBittorrent) {
      this.currentStep = "qbittorrent"
      this.renderQBittorrentPrompt()
    } else if (this.hasSABnzbd) {
      this.currentStep = "sabnzbd"
      this.renderSABnzbdPrompt()
    } else {
      this.currentStep = "done"
      this.renderDone()
    }
  }

  private async configureApp(appId: AppId) {
    const result = this.results.find((r) => r.appId === appId)
    if (!result) return

    const appDef = getApp(appId)
    if (!appDef) {
      result.status = "error"
      result.message = "Unknown app"
      return
    }

    // Get API key from env
    const apiKey = this.extractApiKey(appId)
    if (!apiKey) {
      result.status = "skipped"
      result.message = "No API key"
      return
    }

    try {
      const appConfig = this.config.apps.find((a) => a.id === appId)
      const port = appConfig?.port ?? appDef.defaultPort
      const apiVersion = appDef.rootFolder?.apiVersion || "v3"
      const client = new ArrApiClient("localhost", port, apiKey, apiVersion)

      // Check current root folder
      const rootFolders = await client.getRootFolders()
      const targetPath = appDef.rootFolder?.path

      // Check if already configured properly
      const hasCorrectRoot = rootFolders.some((rf) => rf.path === targetPath)
      if (hasCorrectRoot && !this.overrideExisting) {
        result.status = "success"
        result.message = "Already configured"
        return
      }

      // Add root folder if missing
      if (!hasCorrectRoot && targetPath) {
        const options: AddRootFolderOptions = { path: targetPath }
        if (appId === "lidarr") options.name = "Music"
        if (appId === "readarr") options.name = "Books"
        await client.addRootFolder(options)
      }

      result.status = "success"
      result.message = "Root folder set"
    } catch (error) {
      result.status = "error"
      result.message = String(error).substring(0, 50)
    }
  }

  private extractApiKey(appId: AppId): string | null {
    const envKey = `API_KEY_${appId.toUpperCase()}`
    return readEnvSync()[envKey] ?? null
  }

  private getEnabledCategories(): { name: string; savePath: string }[] {
    const enabledAppIds = this.config.apps.filter((a) => a.enabled).map((a) => a.id)
    return getCategoriesForApps(enabledAppIds)
  }

  private renderConfigProgress() {
    this.clear()

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "Configure Apps",
      stepInfo: "Setting up root folders",
      footerHint: [{ type: "text", value: "Please wait..." }],
    })
    this.pageContainer = container
    this.contentBox = content
    this.add(container)

    this.updateDisplay()
  }

  private updateDisplay() {
    // Clear content and rebuild
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
      let icon = "○"
      let color = "#6272a4"

      switch (result.status) {
        case "configuring":
          icon = "◉"
          color = "#f1fa8c"
          break
        case "success":
          icon = "✓"
          color = "#50fa7b"
          break
        case "error":
          icon = "✗"
          color = "#ff5555"
          break
        case "skipped":
          icon = "⏭"
          color = "#6272a4"
          break
      }

      const message = result.message ? ` - ${result.message}` : ""
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `${icon} ${result.appName}${message}`,
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
      footerHint: [
        { type: "text", value: "Enter credentials from qBittorrent WebUI" },
        { type: "key", key: "Esc", value: "Skip" },
      ],
    })
    this.pageContainer = container
    this.add(container)

    const form = new DownloadClientForm(
      this.cliRenderer,
      { type: "qbittorrent", initialValue: this.qbPass },
      (result: DownloadClientFormResult) => {
        this.qbPass = result.value
        this.addDownloadClients("qbittorrent")
      },
      () => {
        // Cancelled
        if (this.hasSABnzbd) {
          this.currentStep = "sabnzbd"
          this.renderSABnzbdPrompt()
        } else {
          this.currentStep = "done"
          this.renderDone()
        }
      }
    )
    content.add(form)
  }

  private renderSABnzbdPrompt() {
    this.clear()

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "Configure Apps",
      stepInfo: "SABnzbd Credentials",
      footerHint: [
        { type: "text", value: "Enter API key from SABnzbd Config → General" },
        { type: "key", key: "Esc", value: "Skip" },
      ],
    })
    this.pageContainer = container
    this.add(container)

    const form = new DownloadClientForm(
      this.cliRenderer,
      { type: "sabnzbd", initialValue: this.sabApiKey },
      (result: DownloadClientFormResult) => {
        this.sabApiKey = result.value
        this.addDownloadClients("sabnzbd")
      },
      () => {
        // Cancelled
        this.currentStep = "done"
        this.renderDone()
      }
    )
    content.add(form)
  }

  private async addDownloadClients(type: "qbittorrent" | "sabnzbd") {
    // Configure qBittorrent settings via its API first
    if (type === "qbittorrent") {
      try {
        const qbClient = new QBittorrentClient(this.qbHost, this.qbPort, this.qbUser, this.qbPass)
        await qbClient.login()

        // Create categories for enabled *arr apps
        const categories = this.getEnabledCategories()
        for (const cat of categories) {
          await qbClient.createCategory(cat.name, cat.savePath)
        }
      } catch {
        // QB may not be ready or credentials wrong - continue anyway
      }
    }

    // Save credentials to .env
    await this.saveCredentialsToEnv(type)

    // Add download clients to *arr apps
    for (const result of this.results) {
      if (result.status !== "success") continue

      const apiKey = this.extractApiKey(result.appId)
      if (!apiKey) continue

      const appDef = getApp(result.appId)
      const appConfig = this.config.apps.find((a) => a.id === result.appId)
      const port = appConfig?.port ?? appDef?.defaultPort ?? 8989

      try {
        const client = new ArrApiClient(result.appId, port, apiKey)

        if (type === "qbittorrent") {
          const qbConfig = createQBittorrentConfig(
            this.qbHost,
            this.qbPort,
            this.qbUser,
            this.qbPass,
            result.appId
          )
          await client.addDownloadClient(qbConfig)
        } else {
          const sabConfig = createSABnzbdConfig(this.sabHost, this.sabPort, this.sabApiKey)
          await client.addDownloadClient(sabConfig)
        }
      } catch {
        // Continue - download client may fail but app is still configured
      }
    }

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
        updates.PASSWORD_QBITTORRENT = this.qbPass
      } else if (type === "sabnzbd" && this.sabApiKey) {
        updates.API_KEY_SABNZBD = this.sabApiKey
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
      footerHint: [{ type: "text", value: "Press any key to return" }],
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

    content.add(new BoxRenderable(this.cliRenderer, { width: 1, height: 1 }))

    // Show results summary
    for (const result of this.results) {
      const icon = result.status === "success" ? "✓" : result.status === "skipped" ? "⏭" : "✗"
      const color =
        result.status === "success"
          ? "#50fa7b"
          : result.status === "skipped"
            ? "#6272a4"
            : "#ff5555"
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
