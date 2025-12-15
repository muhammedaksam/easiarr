/**
 * Heimdall API Client
 * Handles Heimdall dashboard auto-setup with application tiles
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"
import type { AppConfig } from "../config/schema"
import { getApp } from "../apps/registry"

interface HeimdallApp {
  id?: number
  title: string
  url: string
  colour?: string
  icon?: string
  appdescription?: string
  pinned?: boolean
}

export class HeimdallClient implements IAutoSetupClient {
  private host: string
  private port: number

  constructor(host: string, port: number = 80) {
    this.host = host
    this.port = port
  }

  /**
   * Get base URL for Heimdall
   */
  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  /**
   * Check if Heimdall is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: "GET",
      })
      debugLog("HeimdallApi", `Health check: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("HeimdallApi", `Health check failed: ${error}`)
      return false
    }
  }

  /**
   * Check if already configured
   */
  async isInitialized(): Promise<boolean> {
    // Heimdall is always "initialized" - it works out of the box
    return true
  }

  /**
   * Get list of apps (via API if available)
   * Note: Heimdall primarily uses web UI for configuration
   */
  async getApps(): Promise<HeimdallApp[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/items`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      })

      if (response.ok) {
        return response.json()
      }
    } catch {
      // API may not be available or require auth
    }
    return []
  }

  /**
   * Add an app/tile to Heimdall
   * Note: Heimdall API may require authentication
   */
  async addApp(app: HeimdallApp): Promise<boolean> {
    debugLog("HeimdallApi", `Adding app: ${app.title}`)

    try {
      const response = await fetch(`${this.baseUrl}/api/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(app),
      })

      if (response.ok) {
        debugLog("HeimdallApi", `App "${app.title}" added successfully`)
        return true
      }

      // API might require auth or not exist
      if (response.status === 401 || response.status === 403) {
        debugLog("HeimdallApi", "API requires authentication")
        return false
      }

      if (response.status === 404) {
        debugLog("HeimdallApi", "Items API not available")
        return false
      }

      const text = await response.text()
      debugLog("HeimdallApi", `Failed to add app: ${response.status} - ${text}`)
      return false
    } catch (error) {
      debugLog("HeimdallApi", `Failed to add app: ${error}`)
      return false
    }
  }

  /**
   * Build app config for an easiarr app
   */
  buildAppConfig(appConfig: AppConfig): HeimdallApp | null {
    const appDef = getApp(appConfig.id)
    if (!appDef) return null

    // Skip apps without web UI
    if (appDef.defaultPort === 0) return null

    const port = appConfig.port || appDef.defaultPort

    return {
      title: appDef.name,
      url: `http://${appConfig.id}:${port}`,
      appdescription: appDef.description,
      pinned: true,
      colour: this.getColorForCategory(appDef.category),
    }
  }

  /**
   * Get a color based on app category
   */
  private getColorForCategory(category: string): string {
    const colors: Record<string, string> = {
      servarr: "#ffc107",
      indexer: "#17a2b8",
      downloader: "#28a745",
      mediaserver: "#6c5ce7",
      request: "#e17055",
      monitoring: "#00cec9",
      infrastructure: "#636e72",
      vpn: "#fd79a8",
      utility: "#74b9ff",
    }
    return colors[category] || "#6c757d"
  }

  /**
   * Run the auto-setup process for Heimdall
   */
  async setup(_options: AutoSetupOptions): Promise<AutoSetupResult> {
    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Heimdall not reachable" }
      }

      // Check existing apps count
      const existingApps = await this.getApps()

      // Heimdall works out of the box, tiles can be added via UI
      return {
        success: true,
        message: "Ready - add tiles via UI",
        data: { existingAppsCount: existingApps.length },
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

    for (const appConfig of apps) {
      if (!appConfig.enabled) continue

      const heimdallApp = this.buildAppConfig(appConfig)
      if (!heimdallApp) continue

      const success = await this.addApp(heimdallApp)
      if (success) {
        addedCount++
      }
    }

    return addedCount
  }
}
