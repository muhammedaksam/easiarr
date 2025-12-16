/**
 * Huntarr API Client
 * Provides health check, version info, and auto-setup for Huntarr
 * Configures Sonarr, Radarr, Lidarr, Readarr, Whisparr instances automatically
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"
import type { AppConfig } from "../config/schema"

interface HuntarrVersion {
  version: string
}

interface TestConnectionResult {
  success: boolean
  message?: string
  version?: string
}

/** Huntarr instance configuration */
interface HuntarrInstance {
  name: string
  api_url: string
  api_key: string
  enabled?: boolean
  [key: string]: unknown
}

/** Huntarr app settings with instances array */
interface HuntarrAppSettings {
  instances?: HuntarrInstance[]
  [key: string]: unknown
}

/** Huntarr-supported *arr app types */
const HUNTARR_APP_TYPES = ["sonarr", "radarr", "lidarr", "readarr", "whisparr"] as const
type HuntarrAppType = (typeof HUNTARR_APP_TYPES)[number]

export class HuntarrClient implements IAutoSetupClient {
  private host: string
  private port: number
  private sessionCookie: string | null = null

  constructor(host: string, port: number = 9705) {
    this.host = host
    this.port = port
  }

  /**
   * Get base URL for Huntarr
   */
  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  /**
   * Get headers with session cookie if available
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    }
    if (this.sessionCookie) {
      headers["Cookie"] = `huntarr_session=${this.sessionCookie}`
    }
    return headers
  }

  /**
   * Check if a user has been created in Huntarr
   */
  async userExists(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/setup/status`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      })
      const data = await response.json()
      return data.user_exists === true
    } catch {
      return false
    }
  }

  /**
   * Create a user in Huntarr (first-time setup)
   */
  async createUser(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          confirm_password: password,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        // Extract session cookie from response
        const setCookie = response.headers.get("set-cookie")
        if (setCookie) {
          const match = setCookie.match(/huntarr_session=([^;]+)/)
          if (match) {
            this.sessionCookie = match[1]
            debugLog("HuntarrApi", "Created user and got session cookie")
          }
        }

        // Complete setup wizard (saves progress then clears)
        await this.completeSetup(username)
        return true
      }

      // Log error details
      const errorBody = await response.text()
      debugLog("HuntarrApi", `Create user failed: ${response.status} - ${errorBody}`)
    } catch (error) {
      debugLog("HuntarrApi", `Create user error: ${error}`)
    }
    return false
  }

  /**
   * Complete setup by saving progress then clearing
   */
  async completeSetup(username: string): Promise<boolean> {
    try {
      // First save progress with all steps completed
      const progress = {
        current_step: 6,
        completed_steps: [1, 2, 3, 4, 5],
        account_created: true,
        two_factor_enabled: false,
        plex_setup_done: false,
        auth_mode_selected: false,
        recovery_key_generated: true,
        username,
        timestamp: new Date().toISOString(),
      }

      const saveResponse = await fetch(`${this.baseUrl}/api/setup/progress`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ progress }),
        signal: AbortSignal.timeout(5000),
      })

      if (!saveResponse.ok) {
        debugLog("HuntarrApi", `Failed to save setup progress: ${saveResponse.status}`)
        return false
      }
      debugLog("HuntarrApi", "Saved setup progress with all steps completed")

      // Then clear the setup progress
      const clearResponse = await fetch(`${this.baseUrl}/api/setup/clear`, {
        method: "POST",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      })

      if (clearResponse.ok) {
        debugLog("HuntarrApi", "Cleared setup progress")
        return true
      }

      debugLog("HuntarrApi", `Failed to clear setup: ${clearResponse.status}`)
    } catch (error) {
      debugLog("HuntarrApi", `Complete setup error: ${error}`)
    }
    return false
  }

  /**
   * Login to Huntarr and get session cookie
   */
  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        const setCookie = response.headers.get("set-cookie")
        if (setCookie) {
          const match = setCookie.match(/huntarr_session=([^;]+)/)
          if (match) {
            this.sessionCookie = match[1]
            debugLog("HuntarrApi", "Logged in and got session cookie")
            return true
          }
        }
        // Even without cookie extraction, check response
        const data = await response.json()
        return data.success === true
      }

      debugLog("HuntarrApi", `Login failed: ${response.status}`)
    } catch (error) {
      debugLog("HuntarrApi", `Login error: ${error}`)
    }
    return false
  }

  /**
   * Authenticate with Huntarr - creates user if needed, otherwise logs in
   */
  async authenticate(username: string, password: string): Promise<boolean> {
    // First check if user exists
    const exists = await this.userExists()

    if (!exists) {
      // No user yet - create one
      debugLog("HuntarrApi", "No user exists, creating...")
      return await this.createUser(username, password)
    }

    // User exists - try to login
    debugLog("HuntarrApi", "User exists, logging in...")
    return await this.login(username, password)
  }

  /**
   * Check if Huntarr is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      })
      debugLog("HuntarrApi", `Health check: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("HuntarrApi", `Health check failed: ${error}`)
      return false
    }
  }

  /**
   * Check if Huntarr has any *arr apps configured
   */
  async isInitialized(): Promise<boolean> {
    // Huntarr is considered initialized if we can reach it
    // Actual instance configuration happens via setup()
    return this.isHealthy()
  }

  /**
   * Get Huntarr version
   * Uses the /api/version endpoint (unauthenticated)
   */
  async getVersion(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        const data = (await response.json()) as HuntarrVersion
        debugLog("HuntarrApi", `Version: ${data.version}`)
        return data.version
      }

      debugLog("HuntarrApi", `Failed to get version: ${response.status}`)
    } catch (error) {
      debugLog("HuntarrApi", `Error getting version: ${error}`)
    }
    return null
  }

  /**
   * Test connection to an *arr app via Huntarr
   */
  async testConnection(appType: HuntarrAppType, apiUrl: string, apiKey: string): Promise<TestConnectionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/${appType}/test-connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_url: apiUrl,
          api_key: apiKey,
          api_timeout: 30,
        }),
        signal: AbortSignal.timeout(35000),
      })

      const data = (await response.json()) as TestConnectionResult
      debugLog("HuntarrApi", `Test ${appType} connection: ${data.success} - ${data.message}`)
      return data
    } catch (error) {
      debugLog("HuntarrApi", `Test connection error for ${appType}: ${error}`)
      return { success: false, message: `${error}` }
    }
  }

  /**
   * Get current settings for an *arr app from Huntarr
   */
  async getSettings(appType: HuntarrAppType): Promise<HuntarrAppSettings | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/settings/${appType}`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        const data = (await response.json()) as HuntarrAppSettings
        debugLog("HuntarrApi", `Got ${appType} settings: ${data.instances?.length ?? 0} instances`)
        return data
      }

      debugLog("HuntarrApi", `Failed to get ${appType} settings: ${response.status}`)
    } catch (error) {
      debugLog("HuntarrApi", `Error getting ${appType} settings: ${error}`)
    }
    return null
  }

  /**
   * Save settings for an *arr app to Huntarr
   * This adds/updates the app instance configuration
   */
  async saveSettings(appType: HuntarrAppType, settings: HuntarrAppSettings): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/settings/${appType}`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(settings),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        debugLog("HuntarrApi", `Saved ${appType} settings successfully`)
        return true
      }

      debugLog("HuntarrApi", `Failed to save ${appType} settings: ${response.status}`)
    } catch (error) {
      debugLog("HuntarrApi", `Error saving ${appType} settings: ${error}`)
    }
    return false
  }

  /**
   * Add an *arr app instance to Huntarr
   * Gets current settings, adds new instance if not exists, saves
   */
  async addArrInstance(appType: HuntarrAppType, name: string, apiUrl: string, apiKey: string): Promise<boolean> {
    try {
      // Get current settings (preserve all other app settings)
      const settings = await this.getSettings(appType)

      if (!settings) {
        // If no settings exist, create minimal structure
        return await this.saveSettings(appType, {
          instances: [{ name, api_url: apiUrl, api_key: apiKey, enabled: true }],
        })
      }

      // Initialize instances array if needed
      if (!settings.instances) settings.instances = []

      // Check if instance with same URL already exists and is configured
      const existingByUrl = settings.instances.find((i) => i.api_url === apiUrl && i.api_key)
      if (existingByUrl) {
        debugLog("HuntarrApi", `Instance for ${apiUrl} already configured in ${appType}`)
        return true
      }

      // Check if there's a default/empty instance we can update
      const emptyInstance = settings.instances.find((i) => !i.api_url || !i.api_key)
      if (emptyInstance) {
        // Update the existing empty instance
        emptyInstance.name = name
        emptyInstance.api_url = apiUrl
        emptyInstance.api_key = apiKey
        emptyInstance.enabled = true
        debugLog("HuntarrApi", `Updated default instance in ${appType}`)
      } else {
        // Add new instance
        settings.instances.push({
          name,
          api_url: apiUrl,
          api_key: apiKey,
          enabled: true,
        })
        debugLog("HuntarrApi", `Added new instance to ${appType}`)
      }

      // Save updated settings (preserves all other app settings)
      return await this.saveSettings(appType, settings)
    } catch (error) {
      debugLog("HuntarrApi", `Error adding ${appType} instance: ${error}`)
      return false
    }
  }

  /**
   * Run auto-setup process for Huntarr
   * Tests connections to all enabled *arr apps
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { env } = options
    const results: Array<{ app: string; success: boolean; message?: string }> = []

    try {
      // Check if Huntarr is reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Huntarr not reachable" }
      }

      // Get Huntarr version for logging
      const version = await this.getVersion()
      debugLog("HuntarrApi", `Huntarr version: ${version}`)

      // Import registry to get app ports
      const { getApp } = await import("../apps/registry")

      // Test connections for each *arr app that has an API key
      // Note: Use setupEasiarrApps() for filtering by enabled apps
      for (const appType of HUNTARR_APP_TYPES) {
        const apiKeyEnvName = `API_KEY_${appType.toUpperCase()}`
        const apiKey = env[apiKeyEnvName]

        if (!apiKey) {
          debugLog("HuntarrApi", `Skipping ${appType} - no API key in env`)
          continue
        }

        // Get port from registry
        const appDef = getApp(appType)
        const port = appDef?.defaultPort ?? 8989
        const apiUrl = `http://${appType}:${port}`
        debugLog("HuntarrApi", `Testing ${appType} at ${apiUrl}`)

        const result = await this.testConnection(appType, apiUrl, apiKey)
        results.push({
          app: appType,
          success: result.success,
          message: result.message,
        })
      }

      // Summarize results
      const successCount = results.filter((r) => r.success).length
      const failCount = results.filter((r) => !r.success).length

      if (results.length === 0) {
        return {
          success: true,
          message: "No *arr apps configured with API keys",
          data: { version },
        }
      }

      if (failCount === 0) {
        return {
          success: true,
          message: `All ${successCount} *arr connections verified`,
          data: { version, results },
        }
      }

      return {
        success: successCount > 0,
        message: `${successCount} succeeded, ${failCount} failed. Configure failed apps in Huntarr web UI.`,
        data: { version, results },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }

  /**
   * Auto-configure Huntarr with enabled *arr apps
   * Actually adds/updates app instances in Huntarr settings
   */
  async setupEasiarrApps(
    apps: AppConfig[],
    env: Record<string, string>
  ): Promise<{
    added: number
    skipped: number
    results: Array<{ app: string; success: boolean; message?: string }>
  }> {
    const results: Array<{ app: string; success: boolean; message?: string }> = []
    const { getApp } = await import("../apps/registry")

    for (const appConfig of apps) {
      if (!appConfig.enabled) continue

      // Only process *arr apps that Huntarr supports
      if (!HUNTARR_APP_TYPES.includes(appConfig.id as HuntarrAppType)) continue

      const appType = appConfig.id as HuntarrAppType
      const apiKey = env[`API_KEY_${appType.toUpperCase()}`]

      if (!apiKey) {
        debugLog("HuntarrApi", `Skipping ${appType} - no API key`)
        continue
      }

      // Get port from registry
      const appDef = getApp(appType)
      const port = appDef?.defaultPort ?? 8989
      const apiUrl = `http://${appType}:${port}`
      const instanceName = appDef?.name ?? appType

      debugLog("HuntarrApi", `Adding ${appType} instance to Huntarr`)
      const added = await this.addArrInstance(appType, instanceName, apiUrl, apiKey)
      results.push({
        app: appType,
        success: added,
        message: added ? "Added to Huntarr" : "Failed to add",
      })
    }

    return {
      added: results.filter((r) => r.success).length,
      skipped: results.filter((r) => !r.success).length,
      results,
    }
  }
}
