/**
 * Jellyfin API Client
 * Handles setup wizard automation and media library management
 */

import { debugLog } from "../utils/debug"

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
  [key: string]: unknown // Allow other properties
}

export interface UserDto {
  Id: string
  Name?: string
  ServerId?: string
  HasPassword: boolean
  LastLoginDate?: string
  Policy?: UserPolicy
  [key: string]: unknown // Allow other properties
}

export interface AuthResult {
  AccessToken: string
  ServerId: string
  User: UserDto
}

// ==========================================
// Jellyfin Client
// ==========================================

export class JellyfinClient {
  // ==========================================
  // User Management
  // ==========================================

  /**
   * Get a user's details
   */
  async getUser(userId: string): Promise<UserDto> {
    return this.request<UserDto>(`/Users/${userId}`)
  }

  /**
   * Update a user's policy (permissions)
   */
  async updateUserPolicy(userId: string, policy: Partial<UserPolicy>): Promise<void> {
    await this.request(`/Users/${userId}/Policy`, {
      method: "POST",
      body: JSON.stringify(policy),
    })
  }

  private baseUrl: string
  private accessToken?: string

  constructor(host: string, port: number, accessToken?: string) {
    this.baseUrl = `http://${host}:${port}`
    this.accessToken = accessToken
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Jellyfin requires client identification
      "X-Emby-Authorization":
        'MediaBrowser Client="easiarr", Device="Server", DeviceId="easiarr-setup", Version="1.0.0"' +
        (this.accessToken ? `, Token="${this.accessToken}"` : ""),
      ...((options.headers as Record<string, string>) || {}),
    }

    debugLog("JellyfinAPI", `${options.method || "GET"} ${url}`)
    if (options.body) {
      debugLog("JellyfinAPI", `Request Body: ${options.body}`)
    }

    const response = await fetch(url, { ...options, headers })
    const text = await response.text()

    debugLog("JellyfinAPI", `Response ${response.status} from ${endpoint}`)
    if (text && text.length < 2000) {
      debugLog("JellyfinAPI", `Response Body: ${text}`)
    }

    if (!response.ok) {
      throw new Error(`Jellyfin API request failed: ${response.status} ${response.statusText} - ${text}`)
    }

    if (!text) return {} as T
    return JSON.parse(text) as T
  }

  // ==========================================
  // Setup Wizard Methods (no auth required)
  // ==========================================

  /**
   * Check if the startup wizard has been completed
   */
  async isStartupComplete(): Promise<boolean> {
    try {
      const info = await this.request<SystemInfo>("/System/Info/Public")
      return info.StartupWizardCompleted === true
    } catch {
      return false
    }
  }

  /**
   * Get current startup configuration
   */
  async getStartupConfiguration(): Promise<StartupConfiguration> {
    return this.request<StartupConfiguration>("/Startup/Configuration")
  }

  /**
   * Set startup configuration (metadata language, UI culture)
   */
  async setStartupConfiguration(config: StartupConfiguration): Promise<void> {
    await this.request("/Startup/Configuration", {
      method: "POST",
      body: JSON.stringify(config),
    })
  }

  /**
   * Get the first user (initializes user in database)
   */
  async getFirstUser(): Promise<{ Name: string; Password: string }> {
    return this.request<{ Name: string; Password: string }>("/Startup/FirstUser")
  }

  /**
   * Create/update the initial admin user
   * Must call getFirstUser first to initialize the user
   */
  async createAdminUser(name: string, password: string): Promise<void> {
    // First, get the initial user (this initializes the user in the database)
    await this.getFirstUser()

    // Then update with our credentials
    const user: StartupUser = { Name: name, Password: password }
    await this.request("/Startup/User", {
      method: "POST",
      body: JSON.stringify(user),
    })
  }

  /**
   * Configure remote access settings
   */
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

  /**
   * Complete the startup wizard
   */
  async completeStartup(): Promise<void> {
    await this.request("/Startup/Complete", {
      method: "POST",
    })
  }

  /**
   * Run the full setup wizard with sensible defaults
   */
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

    // Step 1: Set UI culture and metadata language
    await this.setStartupConfiguration({
      UICulture: uiCulture,
      MetadataCountryCode: metadataCountry,
      PreferredMetadataLanguage: metadataLanguage,
    })

    // Step 2: Create admin user
    await this.createAdminUser(adminName, adminPassword)

    // Step 3: Configure remote access
    await this.setRemoteAccess(enableRemoteAccess, enableUPnP)

    // Step 4: Complete the wizard
    await this.completeStartup()
  }

  // ==========================================
  // Authentication (post-setup)
  // ==========================================

  /**
   * Authenticate with username/password and get access token
   */
  async authenticate(username: string, password: string): Promise<AuthResult> {
    const result = await this.request<AuthResult>("/Users/AuthenticateByName", {
      method: "POST",
      body: JSON.stringify({
        Username: username,
        Pw: password,
      }),
    })

    // Store token for subsequent requests
    this.accessToken = result.AccessToken
    return result
  }

  /**
   * Set access token directly (if already known)
   */
  setAccessToken(token: string): void {
    this.accessToken = token
  }

  // ==========================================
  // Library Management (requires auth)
  // ==========================================

  /**
   * Get all virtual folders (media libraries)
   */
  async getVirtualFolders(): Promise<VirtualFolderInfo[]> {
    return this.request<VirtualFolderInfo[]>("/Library/VirtualFolders")
  }

  /**
   * Add a new media library
   */
  async addVirtualFolder(options: AddVirtualFolderOptions): Promise<void> {
    const params = new URLSearchParams({
      name: options.name,
      collectionType: options.collectionType,
      refreshLibrary: String(options.refreshLibrary ?? true),
    })

    // Paths need to be added to the body
    await this.request(`/Library/VirtualFolders?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({
        LibraryOptions: {
          PathInfos: options.paths.map((path) => ({ Path: path })),
        },
      }),
    })
  }

  /**
   * Add default media libraries based on common media stack paths
   */
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
        // Library might already exist, continue with others
        debugLog("JellyfinAPI", `Failed to add library ${lib.name}: ${error}`)
      }
    }
  }

  // ==========================================
  // API Key Management (requires auth)
  // ==========================================

  /**
   * Create an API key for external access (e.g., Homepage widget)
   */
  async createApiKey(appName: string): Promise<string> {
    await this.request(`/Auth/Keys?app=${encodeURIComponent(appName)}`, {
      method: "POST",
    })

    // Get all keys and find the one we just created
    const keys = await this.getApiKeys()
    const key = keys.find((k) => k.AppName === appName)
    return key?.AccessToken || ""
  }

  /**
   * Get all API keys
   */
  async getApiKeys(): Promise<{ AccessToken: string; AppName: string; DateCreated: string }[]> {
    const result = await this.request<{
      Items: { AccessToken: string; AppName: string; DateCreated: string }[]
    }>("/Auth/Keys")
    return result.Items || []
  }

  // ==========================================
  // Health Check
  // ==========================================

  /**
   * Check if Jellyfin is running and accessible
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.request<SystemInfo>("/System/Info/Public")
      return true
    } catch {
      return false
    }
  }

  /**
   * Get public system info (no auth required)
   */
  async getPublicSystemInfo(): Promise<SystemInfo> {
    return this.request<SystemInfo>("/System/Info/Public")
  }
}
