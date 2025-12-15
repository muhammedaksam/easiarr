/**
 * Jellyseerr API Client
 * Handles setup wizard automation and service configuration
 *
 * Based on Jellyseerr source code analysis:
 * - Auth endpoint: POST /api/v1/auth/jellyfin
 * - Setup mode: requires hostname, port, serverType (2=Jellyfin, 3=Emby), useSsl
 * - Login mode: only requires username and password (when server already configured)
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

// ==========================================
// Enums (from Jellyseerr server/constants/server.ts)
// ==========================================

export enum MediaServerType {
  PLEX = 1,
  JELLYFIN = 2,
  EMBY = 3,
  NOT_CONFIGURED = 4,
}

// ==========================================
// Types
// ==========================================

export interface JellyseerrPublicSettings {
  initialized: boolean
}

export interface JellyseerrMainSettings {
  apiKey: string
  appLanguage: string
  applicationTitle: string
  applicationUrl: string
  mediaServerType: number
  localLogin: boolean
  newPlexLogin: boolean
  defaultPermissions: number
}

export interface JellyseerrJellyfinSettings {
  name?: string
  ip?: string
  hostname?: string
  port?: number
  useSsl?: boolean
  urlBase?: string
  externalHostname?: string
  adminUser?: string
  adminPass?: string
  serverId?: string
  apiKey?: string
  libraries?: JellyseerrLibrary[]
}

export interface JellyseerrLibrary {
  id: string
  name: string
  enabled: boolean
}

export interface JellyseerrUser {
  id: number
  email: string
  username?: string
  jellyfinUsername?: string
  jellyfinUserId?: string
  userType: number
  permissions: number
  avatar?: string
}

export interface JellyseerrRadarrSettings {
  id?: number
  name: string
  hostname: string
  port: number
  apiKey: string
  useSsl: boolean
  baseUrl?: string
  activeProfileId: number
  activeProfileName: string
  activeDirectory: string
  is4k: boolean
  minimumAvailability: string
  isDefault: boolean
  syncEnabled?: boolean
  preventSearch?: boolean
  externalUrl?: string
}

export interface JellyseerrSonarrSettings {
  id?: number
  name: string
  hostname: string
  port: number
  apiKey: string
  useSsl: boolean
  baseUrl?: string
  activeProfileId: number
  activeProfileName: string
  activeDirectory: string
  activeLanguageProfileId?: number
  is4k: boolean
  enableSeasonFolders: boolean
  isDefault: boolean
  syncEnabled?: boolean
  preventSearch?: boolean
  externalUrl?: string
}

export interface ServiceProfile {
  id: number
  name: string
}

export interface ServiceTestResult {
  profiles: ServiceProfile[]
  rootFolders?: { id: number; path: string }[]
}

/** Auth request for initial setup (unconfigured server) */
interface JellyfinSetupAuthRequest {
  username: string
  password: string
  hostname: string
  port: number
  useSsl: boolean
  urlBase: string
  serverType: MediaServerType
  email?: string
}

/** Auth request for login (already configured server) */
interface JellyfinLoginRequest {
  username: string
  password: string
}

// ==========================================
// Client
// ==========================================

export class JellyseerrClient implements IAutoSetupClient {
  private baseUrl: string
  private cookie?: string

  constructor(host: string, port: number) {
    this.baseUrl = `http://${host}:${port}`
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    }

    if (this.cookie) {
      headers["Cookie"] = this.cookie
    }

    debugLog("Jellyseerr", `${options.method || "GET"} ${endpoint}`)

    const response = await fetch(url, {
      ...options,
      headers,
    })

    // Capture session cookie from auth responses
    const setCookie = response.headers.get("set-cookie")
    if (setCookie) {
      this.cookie = setCookie.split(";")[0]
      debugLog("Jellyseerr", "Session cookie captured")
    }

    if (!response.ok) {
      const text = await response.text()
      debugLog("Jellyseerr", `Error ${response.status}: ${text}`)
      throw new Error(`Jellyseerr API error: ${response.status} - ${text}`)
    }

    const contentType = response.headers.get("content-type")
    if (contentType?.includes("application/json")) {
      return response.json()
    }
    return {} as T
  }

  // ==========================================
  // Health & Status
  // ==========================================

  async isHealthy(): Promise<boolean> {
    try {
      await this.request<{ version: string }>("/status")
      return true
    } catch {
      return false
    }
  }

  async isInitialized(): Promise<boolean> {
    try {
      const settings = await this.request<JellyseerrPublicSettings>("/settings/public")
      return settings.initialized
    } catch {
      return false
    }
  }

  // ==========================================
  // Main Settings
  // ==========================================

  async getMainSettings(): Promise<JellyseerrMainSettings> {
    return this.request<JellyseerrMainSettings>("/settings/main")
  }

  async updateMainSettings(settings: Partial<JellyseerrMainSettings>): Promise<JellyseerrMainSettings> {
    return this.request<JellyseerrMainSettings>("/settings/main", {
      method: "POST",
      body: JSON.stringify(settings),
    })
  }

  /**
   * Mark the setup wizard as complete.
   * Must be called after configuring all settings.
   */
  async initialize(): Promise<{ initialized: boolean }> {
    return this.request<{ initialized: boolean }>("/settings/initialize", {
      method: "POST",
    })
  }

  // ==========================================
  // Jellyfin Configuration
  // ==========================================

  async getJellyfinSettings(): Promise<JellyseerrJellyfinSettings> {
    return this.request<JellyseerrJellyfinSettings>("/settings/jellyfin")
  }

  async updateJellyfinSettings(settings: Partial<JellyseerrJellyfinSettings>): Promise<JellyseerrJellyfinSettings> {
    return this.request<JellyseerrJellyfinSettings>("/settings/jellyfin", {
      method: "POST",
      body: JSON.stringify(settings),
    })
  }

  async syncJellyfinLibraries(): Promise<JellyseerrLibrary[]> {
    return this.request<JellyseerrLibrary[]>("/settings/jellyfin/library?sync=true")
  }

  async enableLibraries(libraryIds: string[]): Promise<JellyseerrLibrary[]> {
    const enable = libraryIds.join(",")
    return this.request<JellyseerrLibrary[]>(`/settings/jellyfin/library?enable=${encodeURIComponent(enable)}`)
  }

  // ==========================================
  // Authentication
  // ==========================================

  /**
   * Authenticate with Jellyfin credentials.
   *
   * This method handles two scenarios:
   * 1. Fresh setup: Sends full payload with hostname, port, serverType
   * 2. Already configured: If setup payload fails, retries with just username/password
   *
   * @param username - Jellyfin username
   * @param password - Jellyfin password
   * @param hostname - Jellyfin hostname (container name or IP)
   * @param port - Jellyfin port (default 8096)
   * @param email - Optional email for the Jellyseerr user
   */
  async authenticateJellyfin(
    username: string,
    password: string,
    hostname: string,
    port: number,
    email?: string
  ): Promise<JellyseerrUser> {
    // Attempt 1: Full setup payload (for fresh installs)
    const setupPayload: JellyfinSetupAuthRequest = {
      username,
      password,
      hostname,
      port,
      useSsl: false,
      urlBase: "",
      serverType: MediaServerType.JELLYFIN,
      email: email || `${username}@local`,
    }

    debugLog(
      "Jellyseerr",
      `Auth attempt with setup payload: hostname=${hostname}, port=${port}, serverType=${MediaServerType.JELLYFIN}`
    )

    try {
      return await this.request<JellyseerrUser>("/auth/jellyfin", {
        method: "POST",
        body: JSON.stringify(setupPayload),
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)

      // Check if server is already configured
      if (message.includes("already configured") || message.includes("hostname already configured")) {
        debugLog("Jellyseerr", "Server already configured, retrying with login-only payload")

        // Attempt 2: Login-only payload (server already configured)
        const loginPayload: JellyfinLoginRequest = {
          username,
          password,
        }

        return this.request<JellyseerrUser>("/auth/jellyfin", {
          method: "POST",
          body: JSON.stringify(loginPayload),
        })
      }

      // Re-throw other errors with more context
      if (message.includes("NO_ADMIN_USER") || message.includes("NotAdmin")) {
        throw new Error(
          `Jellyfin user "${username}" is not an administrator. Please ensure the user has admin permissions in Jellyfin.`
        )
      }

      if (message.includes("InvalidCredentials") || message.includes("401")) {
        throw new Error(`Invalid Jellyfin credentials for user "${username}".`)
      }

      if (message.includes("InvalidUrl") || message.includes("INVALID_URL")) {
        throw new Error(`Cannot reach Jellyfin at ${hostname}:${port}. Check the hostname and port.`)
      }

      throw err
    }
  }

  /**
   * Authenticate with Plex token
   */
  async authenticatePlex(authToken: string): Promise<JellyseerrUser> {
    return this.request<JellyseerrUser>("/auth/plex", {
      method: "POST",
      body: JSON.stringify({ authToken }),
    })
  }

  // ==========================================
  // Radarr Configuration
  // ==========================================

  async getRadarrSettings(): Promise<JellyseerrRadarrSettings[]> {
    return this.request<JellyseerrRadarrSettings[]>("/settings/radarr")
  }

  async testRadarr(config: {
    hostname: string
    port: number
    apiKey: string
    useSsl: boolean
    baseUrl?: string
  }): Promise<ServiceTestResult> {
    return this.request<ServiceTestResult>("/settings/radarr/test", {
      method: "POST",
      body: JSON.stringify(config),
    })
  }

  async addRadarr(settings: JellyseerrRadarrSettings): Promise<JellyseerrRadarrSettings> {
    return this.request<JellyseerrRadarrSettings>("/settings/radarr", {
      method: "POST",
      body: JSON.stringify(settings),
    })
  }

  // ==========================================
  // Sonarr Configuration
  // ==========================================

  async getSonarrSettings(): Promise<JellyseerrSonarrSettings[]> {
    return this.request<JellyseerrSonarrSettings[]>("/settings/sonarr")
  }

  async testSonarr(config: {
    hostname: string
    port: number
    apiKey: string
    useSsl: boolean
    baseUrl?: string
  }): Promise<ServiceTestResult> {
    return this.request<ServiceTestResult>("/settings/sonarr/test", {
      method: "POST",
      body: JSON.stringify(config),
    })
  }

  async addSonarr(settings: JellyseerrSonarrSettings): Promise<JellyseerrSonarrSettings> {
    return this.request<JellyseerrSonarrSettings>("/settings/sonarr", {
      method: "POST",
      body: JSON.stringify(settings),
    })
  }

  // ==========================================
  // Full Setup Wizard
  // ==========================================

  /**
   * Run the full setup wizard for Jellyfin
   * Returns the API key on success
   */
  async runJellyfinSetup(
    jellyfinHostname: string,
    port: number,
    username: string,
    password: string,
    email?: string
  ): Promise<string> {
    // Step 1: Authenticate (creates first admin if none exists)
    await this.authenticateJellyfin(username, password, jellyfinHostname, port, email)

    // Step 2: Update Jellyfin settings with full URL
    const fullUrl = `http://${jellyfinHostname}:${port}`
    await this.updateJellyfinSettings({
      hostname: fullUrl,
      adminUser: username,
      adminPass: password,
    })

    // Step 3: Sync libraries
    const libraries = await this.syncJellyfinLibraries()

    // Step 4: Enable all libraries
    const libraryIds = libraries.map((lib) => lib.id)
    if (libraryIds.length > 0) {
      await this.enableLibraries(libraryIds)
    }

    // Step 5: Get API key
    const mainSettings = await this.getMainSettings()
    return mainSettings.apiKey
  }

  /**
   * Configure Radarr connection with auto-detection of profiles
   */
  async configureRadarr(
    hostname: string,
    port: number,
    apiKey: string,
    rootFolder: string
  ): Promise<JellyseerrRadarrSettings | null> {
    try {
      const testResult = await this.testRadarr({
        hostname,
        port,
        apiKey,
        useSsl: false,
      })

      if (!testResult.profiles || testResult.profiles.length === 0) {
        debugLog("Jellyseerr", "No Radarr profiles found")
        return null
      }

      const profile = testResult.profiles[0]

      return await this.addRadarr({
        name: "Radarr",
        hostname,
        port,
        apiKey,
        useSsl: false,
        activeProfileId: profile.id,
        activeProfileName: profile.name,
        activeDirectory: rootFolder,
        is4k: false,
        minimumAvailability: "announced",
        isDefault: true,
      })
    } catch (e) {
      debugLog("Jellyseerr", `Radarr config failed: ${e}`)
      return null
    }
  }

  /**
   * Configure Sonarr connection with auto-detection of profiles
   */
  async configureSonarr(
    hostname: string,
    port: number,
    apiKey: string,
    rootFolder: string
  ): Promise<JellyseerrSonarrSettings | null> {
    try {
      const testResult = await this.testSonarr({
        hostname,
        port,
        apiKey,
        useSsl: false,
      })

      if (!testResult.profiles || testResult.profiles.length === 0) {
        debugLog("Jellyseerr", "No Sonarr profiles found")
        return null
      }

      const profile = testResult.profiles[0]

      return await this.addSonarr({
        name: "Sonarr",
        hostname,
        port,
        apiKey,
        useSsl: false,
        activeProfileId: profile.id,
        activeProfileName: profile.name,
        activeDirectory: rootFolder,
        is4k: false,
        enableSeasonFolders: true,
        isDefault: true,
      })
    } catch (e) {
      debugLog("Jellyseerr", `Sonarr config failed: ${e}`)
      return null
    }
  }

  /**
   * Run the auto-setup process for Jellyseerr
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password, env } = options

    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Jellyseerr not reachable" }
      }

      // Check if already initialized
      const initialized = await this.isInitialized()
      if (initialized) {
        // Get API key from settings
        const settings = await this.getMainSettings()
        return {
          success: true,
          message: "Already configured",
          data: { apiKey: settings.apiKey },
          envUpdates: { API_KEY_JELLYSEERR: settings.apiKey },
        }
      }

      // Get Jellyfin connection details from env
      const jellyfinHost = env["JELLYFIN_HOST"] || "jellyfin"
      const jellyfinPort = parseInt(env["JELLYFIN_PORT"] || "8096", 10)

      // Run the setup wizard
      const apiKey = await this.runJellyfinSetup(jellyfinHost, jellyfinPort, username, password)

      // Mark as initialized
      await this.initialize()

      return {
        success: true,
        message: "Jellyseerr configured with Jellyfin",
        data: { apiKey },
        envUpdates: { API_KEY_JELLYSEERR: apiKey },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
