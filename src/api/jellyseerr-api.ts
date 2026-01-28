/**
 * Jellyseerr API Client
 * Handles setup wizard automation and service configuration
 *
 * Based on Jellyseerr source code analysis:
 * - Auth endpoint: POST /api/v1/auth/jellyfin
 * - Setup mode: requires hostname, port, serverType (2=Jellyfin, 3=Emby), useSsl
 * - Login mode: only requires username and password (when server already configured)
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { debugLog } from "~/utils/debug"
import { BaseApiClient } from "./base-api"

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

interface JellyfinLoginRequest {
  username: string
  password: string
}

// ==========================================
// Client
// ==========================================

export class JellyseerrClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "Jellyseerr"
  private cookie?: string

  constructor(host: string, port: number) {
    super(host, port)
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

    const response = await fetch(url, { ...options, headers })

    const setCookie = response.headers.get("set-cookie")
    if (setCookie) {
      this.cookie = setCookie.split(";")[0]
    }

    if (!response.ok) {
      const text = await response.text()
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

  async updateMainSettings(
    settings: Partial<JellyseerrMainSettings>
  ): Promise<JellyseerrMainSettings> {
    return this.request<JellyseerrMainSettings>("/settings/main", {
      method: "POST",
      body: JSON.stringify(settings),
    })
  }

  async initialize(): Promise<{ initialized: boolean }> {
    return this.request<{ initialized: boolean }>("/settings/initialize", { method: "POST" })
  }

  async setApplicationUrl(applicationUrl: string): Promise<JellyseerrMainSettings> {
    return this.updateMainSettings({ applicationUrl })
  }

  // ==========================================
  // Jellyfin Configuration
  // ==========================================

  async getJellyfinSettings(): Promise<JellyseerrJellyfinSettings> {
    return this.request<JellyseerrJellyfinSettings>("/settings/jellyfin")
  }

  async updateJellyfinSettings(
    settings: Partial<JellyseerrJellyfinSettings>
  ): Promise<JellyseerrJellyfinSettings> {
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
    return this.request<JellyseerrLibrary[]>(
      `/settings/jellyfin/library?enable=${encodeURIComponent(enable)}`
    )
  }

  // ==========================================
  // Authentication
  // ==========================================

  async authenticateJellyfin(
    username: string,
    password: string,
    hostname: string,
    port: number,
    email?: string
  ): Promise<JellyseerrUser> {
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

    try {
      return await this.request<JellyseerrUser>("/auth/jellyfin", {
        method: "POST",
        body: JSON.stringify(setupPayload),
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)

      if (
        message.includes("already configured") ||
        message.includes("hostname already configured")
      ) {
        const loginPayload: JellyfinLoginRequest = { username, password }
        return this.request<JellyseerrUser>("/auth/jellyfin", {
          method: "POST",
          body: JSON.stringify(loginPayload),
        })
      }

      if (message.includes("NO_ADMIN_USER") || message.includes("NotAdmin")) {
        throw new Error(`Jellyfin user "${username}" is not an administrator.`)
      }

      if (message.includes("InvalidCredentials") || message.includes("401")) {
        throw new Error(`Invalid Jellyfin credentials for user "${username}".`)
      }

      if (message.includes("InvalidUrl") || message.includes("INVALID_URL")) {
        throw new Error(`Cannot reach Jellyfin at ${hostname}:${port}.`)
      }

      throw err
    }
  }

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

  async updateRadarr(
    id: number,
    settings: Partial<JellyseerrRadarrSettings>
  ): Promise<JellyseerrRadarrSettings> {
    return this.request<JellyseerrRadarrSettings>(`/settings/radarr/${id}`, {
      method: "PUT",
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

  async updateSonarr(
    id: number,
    settings: Partial<JellyseerrSonarrSettings>
  ): Promise<JellyseerrSonarrSettings> {
    return this.request<JellyseerrSonarrSettings>(`/settings/sonarr/${id}`, {
      method: "PUT",
      body: JSON.stringify(settings),
    })
  }

  // ==========================================
  // Full Setup Wizard
  // ==========================================

  async runJellyfinSetup(
    jellyfinHostname: string,
    port: number,
    username: string,
    password: string,
    email?: string
  ): Promise<string> {
    await this.authenticateJellyfin(username, password, jellyfinHostname, port, email)

    const fullUrl = `http://${jellyfinHostname}:${port}`
    await this.updateJellyfinSettings({
      hostname: fullUrl,
      adminUser: username,
      adminPass: password,
    })

    const libraries = await this.syncJellyfinLibraries()
    const libraryIds = libraries.map((lib) => lib.id)
    if (libraryIds.length > 0) {
      await this.enableLibraries(libraryIds)
    }

    const mainSettings = await this.getMainSettings()
    return mainSettings.apiKey
  }

  async configureRadarr(
    hostname: string,
    port: number,
    apiKey: string,
    rootFolder: string,
    externalUrl?: string
  ): Promise<JellyseerrRadarrSettings | null> {
    try {
      const existingConfigs = await this.getRadarrSettings()
      const existingConfig = existingConfigs.find((c) => c.hostname === hostname && c.port === port)

      if (existingConfig?.id) {
        const { id, ...configWithoutId } = existingConfig
        return await this.updateRadarr(id, { ...configWithoutId, externalUrl })
      }

      const testResult = await this.testRadarr({ hostname, port, apiKey, useSsl: false })
      if (!testResult.profiles || testResult.profiles.length === 0) {
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
        externalUrl,
      })
    } catch {
      return null
    }
  }

  async configureSonarr(
    hostname: string,
    port: number,
    apiKey: string,
    rootFolder: string,
    externalUrl?: string
  ): Promise<JellyseerrSonarrSettings | null> {
    try {
      const existingConfigs = await this.getSonarrSettings()
      const existingConfig = existingConfigs.find((c) => c.hostname === hostname && c.port === port)

      if (existingConfig?.id) {
        const { id, ...configWithoutId } = existingConfig
        return await this.updateSonarr(id, { ...configWithoutId, externalUrl })
      }

      const testResult = await this.testSonarr({ hostname, port, apiKey, useSsl: false })
      if (!testResult.profiles || testResult.profiles.length === 0) {
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
        externalUrl,
      })
    } catch {
      return null
    }
  }

  // ==========================================
  // Auto-Setup
  // ==========================================

  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password, env } = options

    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Jellyseerr not reachable" }
      }

      const jellyfinHost = env["JELLYFIN_HOST"] || "jellyfin"
      const jellyfinPort = parseInt(env["JELLYFIN_PORT"] || "8096", 10)

      const initialized = await this.isInitialized()
      if (initialized) {
        try {
          await this.authenticateJellyfin(username, password, jellyfinHost, jellyfinPort)
        } catch {
          return { success: true, message: "Already configured (could not authenticate)" }
        }

        const settings = await this.getMainSettings()
        return {
          success: true,
          message: "Already configured",
          data: { apiKey: settings.apiKey },
          envUpdates: { API_KEY_JELLYSEERR: settings.apiKey },
        }
      }

      const apiKey = await this.runJellyfinSetup(jellyfinHost, jellyfinPort, username, password)
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
