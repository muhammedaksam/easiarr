/**
 * Jellyseerr API Client
 * Handles setup wizard automation and service configuration
 */

import { debugLog } from "../utils/debug"

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
  mediaServerType: number // 1 = Jellyfin, 2 = Plex, 3 = Emby
  localLogin: boolean
  newPlexLogin: boolean
  defaultPermissions: number
}

export interface JellyseerrJellyfinSettings {
  name?: string
  hostname: string
  externalHostname?: string
  adminUser?: string
  adminPass?: string
  serverID?: string
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

export type MediaServerType = "jellyfin" | "plex" | "emby"

// ==========================================
// Client
// ==========================================

export class JellyseerrClient {
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
      throw new Error(`Jellyseerr API error: ${response.status} ${response.statusText}`)
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
   * Authenticate with Jellyfin credentials
   * Creates admin user if this is the first login
   */
  async authenticateJellyfin(
    username: string,
    password: string,
    hostname: string,
    port: number,
    email?: string
  ): Promise<JellyseerrUser> {
    return this.request<JellyseerrUser>("/auth/jellyfin", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        hostname,
        port,
        urlBase: "",
        email: email || `${username}@local`,
      }),
    })
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
    // Step 1: Authenticate FIRST (creates first admin if none exists)
    // This also establishes the session cookie for subsequent requests
    await this.authenticateJellyfin(username, password, jellyfinHostname, port, email)

    // Step 2: Update Jellyfin settings (now we have the session cookie)
    // Construct full URL for settings (e.g. http://jellyfin:8096)
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
      // Test connection and get profiles
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

      // Use first profile as default
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
      // Test connection and get profiles
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

      // Use first profile as default
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
}
