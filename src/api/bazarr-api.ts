/**
 * Bazarr API Client
 * Handles Bazarr-specific API calls for authentication and settings
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

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
 * Note: Bazarr uses form data for POST, not JSON!
 */
export class BazarrApiClient implements IAutoSetupClient {
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
   * Make a GET request to Bazarr API (JSON response)
   */
  private async get<T>(endpoint: string): Promise<T> {
    let url = `${this.baseUrl}/api${endpoint}`
    if (this.apiKey) {
      url = `${url}${url.includes("?") ? "&" : "?"}apikey=${this.apiKey}`
    }

    debugLog("Bazarr", `GET ${url}`)

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      debugLog("Bazarr", `Error ${response.status}: ${errorText}`)
      throw new Error(`Bazarr API error: ${response.status} ${response.statusText}`)
    }

    const text = await response.text()
    debugLog("Bazarr", `Response: ${text.substring(0, 200)}${text.length > 200 ? "..." : ""}`)
    if (!text) return {} as T

    return JSON.parse(text) as T
  }

  /**
   * Make a POST request to Bazarr API using form data (NOT JSON)
   * Bazarr uses request.form, not request.json
   */
  private async postForm(endpoint: string, data: Record<string, string>): Promise<void> {
    let url = `${this.baseUrl}/api${endpoint}`
    if (this.apiKey) {
      url = `${url}${url.includes("?") ? "&" : "?"}apikey=${this.apiKey}`
    }

    // Convert object to form data
    const formData = new URLSearchParams()
    for (const [key, value] of Object.entries(data)) {
      formData.append(key, value)
    }

    debugLog("Bazarr", `POST ${url}`)
    debugLog("Bazarr", `Form data: ${formData.toString()}`)

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      debugLog("Bazarr", `Error ${response.status}: ${errorText}`)
      throw new Error(`Bazarr API error: ${response.status} ${response.statusText}`)
    }

    debugLog("Bazarr", `Response status: ${response.status}`)
  }

  /**
   * Check if Bazarr is healthy and reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.get("/system/status")
      return true
    } catch {
      return false
    }
  }

  /**
   * Get current system settings
   */
  async getSettings(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>("/system/settings")
  }

  /**
   * Update authentication settings to enable form-based auth
   * Bazarr settings use dot notation in form fields
   */
  async enableFormAuth(username: string, password: string, override = false): Promise<boolean> {
    try {
      // First get current settings to check if auth is already configured
      const currentSettings = await this.getSettings()
      const currentAuth = (currentSettings as { auth?: { type?: string } }).auth

      // Skip if auth is already configured and override is false
      if (currentAuth?.type && currentAuth.type !== "None" && currentAuth.type !== null && !override) {
        debugLog("Bazarr", `Auth already configured (type: ${currentAuth.type}), skipping`)
        return false
      }

      debugLog("Bazarr", `Current auth type: ${currentAuth?.type || "None"}`)
      debugLog("Bazarr", `Setting form auth for user: ${username}`)

      // Bazarr uses dot notation for nested settings in form data
      await this.postForm("/system/settings", {
        "settings-auth-type": "form",
        "settings-auth-username": username,
        "settings-auth-password": password,
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
   * Set base URL for external access
   * URL will be used for links to Bazarr from other apps
   */
  async setBaseUrl(baseUrl: string): Promise<boolean> {
    try {
      debugLog("Bazarr", `Setting base URL to: ${baseUrl}`)

      await this.postForm("/system/settings", {
        "settings-general-base_url": baseUrl,
      })

      debugLog("Bazarr", "Base URL set successfully")
      return true
    } catch (e) {
      debugLog("Bazarr", `Failed to set base URL: ${e}`)
      return false
    }
  }

  /**
   * Configure Radarr connection in Bazarr
   */
  async configureRadarr(host: string, port: number, apiKey: string): Promise<boolean> {
    try {
      debugLog("Bazarr", `Configuring Radarr connection: ${host}:${port}`)

      await this.postForm("/system/settings", {
        "settings-radarr-ip": host,
        "settings-radarr-port": String(port),
        "settings-radarr-apikey": apiKey,
        "settings-radarr-base_url": "",
        "settings-radarr-ssl": "false",
        "settings-general-use_radarr": "true",
      })

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

      await this.postForm("/system/settings", {
        "settings-sonarr-ip": host,
        "settings-sonarr-port": String(port),
        "settings-sonarr-apikey": apiKey,
        "settings-sonarr-base_url": "",
        "settings-sonarr-ssl": "false",
        "settings-general-use_sonarr": "true",
      })

      debugLog("Bazarr", "Sonarr connection configured successfully")
      return true
    } catch (e) {
      debugLog("Bazarr", `Failed to configure Sonarr: ${e}`)
      throw e
    }
  }

  /**
   * Check if already configured (has auth set up)
   */
  async isInitialized(): Promise<boolean> {
    try {
      const settings = await this.getSettings()
      const auth = (settings as { auth?: { type?: string } }).auth
      return !!auth?.type && auth.type !== "None"
    } catch {
      return false
    }
  }

  /**
   * Run the auto-setup process for Bazarr
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Bazarr not reachable" }
      }

      // Get API key first (needed for subsequent requests)
      const apiKey = await this.getApiKey()
      if (apiKey) {
        this.setApiKey(apiKey)
      }

      // Check if auth already configured
      const initialized = await this.isInitialized()
      let authConfigured = false

      if (!initialized) {
        // Enable form auth
        authConfigured = await this.enableFormAuth(username, password)
      }

      return {
        success: true,
        message: initialized ? "Already configured" : authConfigured ? "Auth enabled" : "Ready",
        data: { apiKey, authConfigured },
        envUpdates: apiKey ? { API_KEY_BAZARR: apiKey } : undefined,
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
