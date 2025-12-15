/**
 * Tautulli API Client
 * Handles Tautulli auto-setup for Plex monitoring
 * Note: Initial Plex connection requires web wizard, but API key can be retrieved automatically
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

interface TautulliServerInfo {
  pms_identifier?: string
  pms_ip?: string
  pms_is_remote?: number
  pms_name?: string
  pms_platform?: string
  pms_plexpass?: number
  pms_port?: number
  pms_ssl?: number
  pms_url?: string
  pms_url_manual?: number
  pms_version?: string
}

interface TautulliApiResponse<T = unknown> {
  response: {
    result: "success" | "error"
    message?: string
    data: T
  }
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
   * Check if Tautulli has Plex connection configured
   */
  async isInitialized(): Promise<boolean> {
    if (!this.apiKey) return false

    try {
      const serverInfo = await this.getServerInfo()
      // If we have PMS identifier, Plex is connected
      return !!serverInfo?.pms_identifier
    } catch {
      return false
    }
  }

  /**
   * Get or create API key
   * Works without authentication on first run!
   */
  async getApiKey(username?: string, password?: string): Promise<string | null> {
    debugLog("TautulliApi", "Getting/creating API key...")

    try {
      const url = new URL(`${this.baseUrl}/api/v2`)
      url.searchParams.set("cmd", "get_apikey")
      if (username) url.searchParams.set("username", username)
      if (password) url.searchParams.set("password", password)

      const response = await fetch(url.toString(), { method: "GET" })

      if (response.ok) {
        const data = (await response.json()) as TautulliApiResponse<string>
        if (data.response?.result === "success" && data.response.data) {
          const apiKey = data.response.data
          this.apiKey = apiKey
          debugLog("TautulliApi", "API key obtained successfully")
          return apiKey
        }
      }

      const text = await response.text()
      debugLog("TautulliApi", `Failed to get API key: ${response.status} - ${text}`)
    } catch (error) {
      debugLog("TautulliApi", `Error getting API key: ${error}`)
    }
    return null
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
        const data = (await response.json()) as TautulliApiResponse<TautulliServerInfo>
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
        const data = (await response.json()) as TautulliApiResponse<Record<string, unknown>>
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
   * Check server connection status
   */
  async serverStatus(): Promise<boolean> {
    if (!this.apiKey) return false

    try {
      const response = await fetch(this.buildApiUrl("server_status"), {
        method: "GET",
      })

      if (response.ok) {
        const data = (await response.json()) as TautulliApiResponse<{ connected: boolean }>
        return data.response?.result === "success" && data.response.data?.connected === true
      }
    } catch {
      // Ignore
    }
    return false
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
        const data = (await response.json()) as TautulliApiResponse<Record<string, unknown>>
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
   * Gets API key automatically, but Plex connection requires manual wizard
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Tautulli not reachable" }
      }

      // Step 1: Get or create API key (works without auth initially)
      debugLog("TautulliApi", "Step 1: Getting API key...")
      let apiKey: string | undefined = this.apiKey
      if (!apiKey) {
        const newKey = await this.getApiKey(options.username, options.password)
        if (!newKey) {
          return { success: false, message: "Failed to get API key" }
        }
        apiKey = newKey
      }

      // Step 2: Check if Plex is already connected
      debugLog("TautulliApi", "Step 2: Checking Plex connection...")
      const serverInfo = await this.getServerInfo()
      const plexConnected = !!serverInfo?.pms_identifier

      if (plexConnected) {
        debugLog("TautulliApi", `Plex connected: ${serverInfo?.pms_name}`)
        return {
          success: true,
          message: `Connected to Plex: ${serverInfo?.pms_name}`,
          data: { apiKey },
          envUpdates: { API_KEY_TAUTULLI: apiKey },
        }
      }

      // Plex not connected - requires manual wizard
      // But we still got the API key which is useful
      return {
        success: true,
        message: "API key obtained. Complete Plex connection via web wizard.",
        data: { apiKey, requiresWizard: true },
        envUpdates: { API_KEY_TAUTULLI: apiKey },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
