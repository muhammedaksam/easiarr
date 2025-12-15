/**
 * Overseerr API Client
 * Handles Overseerr auto-setup for Plex media requests
 * Note: Overseerr setup requires Plex to be configured first
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

interface OverseerrStatus {
  version: string
  status: number
}

interface PlexSettings {
  name: string
  machineId: string
  ip: string
  port: number
  useSsl?: boolean
  libraries: { id: string; name: string; enabled: boolean }[]
}

interface RadarrSettings {
  name: string
  hostname: string
  port: number
  apiKey: string
  useSsl?: boolean
  baseUrl?: string
  activeProfileId: number
  activeDirectory: string
  is4k: boolean
  isDefault: boolean
}

interface SonarrSettings {
  name: string
  hostname: string
  port: number
  apiKey: string
  useSsl?: boolean
  baseUrl?: string
  activeProfileId: number
  activeDirectory: string
  activeAnimeProfileId?: number
  activeAnimeDirectory?: string
  is4k: boolean
  isDefault: boolean
  enableSeasonFolders: boolean
}

export class OverseerrClient implements IAutoSetupClient {
  private host: string
  private port: number
  private apiKey?: string

  constructor(host: string, port: number = 5055, apiKey?: string) {
    this.host = host
    this.port = port
    this.apiKey = apiKey
  }

  /**
   * Get base URL for Overseerr
   */
  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  /**
   * Common headers for Overseerr API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    }
    if (this.apiKey) {
      headers["X-Api-Key"] = this.apiKey
    }
    return headers
  }

  /**
   * Set API key for authenticated requests
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey
  }

  /**
   * Check if Overseerr is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/status`, {
        method: "GET",
      })
      debugLog("OverseerrApi", `Health check: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("OverseerrApi", `Health check failed: ${error}`)
      return false
    }
  }

  /**
   * Check if Overseerr is already configured
   */
  async isInitialized(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/public`, {
        method: "GET",
      })
      if (!response.ok) return false

      const data = await response.json()
      return data.initialized === true
    } catch {
      return false
    }
  }

  /**
   * Get Overseerr status
   */
  async getStatus(): Promise<OverseerrStatus | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/status`, {
        method: "GET",
      })
      if (response.ok) {
        return response.json()
      }
    } catch {
      // Ignore
    }
    return null
  }

  /**
   * Get current Plex settings
   */
  async getPlexSettings(): Promise<PlexSettings | null> {
    const response = await fetch(`${this.baseUrl}/api/v1/settings/plex`, {
      method: "GET",
      headers: this.getHeaders(),
    })

    if (response.ok) {
      return response.json()
    }
    return null
  }

  /**
   * Update Plex settings
   */
  async updatePlexSettings(settings: Partial<PlexSettings>): Promise<boolean> {
    debugLog("OverseerrApi", "Updating Plex settings...")

    const response = await fetch(`${this.baseUrl}/api/v1/settings/plex`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(settings),
    })

    if (response.ok) {
      debugLog("OverseerrApi", "Plex settings updated successfully")
      return true
    }

    const text = await response.text()
    debugLog("OverseerrApi", `Failed to update Plex settings: ${response.status} - ${text}`)
    return false
  }

  /**
   * Add Radarr server
   */
  async addRadarrServer(settings: RadarrSettings): Promise<boolean> {
    debugLog("OverseerrApi", `Adding Radarr server: ${settings.name}`)

    const response = await fetch(`${this.baseUrl}/api/v1/settings/radarr`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(settings),
    })

    if (response.ok) {
      debugLog("OverseerrApi", "Radarr server added successfully")
      return true
    }

    const text = await response.text()
    debugLog("OverseerrApi", `Failed to add Radarr: ${response.status} - ${text}`)
    return false
  }

  /**
   * Add Sonarr server
   */
  async addSonarrServer(settings: SonarrSettings): Promise<boolean> {
    debugLog("OverseerrApi", `Adding Sonarr server: ${settings.name}`)

    const response = await fetch(`${this.baseUrl}/api/v1/settings/sonarr`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(settings),
    })

    if (response.ok) {
      debugLog("OverseerrApi", "Sonarr server added successfully")
      return true
    }

    const text = await response.text()
    debugLog("OverseerrApi", `Failed to add Sonarr: ${response.status} - ${text}`)
    return false
  }

  /**
   * Run the auto-setup process for Overseerr
   * Note: Overseerr requires manual Plex authentication via web UI
   */
  async setup(_options: AutoSetupOptions): Promise<AutoSetupResult> {
    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Overseerr not reachable" }
      }

      // Check if already initialized
      const initialized = await this.isInitialized()
      if (initialized) {
        return { success: true, message: "Already configured" }
      }

      // Overseerr requires Plex OAuth flow which needs browser interaction
      // We can only check status, actual setup must be done via web UI
      return {
        success: false,
        message: "Requires manual Plex login at web UI",
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
