/**
 * Profilarr API Client
 * Handles authentication and *arr instance configuration
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

// ==========================================
// Types
// ==========================================

export interface ProfilarrConfig {
  id?: number
  name: string
  type: "radarr" | "sonarr"
  tags: string[]
  arrServer: string
  apiKey: string
  sync_method: "manual" | "schedule"
  sync_interval: number
  import_as_unique: boolean
  data_to_sync: {
    profiles: string[]
    customFormats: string[]
  }
}

interface ProfilarrSetupStatus {
  needs_setup: boolean
}

interface ProfilarrSetupResponse {
  message: string
  username: string
  api_key: string
  authenticated: boolean
}

interface ProfilarrSettings {
  username: string
  api_key: string
}

interface ProfilarrApiResponse<T> {
  data: T
  success: boolean
}

// ==========================================
// Client
// ==========================================

export class ProfilarrApiClient implements IAutoSetupClient {
  private baseUrl: string
  private apiKey: string | null = null

  constructor(host: string, port: number) {
    this.baseUrl = `http://${host}:${port}/api`
  }

  setApiKey(key: string): void {
    this.apiKey = key
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "X-Api-Key": this.apiKey } : {}),
      ...(options.headers as Record<string, string>),
    }

    debugLog("ProfilarrApi", `${options.method || "GET"} ${endpoint}`)

    const response = await fetch(url, { ...options, headers })

    if (!response.ok) {
      const text = await response.text()
      debugLog("ProfilarrApi", `Error ${response.status}: ${text}`)
      throw new Error(`Profilarr API error: ${response.status} - ${text}`)
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
      const response = await fetch(`${this.baseUrl}/auth/setup`)
      return response.status === 200 || response.status === 400
    } catch {
      return false
    }
  }

  async isInitialized(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/setup`)
      if (response.status === 400) return true // "Auth already configured"
      if (response.status === 200) {
        const data = (await response.json()) as ProfilarrSetupStatus
        return !data.needs_setup
      }
      return false
    } catch {
      return false
    }
  }

  // ==========================================
  // Authentication
  // ==========================================

  /**
   * Authenticate with Profilarr.
   * If not set up, performs initial setup.
   * If already configured, logs in and retrieves API key.
   */
  async authenticate(username: string, password: string): Promise<string> {
    // Check if setup is needed
    try {
      debugLog("ProfilarrApi", "Checking if setup is needed...")
      const response = await fetch(`${this.baseUrl}/auth/setup`)
      debugLog("ProfilarrApi", `Setup check status: ${response.status}`)

      if (response.status === 200) {
        const status = (await response.json()) as ProfilarrSetupStatus
        debugLog("ProfilarrApi", `Setup status: needs_setup=${status.needs_setup}`)

        if (status.needs_setup) {
          debugLog("ProfilarrApi", "Performing initial setup")
          const setupRes = await this.request<ProfilarrSetupResponse>("/auth/setup", {
            method: "POST",
            body: JSON.stringify({ username, password }),
          })
          debugLog("ProfilarrApi", `Setup successful, got API key`)
          this.apiKey = setupRes.api_key
          return this.apiKey
        }
      }
    } catch (e) {
      debugLog("ProfilarrApi", `Setup check/perform error: ${e}`)
      // Continue to try login
    }

    // Already configured, login to get API key
    debugLog("ProfilarrApi", "Logging in to retrieve API key")
    const loginRes = await fetch(`${this.baseUrl}/auth/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })

    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.statusText}`)
    }

    const cookie = loginRes.headers.get("set-cookie")
    if (!cookie) {
      throw new Error("Login successful but no cookie received")
    }

    // Get API key from settings using the cookie
    const settingsRes = await fetch(`${this.baseUrl}/settings/general`, {
      headers: { Cookie: cookie },
    })

    if (!settingsRes.ok) {
      throw new Error(`Failed to fetch settings: ${settingsRes.statusText}`)
    }

    const settings = (await settingsRes.json()) as ProfilarrSettings
    this.apiKey = settings.api_key
    return this.apiKey
  }

  // ==========================================
  // Arr Configuration
  // ==========================================

  async getConfigs(): Promise<ProfilarrConfig[]> {
    const response = await this.request<ProfilarrApiResponse<ProfilarrConfig[]>>("/arr/config")
    return response.data || []
  }

  async addConfig(config: ProfilarrConfig): Promise<ProfilarrConfig | null> {
    const response = await this.request<{ id?: number; success: boolean }>("/arr/config", {
      method: "POST",
      body: JSON.stringify(config),
    })
    if (response.success && response.id) {
      debugLog("ProfilarrApi", `Config created with id: ${response.id}`)
      return { ...config, id: response.id }
    }
    return null
  }

  /**
   * Configure Radarr connection
   * @returns The created/existing config, or null if failed
   */
  async configureRadarr(hostname: string, port: number, apiKey: string): Promise<ProfilarrConfig | null> {
    try {
      const existingConfigs = await this.getConfigs()
      const existingConfig = existingConfigs.find((c) => c.type === "radarr")

      if (existingConfig) {
        debugLog("ProfilarrApi", "Radarr already configured")
        return existingConfig
      }

      const arrServer = `http://${hostname}:${port}`
      return await this.addConfig({
        name: "Radarr",
        type: "radarr",
        tags: [],
        arrServer,
        apiKey,
        sync_method: "manual",
        sync_interval: 60,
        import_as_unique: false,
        data_to_sync: { profiles: [], customFormats: [] },
      })
    } catch (e) {
      debugLog("ProfilarrApi", `Radarr config failed: ${e}`)
      return null
    }
  }

  /**
   * Configure Sonarr connection
   * @returns The created/existing config, or null if failed
   */
  async configureSonarr(hostname: string, port: number, apiKey: string): Promise<ProfilarrConfig | null> {
    try {
      const existingConfigs = await this.getConfigs()
      const existingConfig = existingConfigs.find((c) => c.type === "sonarr")

      if (existingConfig) {
        debugLog("ProfilarrApi", "Sonarr already configured")
        return existingConfig
      }

      const arrServer = `http://${hostname}:${port}`
      return await this.addConfig({
        name: "Sonarr",
        type: "sonarr",
        tags: [],
        arrServer,
        apiKey,
        sync_method: "manual",
        sync_interval: 60,
        import_as_unique: false,
        data_to_sync: { profiles: [], customFormats: [] },
      })
    } catch (e) {
      debugLog("ProfilarrApi", `Sonarr config failed: ${e}`)
      return null
    }
  }

  // ==========================================
  // Git & Settings
  // ==========================================

  /**
   * Get current settings including git repo status
   */
  async getSettings(): Promise<{ gitRepo: string | null; auto_pull_enabled: string }> {
    return this.request<{ gitRepo: string | null; auto_pull_enabled: string }>("/settings")
  }

  /**
   * Clone the Dictionarry database repository
   * @returns true if cloned successfully or already cloned
   */
  async cloneDatabase(): Promise<boolean> {
    try {
      // Check if already cloned
      const settings = await this.getSettings()
      if (settings.gitRepo) {
        debugLog("ProfilarrApi", `Database already cloned: ${settings.gitRepo}`)
        return true
      }

      // Clone the Dictionarry database
      debugLog("ProfilarrApi", "Cloning Dictionarry database...")
      const response = await this.request<{ message: string }>("/git/clone", {
        method: "POST",
        body: JSON.stringify({ gitRepo: "https://github.com/Dictionarry-Hub/database" }),
      })
      debugLog("ProfilarrApi", `Clone result: ${response.message}`)
      return true
    } catch (e) {
      debugLog("ProfilarrApi", `Clone failed: ${e}`)
      return false
    }
  }

  /**
   * Sync a specific arr config
   * @param configId The config ID to sync
   */
  async syncConfig(configId: number): Promise<boolean> {
    try {
      debugLog("ProfilarrApi", `Syncing config ${configId}...`)
      const response = await this.request<{ success: boolean }>(`/arr/config/${configId}/sync`, {
        method: "POST",
        body: JSON.stringify({}),
      })
      debugLog("ProfilarrApi", `Sync config ${configId}: ${response.success ? "success" : "failed"}`)
      return response.success
    } catch (e) {
      debugLog("ProfilarrApi", `Sync config ${configId} failed: ${e}`)
      return false
    }
  }

  /**
   * Sync all configured arr instances
   */
  async syncAllConfigs(): Promise<void> {
    try {
      const configs = await this.getConfigs()
      for (const config of configs) {
        if (config.id) {
          await this.syncConfig(config.id)
        }
      }
    } catch (e) {
      debugLog("ProfilarrApi", `Sync all failed: ${e}`)
    }
  }

  // ==========================================
  // Auto-Setup (IAutoSetupClient)
  // ==========================================

  /**
   * Run the auto-setup process for Profilarr.
   * Handles authentication, clones the Dictionarry database, and syncs to arr instances.
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Profilarr not reachable" }
      }

      // Authenticate (setup or login)
      const apiKey = await this.authenticate(username, password)

      // Clone the Dictionarry database
      const cloned = await this.cloneDatabase()
      if (!cloned) {
        debugLog("ProfilarrApi", "Warning: Could not clone database, continuing anyway")
      }

      return {
        success: true,
        message: "Profilarr configured",
        data: { apiKey },
        envUpdates: { API_KEY_PROFILARR: apiKey },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
