/**
 * Tautulli API Client
 * Handles Tautulli auto-setup for Plex monitoring
 * Note: Tautulli requires Plex to be configured first
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

interface TautulliServerInfo {
  version: string
  pms_name?: string
  pms_identifier?: string
}

export class TautulliClient implements IAutoSetupClient {
  private host: string
  private port: number
  private apiKey?: string

  constructor(host: string, port: number = 8181, apiKey?: string) {
    this.host = host
    this.port = port
    this.apiKey = apiKey
  }

  /**
   * Get base URL for Tautulli
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
   * Build API URL with command and optional params
   */
  private buildApiUrl(cmd: string, params: Record<string, string> = {}): string {
    const url = new URL(`${this.baseUrl}/api/v2`)
    url.searchParams.set("cmd", cmd)
    if (this.apiKey) {
      url.searchParams.set("apikey", this.apiKey)
    }
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    return url.toString()
  }

  /**
   * Check if Tautulli is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Tautulli returns 200 OK even without API key for basic requests
      const response = await fetch(`${this.baseUrl}/status`, {
        method: "GET",
      })
      debugLog("TautulliApi", `Health check: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("TautulliApi", `Health check failed: ${error}`)
      return false
    }
  }

  /**
   * Check if Tautulli is already configured (has Plex connection)
   */
  async isInitialized(): Promise<boolean> {
    try {
      // Without API key, we can only check if the service is running
      // Tautulli shows setup wizard automatically if not configured
      const response = await fetch(`${this.baseUrl}/status`, {
        method: "GET",
      })

      if (!response.ok) return false

      // Check if redirected to setup wizard
      const text = await response.text()
      const isWizard = text.includes("setup") || text.includes("wizard")
      return !isWizard
    } catch {
      return false
    }
  }

  /**
   * Get server info (requires API key)
   */
  async getServerInfo(): Promise<TautulliServerInfo | null> {
    if (!this.apiKey) return null

    try {
      const response = await fetch(this.buildApiUrl("get_server_info"), {
        method: "GET",
      })

      if (response.ok) {
        const data = await response.json()
        if (data.response?.result === "success") {
          return data.response.data
        }
      }
    } catch {
      // Ignore
    }
    return null
  }

  /**
   * Get Plex Media Server info (requires API key)
   */
  async getPlexServerInfo(): Promise<Record<string, unknown> | null> {
    if (!this.apiKey) return null

    try {
      const response = await fetch(this.buildApiUrl("get_server_info"), {
        method: "GET",
      })

      if (response.ok) {
        const data = await response.json()
        if (data.response?.result === "success") {
          return data.response.data
        }
      }
    } catch {
      // Ignore
    }
    return null
  }

  /**
   * Get API key from settings (if accessible)
   */
  async getSettings(): Promise<Record<string, unknown> | null> {
    if (!this.apiKey) return null

    try {
      const response = await fetch(this.buildApiUrl("get_settings"), {
        method: "GET",
      })

      if (response.ok) {
        const data = await response.json()
        if (data.response?.result === "success") {
          return data.response.data
        }
      }
    } catch {
      // Ignore
    }
    return null
  }

  /**
   * Run the auto-setup process for Tautulli
   * Note: Tautulli requires manual Plex connection via web wizard
   */
  async setup(_options: AutoSetupOptions): Promise<AutoSetupResult> {
    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Tautulli not reachable" }
      }

      // Check if already initialized
      const initialized = await this.isInitialized()
      if (initialized) {
        return { success: true, message: "Already configured" }
      }

      // Tautulli requires manual Plex connection via setup wizard
      return {
        success: false,
        message: "Requires manual Plex connection via web wizard",
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
