/**
 * Jellyfin API Client
 * Handles setup wizard automation and media library management
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { debugLog } from "~/utils/debug"
import { BaseApiClient } from "./base-api"

// ==========================================
// Startup Wizard Types
// ==========================================

export interface StartupConfiguration {
  UICulture?: string
  MetadataCountryCode?: string
  PreferredMetadataLanguage?: string
}

export interface StartupUser {
  Name: string
  Password: string
}

export interface StartupRemoteAccess {
  EnableRemoteAccess: boolean
  EnableAutomaticPortMapping: boolean
}

// ==========================================
// Library Types
// ==========================================

export interface VirtualFolderInfo {
  Name: string
  Locations: string[]
  CollectionType: LibraryType
  ItemId?: string
}

export type LibraryType =
  | "movies"
  | "tvshows"
  | "music"
  | "books"
  | "homevideos"
  | "musicvideos"
  | "photos"
  | "playlists"
  | "boxsets"

export interface AddVirtualFolderOptions {
  name: string
  collectionType: LibraryType
  paths: string[]
  refreshLibrary?: boolean
}

// ==========================================
// System Types
// ==========================================

export interface SystemInfo {
  ServerName: string
  Version: string
  Id: string
  OperatingSystem: string
  StartupWizardCompleted: boolean
}

// ==========================================
// User Types
// ==========================================

export interface UserPolicy {
  IsAdministrator: boolean
  IsHidden: boolean
  IsDisabled: boolean
  EnableRemoteAccess: boolean
  AuthenticationProviderId?: string
  PasswordResetProviderId?: string
  [key: string]: unknown
}

export interface UserDto {
  Id: string
  Name?: string
  ServerId?: string
  HasPassword: boolean
  LastLoginDate?: string
  Policy?: UserPolicy
  [key: string]: unknown
}

export interface AuthResult {
  AccessToken: string
  ServerId: string
  User: UserDto
}

// ==========================================
// Jellyfin Client
// ==========================================

export class JellyfinClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "JellyfinAPI"
  private accessToken?: string

  constructor(host: string, port: number, accessToken?: string) {
    super(host, port)
    this.accessToken = accessToken
  }

  /**
   * Jellyfin requires special authorization header
   */
  private getAuthHeader(): string {
    return (
      'MediaBrowser Client="easiarr", Device="Server", DeviceId="easiarr-setup", Version="1.0.0"' +
      (this.accessToken ? `, Token="${this.accessToken}"` : "")
    )
  }

  /**
   * Make a request to Jellyfin API
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Emby-Authorization": this.getAuthHeader(),
      ...((options.headers as Record<string, string>) || {}),
    }

    debugLog("JellyfinAPI", `${options.method || "GET"} ${url}`)

    const response = await fetch(url, { ...options, headers })
    const text = await response.text()

    if (!response.ok) {
      throw new Error(`Jellyfin API request failed: ${response.status} ${response.statusText}`)
    }

    if (!text) return {} as T
    return JSON.parse(text) as T
  }

  // ==========================================
  // User Management
  // ==========================================

  async getUser(userId: string): Promise<UserDto> {
    return this.request<UserDto>(`/Users/${userId}`)
  }

  async updateUserPolicy(userId: string, policy: Partial<UserPolicy>): Promise<void> {
    await this.request(`/Users/${userId}/Policy`, {
      method: "POST",
      body: JSON.stringify(policy),
    })
  }

  // ==========================================
  // Setup Wizard Methods
  // ==========================================

  async isStartupComplete(): Promise<boolean> {
    try {
      const info = await this.request<SystemInfo>("/System/Info/Public")
      return info.StartupWizardCompleted === true
    } catch {
      return false
    }
  }

  async getStartupConfiguration(): Promise<StartupConfiguration> {
    return this.request<StartupConfiguration>("/Startup/Configuration")
  }

  async setStartupConfiguration(config: StartupConfiguration): Promise<void> {
    await this.request("/Startup/Configuration", {
      method: "POST",
      body: JSON.stringify(config),
    })
  }

  async getFirstUser(): Promise<{ Name: string; Password: string }> {
    return this.request<{ Name: string; Password: string }>("/Startup/FirstUser")
  }

  async createAdminUser(name: string, password: string): Promise<void> {
    await this.getFirstUser()
    const user: StartupUser = { Name: name, Password: password }
    await this.request("/Startup/User", {
      method: "POST",
      body: JSON.stringify(user),
    })
  }

  async setRemoteAccess(enableRemote: boolean, enableUPnP: boolean = false): Promise<void> {
    const config: StartupRemoteAccess = {
      EnableRemoteAccess: enableRemote,
      EnableAutomaticPortMapping: enableUPnP,
    }
    await this.request("/Startup/RemoteAccess", {
      method: "POST",
      body: JSON.stringify(config),
    })
  }

  async completeStartup(): Promise<void> {
    await this.request("/Startup/Complete", { method: "POST" })
  }

  async runSetupWizard(
    adminName: string,
    adminPassword: string,
    options: {
      uiCulture?: string
      metadataCountry?: string
      metadataLanguage?: string
      enableRemoteAccess?: boolean
      enableUPnP?: boolean
    } = {}
  ): Promise<void> {
    const {
      uiCulture = "en-US",
      metadataCountry = "US",
      metadataLanguage = "en",
      enableRemoteAccess = true,
      enableUPnP = false,
    } = options

    await this.setStartupConfiguration({
      UICulture: uiCulture,
      MetadataCountryCode: metadataCountry,
      PreferredMetadataLanguage: metadataLanguage,
    })

    await this.createAdminUser(adminName, adminPassword)
    await this.setRemoteAccess(enableRemoteAccess, enableUPnP)
    await this.completeStartup()
  }

  // ==========================================
  // Authentication
  // ==========================================

  async authenticate(username: string, password: string): Promise<AuthResult> {
    const result = await this.request<AuthResult>("/Users/AuthenticateByName", {
      method: "POST",
      body: JSON.stringify({ Username: username, Pw: password }),
    })
    this.accessToken = result.AccessToken
    return result
  }

  setAccessToken(token: string): void {
    this.accessToken = token
  }

  // ==========================================
  // Library Management
  // ==========================================

  async getVirtualFolders(): Promise<VirtualFolderInfo[]> {
    return this.request<VirtualFolderInfo[]>("/Library/VirtualFolders")
  }

  async addVirtualFolder(options: AddVirtualFolderOptions): Promise<void> {
    const params = new URLSearchParams({
      name: options.name,
      collectionType: options.collectionType,
      refreshLibrary: String(options.refreshLibrary ?? true),
    })

    await this.request(`/Library/VirtualFolders?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({
        LibraryOptions: {
          PathInfos: options.paths.map((path) => ({ Path: path })),
        },
      }),
    })
  }

  async addDefaultLibraries(): Promise<void> {
    const defaultLibraries: AddVirtualFolderOptions[] = [
      { name: "Movies", collectionType: "movies", paths: ["/data/media/movies"] },
      { name: "TV Shows", collectionType: "tvshows", paths: ["/data/media/tv"] },
      { name: "Music", collectionType: "music", paths: ["/data/media/music"] },
    ]

    for (const lib of defaultLibraries) {
      try {
        await this.addVirtualFolder(lib)
      } catch (error) {
        debugLog("JellyfinAPI", `Failed to add library ${lib.name}: ${error}`)
      }
    }
  }

  // ==========================================
  // API Key Management
  // ==========================================

  async createApiKey(appName: string): Promise<string> {
    await this.request(`/Auth/Keys?app=${encodeURIComponent(appName)}`, { method: "POST" })

    const keys = await this.getApiKeys()
    const key = keys.find((k) => k.AppName === appName)
    return key?.AccessToken || ""
  }

  async getApiKeys(): Promise<{ AccessToken: string; AppName: string; DateCreated: string }[]> {
    const result = await this.request<{
      Items: { AccessToken: string; AppName: string; DateCreated: string }[]
    }>("/Auth/Keys")
    return result.Items || []
  }

  // ==========================================
  // Health Check
  // ==========================================

  async isHealthy(): Promise<boolean> {
    try {
      await this.request<SystemInfo>("/System/Info/Public")
      return true
    } catch {
      return false
    }
  }

  async getPublicSystemInfo(): Promise<SystemInfo> {
    return this.request<SystemInfo>("/System/Info/Public")
  }

  async isInitialized(): Promise<boolean> {
    return this.isStartupComplete()
  }

  // ==========================================
  // Auto-Setup
  // ==========================================

  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Jellyfin not reachable" }
      }

      const initialized = await this.isStartupComplete()
      if (initialized) {
        return {
          success: true,
          message: "Already configured",
          data: { alreadyInitialized: true },
        }
      }

      await this.runSetupWizard(username, password)
      const authResult = await this.authenticate(username, password)

      let apiKey: string | undefined
      try {
        apiKey = await this.createApiKey("easiarr")
      } catch {
        // API key creation may fail
      }

      return {
        success: true,
        message: "Setup wizard completed",
        data: {
          accessToken: authResult.AccessToken,
          serverId: authResult.ServerId,
          apiKey,
        },
        envUpdates: apiKey ? { API_KEY_JELLYFIN: apiKey } : undefined,
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
