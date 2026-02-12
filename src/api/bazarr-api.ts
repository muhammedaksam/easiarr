/**
 * Bazarr API Client
 * Handles Bazarr-specific API calls for authentication and settings
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { debugLog } from "~/utils/debug"
import { BaseApiClient } from "./base-api"

/**
 * Bazarr Language Profile Structure
 */
export interface BazarrLanguageProfile {
  name: string
  cutoff: string
  languages: {
    code: string
    forced: boolean
    hi: boolean
  }[]
}

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
export class BazarrApiClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "Bazarr"
  private apiKey: string | null = null

  constructor(host: string, port: number) {
    super(host, port)
  }

  /**
   * Set API key for authentication
   */
  setApiKey(key: string): void {
    this.apiKey = key
    debugLog("Bazarr", `API key set`)
  }

  /**
   * Build API URL with optional API key
   */
  private buildApiUrlWithKey(endpoint: string): string {
    let url = `${this.baseUrl}/api${endpoint}`
    if (this.apiKey) {
      url = `${url}${url.includes("?") ? "&" : "?"}apikey=${this.apiKey}`
    }
    return url
  }

  /**
   * Make a GET request to Bazarr API
   */
  private async getJson<T>(endpoint: string): Promise<T> {
    const url = this.buildApiUrlWithKey(endpoint)
    debugLog("Bazarr", `GET ${url}`)

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      throw new Error(`Bazarr API error: ${response.status} ${response.statusText}`)
    }

    const text = await response.text()
    if (!text) return {} as T
    return JSON.parse(text) as T
  }

  /**
   * Make a POST request using form data (NOT JSON)
   */
  private async postForm(endpoint: string, data: Record<string, string>): Promise<void> {
    const url = this.buildApiUrlWithKey(endpoint)
    const formData = new URLSearchParams()
    for (const [key, value] of Object.entries(data)) {
      formData.append(key, value)
    }

    debugLog("Bazarr", `POST ${url}`)

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    })

    if (!response.ok) {
      throw new Error(`Bazarr API error: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Check if Bazarr is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.getJson("/system/status")
      return true
    } catch {
      return false
    }
  }

  /**
   * Get current system settings
   */
  async getSettings(): Promise<Record<string, unknown>> {
    return this.getJson<Record<string, unknown>>("/system/settings")
  }

  /**
   * Update authentication settings
   */
  async enableFormAuth(username: string, password: string, override = false): Promise<boolean> {
    try {
      const currentSettings = await this.getSettings()
      const currentAuth = (currentSettings as { auth?: { type?: string } }).auth

      if (currentAuth?.type && currentAuth.type !== "None" && !override) {
        debugLog("Bazarr", `Auth already configured (type: ${currentAuth.type}), skipping`)
        return false
      }

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
   * Configure Radarr connection
   */
  async configureRadarr(host: string, port: number, apiKey: string): Promise<boolean> {
    await this.postForm("/system/settings", {
      "settings-radarr-ip": host,
      "settings-radarr-port": String(port),
      "settings-radarr-apikey": apiKey,
      "settings-radarr-base_url": "",
      "settings-radarr-ssl": "false",
      "settings-general-use_radarr": "true",
    })
    return true
  }

  /**
   * Configure Sonarr connection
   */
  async configureSonarr(host: string, port: number, apiKey: string): Promise<boolean> {
    await this.postForm("/system/settings", {
      "settings-sonarr-ip": host,
      "settings-sonarr-port": String(port),
      "settings-sonarr-apikey": apiKey,
      "settings-sonarr-base_url": "",
      "settings-sonarr-ssl": "false",
      "settings-general-use_sonarr": "true",
    })
    return true
  }

  /**
   * Check if already configured
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
   * Configure General Settings
   */
  async configureGeneralSettings(): Promise<boolean> {
    try {
      await this.postForm("/system/settings", {
        "settings-subtitles-use_embedded_subtitles": "true",
        "settings-subtitles-autosearch": "true",
        "settings-subtitles-path_mapping": "",
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get all language profiles
   */
  async getLanguageProfiles(): Promise<BazarrLanguageProfile[]> {
    return this.getJson<BazarrLanguageProfile[]>("/system/languages/profiles")
  }

  /**
   * Configure Default Language Profile
   */
  async configureDefaultLanguageProfile(name = "English", language = "en"): Promise<boolean> {
    try {
      const profiles = (await this.getLanguageProfiles()) || []
      const existing = profiles.find((p) => p.name === name)

      if (existing) {
        return true
      }

      const newProfile: BazarrLanguageProfile = {
        name,
        cutoff: language,
        languages: [{ code: language, forced: false, hi: false }],
      }

      profiles.push(newProfile)
      await this.postForm("/system/settings", {
        languages_profiles: JSON.stringify(profiles),
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Run the auto-setup process
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Bazarr not reachable" }
      }

      const apiKey = await this.getApiKey()
      if (apiKey) {
        this.setApiKey(apiKey)
      }

      const initialized = await this.isInitialized()
      let authConfigured = false

      if (!initialized) {
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
