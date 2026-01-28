/**
 * Heimdall API Client
 * Handles Heimdall dashboard auto-setup with application tiles
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import type { AppConfig } from "~/config/schema"
import { getApp } from "~/apps/registry"
import { BaseApiClient } from "./base-api"

interface HeimdallApp {
  id?: number
  title: string
  url: string
  colour?: string
  icon?: string
  appdescription?: string
  pinned?: boolean
}

export class HeimdallClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "HeimdallApi"

  constructor(host: string, port: number = 80) {
    super(host, port)
  }

  /**
   * Check if Heimdall is reachable
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
   * Check if already configured
   */
  async isInitialized(): Promise<boolean> {
    return true
  }

  /**
   * Get list of apps
   */
  async getApps(): Promise<HeimdallApp[]> {
    const response = await this.get<HeimdallApp[]>("/api/items")
    return response.data ?? []
  }

  /**
   * Add an app/tile to Heimdall
   */
  async addApp(app: HeimdallApp): Promise<boolean> {
    const response = await this.post<unknown, HeimdallApp>("/api/items", app)
    return response.success
  }

  /**
   * Build app config for an easiarr app
   */
  buildAppConfig(appConfig: AppConfig): HeimdallApp | null {
    const appDef = getApp(appConfig.id)
    if (!appDef || appDef.defaultPort === 0) return null

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
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Heimdall not reachable" }
      }

      const existingApps = await this.getApps()

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
