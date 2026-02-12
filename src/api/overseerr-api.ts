/**
 * Overseerr API Client
 * Handles Overseerr auto-setup for Plex media requests
 * Fully automated using Plex token authentication
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { debugLog } from "~/utils/debug"
import { BaseApiClient } from "./base-api"

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

export class OverseerrClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "OverseerrApi"
  private apiKey?: string
  private sessionCookie?: string

  constructor(host: string, port: number = 5055, apiKey?: string) {
    super(host, port)
    this.apiKey = apiKey
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
    const response = await this.get<OverseerrStatus>("/api/v1/status")
    return response.success
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
        const setCookie = response.headers.get("set-cookie")
        if (setCookie) {
          this.sessionCookie = setCookie.split(";")[0]
        }
        return await response.json()
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Get available Plex servers
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
   * Initialize Overseerr
   */
  async initialize(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/initialize`, {
        method: "POST",
        headers: this.getHeaders(),
      })
      return response.ok
    } catch {
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
   * Set application URL
   */
  async setApplicationUrl(applicationUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/main`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ applicationUrl }),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Sync Plex libraries
   */
  async syncPlexLibraries(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/plex/library?sync=true`, {
        method: "GET",
        headers: this.getHeaders(),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Start a full Plex library scan
   */
  async startPlexScan(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/settings/plex/sync`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ start: true }),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get Overseerr status
   */
  async getStatus(): Promise<OverseerrStatus | null> {
    const response = await this.get<OverseerrStatus>("/api/v1/status")
    return response.data ?? null
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
    const response = await fetch(`${this.baseUrl}/api/v1/settings/plex`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(settings),
    })
    return response.ok
  }

  /**
   * Add Radarr server
   */
  async addRadarrServer(settings: RadarrSettings): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/v1/settings/radarr`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(settings),
    })
    return response.ok
  }

  /**
   * Add Sonarr server
   */
  async addSonarrServer(settings: SonarrSettings): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/v1/settings/sonarr`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(settings),
    })
    return response.ok
  }

  /**
   * Run the auto-setup process
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Overseerr not reachable" }
      }

      const initialized = await this.isInitialized()
      if (initialized) {
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

      const plexToken = options.plexToken || process.env.API_KEY_PLEX
      if (!plexToken) {
        return {
          success: false,
          message: "Plex token required (set API_KEY_PLEX env var)",
        }
      }

      const user = await this.authenticateWithPlex(plexToken)
      if (!user) {
        return { success: false, message: "Failed to authenticate with Plex" }
      }

      const servers = await this.getPlexServers()
      if (servers.length > 0) {
        const server = servers[0]
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

      await this.syncPlexLibraries()

      const initSuccess = await this.initialize()
      if (!initSuccess) {
        return { success: false, message: "Failed to initialize Overseerr" }
      }

      const settings = await this.getMainSettings()
      const apiKey = settings?.apiKey

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
