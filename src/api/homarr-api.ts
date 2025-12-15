/**
 * Homarr API Client
 * Handles Homarr dashboard auto-setup with user and app management
 * Based on Homarr OpenAPI v1.0.0
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"
import type { AppConfig } from "../config/schema"
import { getApp } from "../apps/registry"

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

export class HomarrClient implements IAutoSetupClient {
  private host: string
  private port: number
  private apiKey?: string

  constructor(host: string, port: number = 7575, apiKey?: string) {
    this.host = host
    this.port = port
    this.apiKey = apiKey
  }

  /**
   * Get base URL for Homarr
   */
  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`
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
      const response = await fetch(this.baseUrl, {
        method: "GET",
      })
      debugLog("HomarrApi", `Health check: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("HomarrApi", `Health check failed: ${error}`)
      return false
    }
  }

  /**
   * Check if already configured (has users)
   */
  async isInitialized(): Promise<boolean> {
    // Homarr is always "initialized" after first access
    return true
  }

  /**
   * Get Homarr version info
   */
  async getInfo(): Promise<HomarrInfo | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/info`, {
        method: "GET",
        headers: this.getHeaders(),
      })

      if (response.ok) {
        return response.json()
      }
    } catch {
      // API may not be available
    }
    return null
  }

  /**
   * Get all users
   */
  async getUsers(): Promise<HomarrUser[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/users`, {
        method: "GET",
        headers: this.getHeaders(),
      })

      if (response.ok) {
        return response.json()
      }
    } catch {
      // API may require auth
    }
    return []
  }

  /**
   * Create a user
   */
  async createUser(username: string, password: string, email?: string): Promise<boolean> {
    debugLog("HomarrApi", `Creating user: ${username}`)

    try {
      const response = await fetch(`${this.baseUrl}/api/users`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          username,
          password,
          confirmPassword: password,
          email: email || "",
          groupIds: [],
        }),
      })

      if (response.ok) {
        debugLog("HomarrApi", `User "${username}" created successfully`)
        return true
      }

      const text = await response.text()
      debugLog("HomarrApi", `Failed to create user: ${response.status} - ${text}`)
      return false
    } catch (error) {
      debugLog("HomarrApi", `Failed to create user: ${error}`)
      return false
    }
  }

  /**
   * Get all apps
   */
  async getApps(): Promise<HomarrApp[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/apps`, {
        method: "GET",
        headers: this.getHeaders(),
      })

      if (response.ok) {
        return response.json()
      }
    } catch {
      // API may require auth
    }
    return []
  }

  /**
   * Create an app
   */
  async createApp(app: Omit<HomarrApp, "id" | "appId">): Promise<string | null> {
    debugLog("HomarrApi", `Creating app: ${app.name}`)

    try {
      const response = await fetch(`${this.baseUrl}/api/apps`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(app),
      })

      if (response.ok) {
        const data = await response.json()
        debugLog("HomarrApi", `App "${app.name}" created with ID ${data.appId}`)
        return data.appId
      }

      const text = await response.text()
      debugLog("HomarrApi", `Failed to create app: ${response.status} - ${text}`)
      return null
    } catch (error) {
      debugLog("HomarrApi", `Failed to create app: ${error}`)
      return null
    }
  }

  /**
   * Build app config for an easiarr app
   */
  buildAppConfig(appConfig: AppConfig): Omit<HomarrApp, "id" | "appId"> | null {
    const appDef = getApp(appConfig.id)
    if (!appDef) return null

    // Skip apps without web UI
    if (appDef.defaultPort === 0) return null

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
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Homarr not reachable" }
      }

      // Check if users exist
      const users = await this.getUsers()
      let userCreated = false

      if (users.length === 0) {
        // Try to create initial user
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

    // Get existing apps to avoid duplicates
    const existingApps = await this.getApps()
    const existingNames = new Set(existingApps.map((a) => a.name))

    for (const appConfig of apps) {
      if (!appConfig.enabled) continue

      const homarrApp = this.buildAppConfig(appConfig)
      if (!homarrApp) continue

      // Skip if already exists
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
