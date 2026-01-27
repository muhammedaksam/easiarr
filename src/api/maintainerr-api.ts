/**
 * Maintainerr API Client
 * Handles Maintainerr integration for automated media management
 * API docs: https://github.com/Maintainerr/Maintainerr
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

// === Response Types ===

export interface MaintainerrVersionInfo {
  version: string
  commitTag?: string
}

export interface MaintainerrCollection {
  id: number
  libraryId: number
  title: string
  description?: string
  isActive: boolean
  arrAction: number
  visibleOnHome?: boolean
  deleteAfterDays?: number
}

export interface MaintainerrRuleGroup {
  id: number
  libraryId: number
  name: string
  description?: string
  isActive: boolean
  arrAction: number
  useRules: boolean
  dataType: number
  rules?: MaintainerrRule[]
}

export interface MaintainerrRule {
  operator: number | null
  action: number
  firstVal: number[]
  lastVal?: number[]
  customVal?: { ruleTypeId: number; value: string }
  section: number
}

export interface MaintainerrTaskStatus {
  time?: string
  running: boolean
  runningSince?: string
}

export interface MaintainerrSettings {
  // Plex settings
  plex_name?: string
  plex_hostname?: string
  plex_port?: number
  plex_ssl?: boolean
  plex_auth_token?: string
  // Radarr settings
  radarr_url?: string
  radarr_api_key?: string
  // Sonarr settings
  sonarr_url?: string
  sonarr_api_key?: string
  // Overseerr/Jellyseerr settings
  overseerr_url?: string
  overseerr_api_key?: string
  // Tautulli settings
  tautulli_url?: string
  tautulli_api_key?: string
  // Cron schedules
  collection_handler_job_cron?: string
  rules_handler_job_cron?: string
}

export interface MaintainerrSettingsUpdate {
  plex_name?: string
  plex_hostname?: string
  plex_port?: number
  plex_ssl?: boolean
  plex_auth_token?: string
  overseerr_url?: string
  overseerr_api_key?: string
  tautulli_url?: string
  tautulli_api_key?: string
  collection_handler_job_cron?: string
  rules_handler_job_cron?: string
}

export interface MaintainerrLibrary {
  key: string
  title: string
  type: "movie" | "show"
}

export interface PlexServerConnection {
  protocol: string
  address: string
  port: number
  uri: string
  local: boolean
}

export interface PlexServerDevice {
  name: string
  product: string
  productVersion: string
  platform: string
  clientIdentifier: string
  owned: boolean
  accessToken: string
  connection: PlexServerConnection[]
}

// === API Client ===

export class MaintainerrClient implements IAutoSetupClient {
  private host: string
  private port: number

  constructor(host: string, port: number = 6246) {
    this.host = host
    this.port = port
  }

  /**
   * Base URL for Maintainerr API
   */
  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  /**
   * Build API URL for a given endpoint
   */
  private buildApiUrl(endpoint: string): string {
    return `${this.baseUrl}/api${endpoint}`
  }

  // === Health & Status ===

  /**
   * Check if Maintainerr is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/version"), {
        method: "GET",
      })
      debugLog("MaintainerrApi", `Health check: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("MaintainerrApi", `Health check failed: ${error}`)
      return false
    }
  }

  /**
   * Check if Maintainerr has Plex connection configured
   */
  async isInitialized(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/test/setup"), {
        method: "GET",
      })
      if (response.ok) {
        // Maintainerr returns status indicating if Plex is configured
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Get Maintainerr version info
   * Note: The /settings/version endpoint returns plain text, not JSON
   */
  async getVersion(): Promise<MaintainerrVersionInfo | null> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/version"), {
        method: "GET",
      })
      if (response.ok) {
        // Maintainerr returns version as plain text (e.g., "2.26.1")
        const versionText = await response.text()
        return { version: versionText.trim() }
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get version: ${error}`)
    }
    return null
  }

  // === Collections API ===

  /**
   * Get all collections
   */
  async getCollections(libraryId?: number): Promise<MaintainerrCollection[]> {
    try {
      const url = libraryId ? this.buildApiUrl(`/collections?libraryId=${libraryId}`) : this.buildApiUrl("/collections")
      const response = await fetch(url, { method: "GET" })
      if (response.ok) {
        return (await response.json()) as MaintainerrCollection[]
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get collections: ${error}`)
    }
    return []
  }

  /**
   * Get a specific collection by ID
   */
  async getCollection(id: number): Promise<MaintainerrCollection | null> {
    try {
      const response = await fetch(this.buildApiUrl(`/collections/collection/${id}`), {
        method: "GET",
      })
      if (response.ok) {
        return (await response.json()) as MaintainerrCollection
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get collection ${id}: ${error}`)
    }
    return null
  }

  // === Rules API ===

  /**
   * Get all rule groups
   */
  async getRules(activeOnly: boolean = false, libraryId?: number): Promise<MaintainerrRuleGroup[]> {
    try {
      const params = new URLSearchParams()
      if (activeOnly) params.set("activeOnly", "true")
      if (libraryId) params.set("libraryId", libraryId.toString())
      const queryString = params.toString()
      const url = queryString ? this.buildApiUrl(`/rules?${queryString}`) : this.buildApiUrl("/rules")
      const response = await fetch(url, { method: "GET" })
      if (response.ok) {
        return (await response.json()) as MaintainerrRuleGroup[]
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get rules: ${error}`)
    }
    return []
  }

  /**
   * Get a specific rule group by ID
   */
  async getRule(id: number): Promise<MaintainerrRuleGroup | null> {
    try {
      const response = await fetch(this.buildApiUrl(`/rules/${id}`), {
        method: "GET",
      })
      if (response.ok) {
        return (await response.json()) as MaintainerrRuleGroup
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get rule ${id}: ${error}`)
    }
    return null
  }

  /**
   * Get rule constants (available rule types, operators, applications)
   */
  async getRuleConstants(): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(this.buildApiUrl("/rules/constants"), {
        method: "GET",
      })
      if (response.ok) {
        return (await response.json()) as Record<string, unknown>
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get rule constants: ${error}`)
    }
    return null
  }

  /**
   * Execute all active rules
   */
  async executeRules(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/rules/execute"), {
        method: "POST",
      })
      return response.ok
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to execute rules: ${error}`)
      return false
    }
  }

  /**
   * Get rule execution status
   */
  async getRuleExecutionStatus(): Promise<{
    isProcessing: boolean
    currentRuleGroupId?: number
    queuedRuleGroupIds?: number[]
  } | null> {
    try {
      const response = await fetch(this.buildApiUrl("/rules/execute/status"), {
        method: "GET",
      })
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get rule execution status: ${error}`)
    }
    return null
  }

  // === Tasks API ===

  /**
   * Get status of a specific task
   */
  async getTaskStatus(taskName: "rule-executor" | "collection-handler"): Promise<MaintainerrTaskStatus | null> {
    try {
      const response = await fetch(this.buildApiUrl(`/tasks/${taskName}/status`), {
        method: "GET",
      })
      if (response.ok) {
        return (await response.json()) as MaintainerrTaskStatus
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get task status for ${taskName}: ${error}`)
    }
    return null
  }

  // === Plex API ===

  /**
   * Get Plex libraries configured in Maintainerr
   */
  async getPlexLibraries(): Promise<MaintainerrLibrary[]> {
    try {
      const response = await fetch(this.buildApiUrl("/plex/libraries"), {
        method: "GET",
      })
      if (response.ok) {
        return (await response.json()) as MaintainerrLibrary[]
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get Plex libraries: ${error}`)
    }
    return []
  }

  /**
   * Test Plex connection
   */
  async testPlexConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/test/plex"), {
        method: "GET",
      })
      return response.ok
    } catch {
      return false
    }
  }

  // === Settings API ===

  /**
   * Get all settings
   */
  async getSettings(): Promise<MaintainerrSettings | null> {
    try {
      const response = await fetch(this.buildApiUrl("/settings"), {
        method: "GET",
      })
      if (response.ok) {
        return (await response.json()) as MaintainerrSettings
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get settings: ${error}`)
    }
    return null
  }

  /**
   * Update settings (Plex, Overseerr, Tautulli configuration)
   * This method fetches current settings first and merges with updates to avoid validation errors
   */
  async updateSettings(settings: MaintainerrSettingsUpdate): Promise<boolean> {
    try {
      // First get current settings to merge with (required to avoid cron validation errors)
      const currentSettings = await this.getSettings()
      if (!currentSettings) {
        debugLog("MaintainerrApi", "Failed to get current settings for merge")
        return false
      }

      // Merge current settings with updates
      const mergedSettings = {
        ...currentSettings,
        ...settings,
      }

      const response = await fetch(this.buildApiUrl("/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mergedSettings),
      })
      debugLog("MaintainerrApi", `Update settings: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to update settings: ${error}`)
      return false
    }
  }

  /**
   * Configure Radarr connection in Maintainerr
   * Uses POST to /api/settings/radarr endpoint
   */
  async configureRadarr(host: string, port: number, apiKey: string): Promise<boolean> {
    try {
      debugLog("MaintainerrApi", `Configuring Radarr connection: ${host}:${port}`)
      const response = await fetch(this.buildApiUrl("/settings/radarr"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `http://${host}:${port}`,
          apiKey: apiKey,
          serverName: host,
        }),
      })
      debugLog("MaintainerrApi", `Configure Radarr: ${response.status}`)
      if (response.ok) {
        const result = await response.json()
        debugLog("MaintainerrApi", `Radarr response: ${JSON.stringify(result)}`)
        return result?.status === "OK"
      }
      return false
    } catch (e) {
      debugLog("MaintainerrApi", `Failed to configure Radarr: ${e}`)
      return false
    }
  }

  /**
   * Configure Sonarr connection in Maintainerr
   * Uses POST to /api/settings/sonarr endpoint
   */
  async configureSonarr(host: string, port: number, apiKey: string): Promise<boolean> {
    try {
      debugLog("MaintainerrApi", `Configuring Sonarr connection: ${host}:${port}`)
      const response = await fetch(this.buildApiUrl("/settings/sonarr"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `http://${host}:${port}`,
          apiKey: apiKey,
          serverName: host,
        }),
      })
      debugLog("MaintainerrApi", `Configure Sonarr: ${response.status}`)
      if (response.ok) {
        const result = await response.json()
        debugLog("MaintainerrApi", `Sonarr response: ${JSON.stringify(result)}`)
        return result?.status === "OK"
      }
      return false
    } catch (e) {
      debugLog("MaintainerrApi", `Failed to configure Sonarr: ${e}`)
      return false
    }
  }

  /**
   * Configure Overseerr connection in Maintainerr
   */
  async configureOverseerr(host: string, port: number, apiKey: string): Promise<boolean> {
    try {
      debugLog("MaintainerrApi", `Configuring Overseerr connection: ${host}:${port}`)
      const result = await this.updateSettings({
        overseerr_url: `http://${host}:${port}`,
        overseerr_api_key: apiKey,
      })
      if (result) {
        debugLog("MaintainerrApi", "Overseerr connection configured successfully")
      }
      return result
    } catch (e) {
      debugLog("MaintainerrApi", `Failed to configure Overseerr: ${e}`)
      return false
    }
  }

  /**
   * Configure Tautulli connection in Maintainerr
   */
  async configureTautulli(host: string, port: number, apiKey: string): Promise<boolean> {
    try {
      debugLog("MaintainerrApi", `Configuring Tautulli connection: ${host}:${port}`)
      const result = await this.updateSettings({
        tautulli_url: `http://${host}:${port}`,
        tautulli_api_key: apiKey,
      })
      if (result) {
        debugLog("MaintainerrApi", "Tautulli connection configured successfully")
      }
      return result
    } catch (e) {
      debugLog("MaintainerrApi", `Failed to configure Tautulli: ${e}`)
      return false
    }
  }

  /**
   * Generate an API key
   * Note: The /settings/api/generate endpoint returns plain text, not JSON
   */
  async generateApiKey(): Promise<string | null> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/api/generate"), {
        method: "GET",
      })
      if (response.ok) {
        // Maintainerr returns API key as plain text (base64 encoded)
        const apiKey = await response.text()
        debugLog("MaintainerrApi", "API key generated successfully")
        return apiKey.trim() || null
      }
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to generate API key: ${error}`)
    }
    return null
  }

  /**
   * Get available Plex servers using the Plex token
   */
  async getPlexServers(): Promise<PlexServerDevice[] | null> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/plex/devices/servers"), {
        method: "GET",
      })
      if (response.ok) {
        return (await response.json()) as PlexServerDevice[]
      }
      debugLog("MaintainerrApi", `Get Plex servers failed: ${response.status}`)
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to get Plex servers: ${error}`)
    }
    return null
  }

  /**
   * Set Plex authentication token
   */
  async setPlexToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/plex/token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plex_auth_token: token }),
      })
      debugLog("MaintainerrApi", `Set Plex token: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to set Plex token: ${error}`)
      return false
    }
  }

  /**
   * Configure Plex server with hostname, port, and name
   * This must be called after setPlexToken to complete Plex setup
   */
  async configurePlexServer(hostname: string, port: number, name: string, ssl: boolean = false): Promise<boolean> {
    try {
      debugLog("MaintainerrApi", `Configuring Plex server: ${name} at ${hostname}:${port}`)
      const result = await this.updateSettings({
        plex_hostname: hostname,
        plex_port: port,
        plex_name: name,
        plex_ssl: ssl,
      })
      if (result) {
        debugLog("MaintainerrApi", "Plex server configured successfully")
      }
      return result
    } catch (error) {
      debugLog("MaintainerrApi", `Failed to configure Plex server: ${error}`)
      return false
    }
  }

  /**
   * Test Radarr connection
   */
  async testRadarrConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/test/radarr"), { method: "GET" })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Test Sonarr connection
   */
  async testSonarrConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/test/sonarr"), { method: "GET" })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Test Overseerr connection
   */
  async testOverseerrConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/test/overseerr"), { method: "GET" })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Test Tautulli connection
   */
  async testTautulliConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/test/tautulli"), { method: "GET" })
      return response.ok
    } catch {
      return false
    }
  }

  // === Auto-Setup ===

  /**
   * Run the full auto-setup process for Maintainerr
   * Generates API key, configures Plex, and sets up Radarr/Sonarr/Overseerr/Tautulli
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Maintainerr not reachable" }
      }

      // Get version to confirm API is working
      debugLog("MaintainerrApi", "Step 1: Getting version info...")
      const version = await this.getVersion()
      if (!version) {
        return { success: false, message: "Failed to get Maintainerr version" }
      }
      debugLog("MaintainerrApi", `Maintainerr version: ${version.version}`)

      // Step 2: Generate API key
      debugLog("MaintainerrApi", "Step 2: Generating API key...")
      const apiKey = await this.generateApiKey()
      const envUpdates: Record<string, string> = {}
      if (apiKey) {
        envUpdates["API_KEY_MAINTAINERR"] = apiKey
        debugLog("MaintainerrApi", "API key generated successfully")
      }

      // Step 3: Configure Plex if token available
      debugLog("MaintainerrApi", "Step 3: Configuring Plex connection...")
      const plexToken = options.plexToken || options.env["API_KEY_PLEX"]
      let plexConnected = false
      if (plexToken) {
        const plexSet = await this.setPlexToken(plexToken)
        if (plexSet) {
          debugLog("MaintainerrApi", "Plex token configured successfully")

          // Get available Plex servers and configure the first one
          const servers = await this.getPlexServers()
          if (servers && servers.length > 0) {
            const server = servers[0]
            // Find a local connection (prefer local addresses)
            const localConn = server.connection.find((c) => c.local && c.address.startsWith("192.168"))
            const conn = localConn || server.connection[0]

            if (conn) {
              await this.configurePlexServer(conn.address, conn.port, server.name, conn.protocol === "https")
              debugLog("MaintainerrApi", `Configured Plex server: ${server.name} at ${conn.address}:${conn.port}`)
            }
          }

          plexConnected = await this.testPlexConnection()
        }
      }

      // Service configuration (Radarr/Sonarr/Overseerr/Tautulli) is handled in FullAutoSetup

      return {
        success: true,
        message: plexConnected
          ? `Maintainerr v${version.version} connected to Plex`
          : `Maintainerr v${version.version} ready`,
        envUpdates: Object.keys(envUpdates).length > 0 ? envUpdates : undefined,
        data: {
          version: version.version,
          apiKey,
          requiresWizard: !plexConnected,
        },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
