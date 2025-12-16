/**
 * Overseerr API Client
 * Handles Overseerr auto-setup for Plex media requests
 * Fully automated using Plex token authentication
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

interface OverseerrStatus {
  version: string
  status: number
}

interface OverseerrUser {
  id: number
  email: string
  username?: string
  plexToken?: string
  plexUsername?: string
  userType: number
  permissions: number
  avatar?: string
}

interface PlexSettings {
  name: string
  machineId: string
  ip: string
  port: number
  useSsl?: boolean
  libraries: { id: string; name: string; enabled: boolean }[]
}

interface PlexDevice {
  name: string
  clientIdentifier: string
  connection: { uri: string; local: boolean }[]
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
  minimumAvailability?: string
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

interface MainSettings {
  apiKey: string
  applicationTitle?: string
  applicationUrl?: string
}

export class OverseerrClient implements IAutoSetupClient {
  private host: string
  private port: number
  private apiKey?: string
  private sessionCookie?: string

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
    if (this.sessionCookie) {
      headers["Cookie"] = this.sessionCookie
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
   * Authenticate with Overseerr using a Plex token
   * If no users exist, this creates an admin user automatically
   */
  async authenticateWithPlex(plexToken: string): Promise<OverseerrUser | null> {
    debugLog("OverseerrApi", "Authenticating with Plex token...")

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/plex`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ authToken: plexToken }),
      })

      if (response.ok) {
        // Extract session cookie for subsequent requests
        const setCookie = response.headers.get("set-cookie")
        if (setCookie) {
          this.sessionCookie = setCookie.split(";")[0]
          debugLog("OverseerrApi", "Session cookie obtained")
        }

        const user = await response.json()
        debugLog("OverseerrApi", `Authenticated as user: ${user.email || user.plexUsername}`)
        return user
      }

      const text = await response.text()
      debugLog("OverseerrApi", `Plex auth failed: ${response.status} - ${text}`)
      return null
    } catch (error) {
      debugLog("OverseerrApi", `Plex auth error: ${error}`)
      return null
    }
  }

  /**
   * Get available Plex servers for the authenticated user
   */
  async getPlexServers(): Promise<PlexDevice[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/plex/devices/servers`, {
        method: "GET",
        headers: this.getHeaders(),
      })

      if (response.ok) {
        return response.json()
      }
    } catch {
      // Ignore
    }
    return []
  }

  /**
   * Initialize/finalize the Overseerr setup
   * This marks the application as configured
   */
  async initialize(): Promise<boolean> {
    debugLog("OverseerrApi", "Finalizing Overseerr initialization...")

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/initialize`, {
        method: "POST",
        headers: this.getHeaders(),
      })

      if (response.ok) {
        debugLog("OverseerrApi", "Overseerr initialized successfully")
        return true
      }

      const text = await response.text()
      debugLog("OverseerrApi", `Initialize failed: ${response.status} - ${text}`)
      return false
    } catch (error) {
      debugLog("OverseerrApi", `Initialize error: ${error}`)
      return false
    }
  }

  /**
   * Get main settings (includes API key)
   */
  async getMainSettings(): Promise<MainSettings | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/main`, {
        method: "GET",
        headers: this.getHeaders(),
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
   * Set application URL for external access
   * URL will be used for links to Overseerr from other apps
   */
  async setApplicationUrl(applicationUrl: string): Promise<boolean> {
    debugLog("OverseerrApi", `Setting applicationUrl to: ${applicationUrl}`)

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/main`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ applicationUrl }),
      })

      if (response.ok) {
        debugLog("OverseerrApi", "Application URL set successfully")
        return true
      }
    } catch (error) {
      debugLog("OverseerrApi", `Failed to set application URL: ${error}`)
    }
    return false
  }

  /**
   * Sync Plex libraries
   */
  async syncPlexLibraries(): Promise<boolean> {
    debugLog("OverseerrApi", "Syncing Plex libraries...")

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/plex/library?sync=true`, {
        method: "GET",
        headers: this.getHeaders(),
      })

      if (response.ok) {
        debugLog("OverseerrApi", "Plex libraries synced")
        return true
      }
    } catch {
      // Ignore
    }
    return false
  }

  /**
   * Start a full Plex library scan
   */
  async startPlexScan(): Promise<boolean> {
    debugLog("OverseerrApi", "Starting Plex library scan...")

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/plex/sync`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ start: true }),
      })

      if (response.ok) {
        debugLog("OverseerrApi", "Plex scan started")
        return true
      }
    } catch {
      // Ignore
    }
    return false
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
   * Fully automated using Plex token
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Overseerr not reachable" }
      }

      // Check if already initialized
      const initialized = await this.isInitialized()
      if (initialized) {
        // Try to get API key if we have session
        const settings = await this.getMainSettings()
        if (settings?.apiKey) {
          return {
            success: true,
            message: "Already configured",
            data: { apiKey: settings.apiKey },
          }
        }
        return { success: true, message: "Already configured" }
      }

      // Need Plex token to proceed
      const plexToken = options.plexToken || process.env.PLEX_TOKEN
      if (!plexToken) {
        return {
          success: false,
          message: "Plex token required (set PLEX_TOKEN env var)",
        }
      }

      // Step 1: Authenticate with Plex token (creates admin user if first run)
      debugLog("OverseerrApi", "Step 1: Authenticating with Plex token...")
      const user = await this.authenticateWithPlex(plexToken)
      if (!user) {
        return { success: false, message: "Failed to authenticate with Plex" }
      }

      // Step 2: Get available Plex servers and configure
      debugLog("OverseerrApi", "Step 2: Getting Plex servers...")
      const servers = await this.getPlexServers()
      if (servers.length > 0) {
        const server = servers[0]
        // Find local connection
        const localConn = server.connection.find((c) => c.local) || server.connection[0]
        if (localConn) {
          const url = new URL(localConn.uri)
          await this.updatePlexSettings({
            name: server.name,
            ip: url.hostname,
            port: parseInt(url.port) || 32400,
          })
        }
      }

      // Step 3: Sync Plex libraries
      debugLog("OverseerrApi", "Step 3: Syncing Plex libraries...")
      await this.syncPlexLibraries()

      // Step 4: Initialize Overseerr
      debugLog("OverseerrApi", "Step 4: Initializing Overseerr...")
      const initSuccess = await this.initialize()
      if (!initSuccess) {
        return { success: false, message: "Failed to initialize Overseerr" }
      }

      // Step 5: Get API key for future use
      debugLog("OverseerrApi", "Step 5: Getting API key...")
      const settings = await this.getMainSettings()
      const apiKey = settings?.apiKey

      // Step 6: Start library scan in background
      debugLog("OverseerrApi", "Step 6: Starting Plex library scan...")
      await this.startPlexScan()

      return {
        success: true,
        message: "Overseerr configured successfully",
        data: apiKey ? { apiKey } : undefined,
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
