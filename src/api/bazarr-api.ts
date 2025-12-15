/**
 * Bazarr API Client
 * Handles Bazarr-specific API calls for authentication and settings
 */

import { debugLog } from "../utils/debug"

/**
 * Bazarr System Settings (partial - auth related fields)
 */
export interface BazarrAuthSettings {
  auth: {
    type: "None" | "Basic" | "Form"
    username: string
    password: string
    apikey: string
  }
}

/**
 * Bazarr API Client
 */
export class BazarrApiClient {
  private baseUrl: string
  private apiKey: string | null = null

  constructor(host: string, port: number) {
    this.baseUrl = `http://${host}:${port}`
  }

  /**
   * Set API key for authentication
   */
  setApiKey(key: string): void {
    this.apiKey = key
    debugLog("Bazarr", `API key set`)
  }

  /**
   * Make an API request to Bazarr
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    }

    // Always add API key as query parameter
    let finalUrl = url
    if (this.apiKey) {
      finalUrl = `${url}${url.includes("?") ? "&" : "?"}apikey=${this.apiKey}`
    }

    debugLog("Bazarr", `${options.method || "GET"} ${finalUrl}`)
    if (options.body) {
      debugLog("Bazarr", `Request body: ${options.body}`)
    }

    const response = await fetch(finalUrl, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      debugLog("Bazarr", `Error ${response.status}: ${errorText}`)
      throw new Error(`Bazarr API error: ${response.status} ${response.statusText}`)
    }

    // Handle empty responses
    const text = await response.text()
    debugLog("Bazarr", `Response: ${text.substring(0, 200)}${text.length > 200 ? "..." : ""}`)
    if (!text) return {} as T

    return JSON.parse(text) as T
  }

  /**
   * Check if Bazarr is healthy and reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      // System ping doesn't require authentication
      await this.request("/system/ping")
      return true
    } catch {
      return false
    }
  }

  /**
   * Get current system settings
   */
  async getSettings(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/system/settings")
  }

  /**
   * Update authentication settings to enable form-based auth
   *
   * @param username - Username for web UI login
   * @param password - Password for web UI login
   * @param override - If true, override existing auth settings
   */
  async enableFormAuth(username: string, password: string, override = false): Promise<boolean> {
    try {
      // First get current settings to check if auth is already configured
      const currentSettings = await this.getSettings()
      const currentAuth = (currentSettings as { auth?: { type?: string } }).auth

      // Skip if auth is already configured and override is false
      if (currentAuth?.type && currentAuth.type !== "None" && !override) {
        debugLog("Bazarr", "Auth already configured, skipping")
        return false
      }

      debugLog("Bazarr", `Current auth type: ${currentAuth?.type || "None"}`)

      // Bazarr expects settings as a nested object
      // POST to /api/system/settings with the auth object
      const settingsPayload = {
        general: {
          use_sonarr: true,
          use_radarr: true,
        },
        auth: {
          type: "form",
          username,
          password,
        },
      }

      debugLog("Bazarr", `Attempting to set form auth for user: ${username}`)
      await this.request("/system/settings", {
        method: "POST",
        body: JSON.stringify(settingsPayload),
      })

      debugLog("Bazarr", `Form auth enabled for user: ${username}`)
      return true
    } catch (e) {
      debugLog("Bazarr", `Failed to enable form auth: ${e}`)
      throw e
    }
  }

  /**
   * Get API key from settings
   */
  async getApiKey(): Promise<string | null> {
    try {
      const settings = await this.getSettings()
      const auth = (settings as unknown as BazarrAuthSettings).auth
      return auth?.apikey || null
    } catch {
      return null
    }
  }

  /**
   * Update Bazarr settings
   */
  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    debugLog("Bazarr", `Updating settings: ${JSON.stringify(settings)}`)
    await this.request("/system/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    })
    debugLog("Bazarr", "Settings updated successfully")
  }

  /**
   * Configure Radarr connection in Bazarr
   */
  async configureRadarr(host: string, port: number, apiKey: string): Promise<boolean> {
    try {
      debugLog("Bazarr", `Configuring Radarr connection: ${host}:${port}`)

      const settings = {
        radarr: {
          ip: host,
          port: port,
          apikey: apiKey,
          base_url: "",
          ssl: false,
        },
        general: {
          use_radarr: true,
        },
      }

      await this.updateSettings(settings)
      debugLog("Bazarr", "Radarr connection configured successfully")
      return true
    } catch (e) {
      debugLog("Bazarr", `Failed to configure Radarr: ${e}`)
      throw e
    }
  }

  /**
   * Configure Sonarr connection in Bazarr
   */
  async configureSonarr(host: string, port: number, apiKey: string): Promise<boolean> {
    try {
      debugLog("Bazarr", `Configuring Sonarr connection: ${host}:${port}`)

      const settings = {
        sonarr: {
          ip: host,
          port: port,
          apikey: apiKey,
          base_url: "",
          ssl: false,
        },
        general: {
          use_sonarr: true,
        },
      }

      await this.updateSettings(settings)
      debugLog("Bazarr", "Sonarr connection configured successfully")
      return true
    } catch (e) {
      debugLog("Bazarr", `Failed to configure Sonarr: ${e}`)
      throw e
    }
  }
}
