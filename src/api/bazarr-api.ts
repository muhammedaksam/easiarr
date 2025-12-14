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

    // Add API key as query parameter for GET, in body for POST
    let finalUrl = url
    if (this.apiKey && options.method !== "POST") {
      finalUrl = `${url}${url.includes("?") ? "&" : "?"}apikey=${this.apiKey}`
    }

    debugLog("Bazarr", `${options.method || "GET"} ${finalUrl}`)

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

      await this.request("/system/settings", {
        method: "PATCH",
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
}
