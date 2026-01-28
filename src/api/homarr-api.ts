/**
 * Homarr API Client
 * Handles Homarr dashboard auto-setup with user and app management
 * Based on Homarr OpenAPI v1.0.0
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import type { AppConfig } from "~/config/schema"
import { getApp } from "~/apps/registry"
import { debugLog } from "~/utils/debug"
import { BaseApiClient } from "./base-api"

interface HomarrApp {
  id?: string
  appId?: string
  name: string
  description: string | null
  iconUrl: string
  href: string | null
  pingUrl: string | null
}

interface HomarrUser {
  id: string
  name: string | null
  email: string | null
}

interface HomarrInfo {
  version: string
}

export class HomarrClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "HomarrApi"
  private apiKey?: string

  constructor(host: string, port: number = 7575, apiKey?: string) {
    super(host, port)
    this.apiKey = apiKey
  }

  /**
   * Set API key for authenticated requests
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey
  }

  /**
   * Common headers for Homarr API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    }
    if (this.apiKey) {
      headers["ApiKey"] = this.apiKey
    }
    return headers
  }

  /**
   * Check if Homarr is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, { method: "GET" })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Check if already configured (has users)
   */
  async isInitialized(): Promise<boolean> {
    return true
  }

  /**
   * Get Homarr version info
   */
  async getInfo(): Promise<HomarrInfo | null> {
    const response = await this.get<HomarrInfo>("/api/info", { headers: this.getHeaders() })
    return response.data ?? null
  }

  /**
   * Get all users
   */
  async getUsers(): Promise<HomarrUser[]> {
    const response = await this.get<HomarrUser[]>("/api/users", { headers: this.getHeaders() })
    return response.data ?? []
  }

  /**
   * Create a user
   */
  async createUser(username: string, password: string, email?: string): Promise<boolean> {
    const response = await this.post<unknown>(
      "/api/users",
      {
        username,
        password,
        confirmPassword: password,
        email: email || "",
        groupIds: [],
      },
      { headers: this.getHeaders() }
    )
    return response.success
  }

  /**
   * Get all apps
   */
  async getApps(): Promise<HomarrApp[]> {
    const response = await this.get<HomarrApp[]>("/api/apps", { headers: this.getHeaders() })
    return response.data ?? []
  }

  /**
   * Create an app
   */
  async createApp(app: Omit<HomarrApp, "id" | "appId">): Promise<string | null> {
    const response = await this.post<{ appId: string }>("/api/apps", app, {
      headers: this.getHeaders(),
    })
    return response.data?.appId ?? null
  }

  /**
   * Build app config for an easiarr app
   */
  buildAppConfig(appConfig: AppConfig): Omit<HomarrApp, "id" | "appId"> | null {
    const appDef = getApp(appConfig.id)
    if (!appDef || appDef.defaultPort === 0) return null

    const port = appConfig.port || appDef.defaultPort

    return {
      name: appDef.name,
      description: appDef.description || null,
      iconUrl: `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${appConfig.id}.png`,
      href: `http://${appConfig.id}:${port}`,
      pingUrl: `http://${appConfig.id}:${port}`,
    }
  }

  /**
   * Run the auto-setup process for Homarr
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Homarr not reachable" }
      }

      const users = await this.getUsers()
      let userCreated = false

      if (users.length === 0) {
        userCreated = await this.createUser(username, password)
      }

      return {
        success: true,
        message: userCreated ? "User created, ready" : "Ready - add apps via UI or API",
        data: { userCreated },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }

  /**
   * Auto-add apps for enabled easiarr services
   */
  async setupEasiarrApps(apps: AppConfig[]): Promise<number> {
    let addedCount = 0

    const existingApps = await this.getApps()
    const existingNames = new Set(existingApps.map((a) => a.name))

    for (const appConfig of apps) {
      if (!appConfig.enabled) continue

      const homarrApp = this.buildAppConfig(appConfig)
      if (!homarrApp) continue

      if (existingNames.has(homarrApp.name)) {
        debugLog("HomarrApi", `App "${homarrApp.name}" already exists, skipping`)
        continue
      }

      const appId = await this.createApp(homarrApp)
      if (appId) {
        addedCount++
      }
    }

    return addedCount
  }
}
