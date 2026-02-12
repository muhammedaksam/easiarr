/**
 * Maintainerr API Client
 * Handles Maintainerr integration for automated media management
 * API docs: https://github.com/Maintainerr/Maintainerr
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { BaseApiClient } from "./base-api"

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
  plex_name?: string
  plex_hostname?: string
  plex_port?: number
  plex_ssl?: boolean
  plex_auth_token?: string
  radarr_url?: string
  radarr_api_key?: string
  sonarr_url?: string
  sonarr_api_key?: string
  overseerr_url?: string
  overseerr_api_key?: string
  tautulli_url?: string
  tautulli_api_key?: string
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

export class MaintainerrClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "MaintainerrApi"

  constructor(host: string, port: number = 6246) {
    super(host, port)
  }

  private buildApiUrl(endpoint: string): string {
    return `${this.baseUrl}/api${endpoint}`
  }

  // === Health & Status ===

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/version"), { method: "GET" })
      return response.ok
    } catch {
      return false
    }
  }

  async isInitialized(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/test/setup"), { method: "GET" })
      return response.ok
    } catch {
      return false
    }
  }

  async getVersion(): Promise<MaintainerrVersionInfo | null> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/version"), { method: "GET" })
      if (response.ok) {
        const versionText = await response.text()
        return { version: versionText.trim() }
      }
    } catch {
      // Ignore
    }
    return null
  }

  // === Collections API ===

  async getCollections(libraryId?: number): Promise<MaintainerrCollection[]> {
    try {
      const url = libraryId
        ? this.buildApiUrl(`/collections?libraryId=${libraryId}`)
        : this.buildApiUrl("/collections")
      const response = await fetch(url, { method: "GET" })
      if (response.ok) {
        return (await response.json()) as MaintainerrCollection[]
      }
    } catch {
      // Ignore
    }
    return []
  }

  async getCollection(id: number): Promise<MaintainerrCollection | null> {
    try {
      const response = await fetch(this.buildApiUrl(`/collections/collection/${id}`), {
        method: "GET",
      })
      if (response.ok) {
        return (await response.json()) as MaintainerrCollection
      }
    } catch {
      // Ignore
    }
    return null
  }

  // === Rules API ===

  async getRules(activeOnly: boolean = false, libraryId?: number): Promise<MaintainerrRuleGroup[]> {
    try {
      const params = new URLSearchParams()
      if (activeOnly) params.set("activeOnly", "true")
      if (libraryId) params.set("libraryId", libraryId.toString())
      const queryString = params.toString()
      const url = queryString
        ? this.buildApiUrl(`/rules?${queryString}`)
        : this.buildApiUrl("/rules")
      const response = await fetch(url, { method: "GET" })
      if (response.ok) {
        return (await response.json()) as MaintainerrRuleGroup[]
      }
    } catch {
      // Ignore
    }
    return []
  }

  async executeRules(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/rules/execute"), { method: "POST" })
      return response.ok
    } catch {
      return false
    }
  }

  // === Tasks API ===

  async getTaskStatus(
    taskName: "rule-executor" | "collection-handler"
  ): Promise<MaintainerrTaskStatus | null> {
    try {
      const response = await fetch(this.buildApiUrl(`/tasks/${taskName}/status`), { method: "GET" })
      if (response.ok) {
        return (await response.json()) as MaintainerrTaskStatus
      }
    } catch {
      // Ignore
    }
    return null
  }

  // === Plex API ===

  async getPlexLibraries(): Promise<MaintainerrLibrary[]> {
    try {
      const response = await fetch(this.buildApiUrl("/plex/libraries"), { method: "GET" })
      if (response.ok) {
        return (await response.json()) as MaintainerrLibrary[]
      }
    } catch {
      // Ignore
    }
    return []
  }

  async testPlexConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/test/plex"), { method: "GET" })
      return response.ok
    } catch {
      return false
    }
  }

  // === Settings API ===

  async getSettings(): Promise<MaintainerrSettings | null> {
    try {
      const response = await fetch(this.buildApiUrl("/settings"), { method: "GET" })
      if (response.ok) {
        return (await response.json()) as MaintainerrSettings
      }
    } catch {
      // Ignore
    }
    return null
  }

  async updateSettings(settings: MaintainerrSettingsUpdate): Promise<boolean> {
    try {
      const currentSettings = await this.getSettings()
      if (!currentSettings) return false

      const mergedSettings = { ...currentSettings, ...settings }
      const response = await fetch(this.buildApiUrl("/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mergedSettings),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async configureRadarr(host: string, port: number, apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/radarr"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `http://${host}:${port}`,
          apiKey,
          serverName: host,
        }),
      })
      if (response.ok) {
        const result = await response.json()
        return result?.status === "OK"
      }
      return false
    } catch {
      return false
    }
  }

  async configureSonarr(host: string, port: number, apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/sonarr"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `http://${host}:${port}`,
          apiKey,
          serverName: host,
        }),
      })
      if (response.ok) {
        const result = await response.json()
        return result?.status === "OK"
      }
      return false
    } catch {
      return false
    }
  }

  async configureOverseerr(host: string, port: number, apiKey: string): Promise<boolean> {
    return this.updateSettings({
      overseerr_url: `http://${host}:${port}`,
      overseerr_api_key: apiKey,
    })
  }

  async configureTautulli(host: string, port: number, apiKey: string): Promise<boolean> {
    return this.updateSettings({
      tautulli_url: `http://${host}:${port}`,
      tautulli_api_key: apiKey,
    })
  }

  async generateApiKey(): Promise<string | null> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/api/generate"), { method: "GET" })
      if (response.ok) {
        const apiKey = await response.text()
        return apiKey.trim() || null
      }
    } catch {
      // Ignore
    }
    return null
  }

  async getPlexServers(): Promise<PlexServerDevice[] | null> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/plex/devices/servers"), {
        method: "GET",
      })
      if (response.ok) {
        return (await response.json()) as PlexServerDevice[]
      }
    } catch {
      // Ignore
    }
    return null
  }

  async setPlexToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(this.buildApiUrl("/settings/plex/token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plex_auth_token: token }),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async configurePlexServer(
    hostname: string,
    port: number,
    name: string,
    ssl: boolean = false
  ): Promise<boolean> {
    return this.updateSettings({
      plex_hostname: hostname,
      plex_port: port,
      plex_name: name,
      plex_ssl: ssl,
    })
  }

  // === Auto-Setup ===

  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Maintainerr not reachable" }
      }

      const version = await this.getVersion()
      if (!version) {
        return { success: false, message: "Failed to get Maintainerr version" }
      }

      const apiKey = await this.generateApiKey()
      const envUpdates: Record<string, string> = {}
      if (apiKey) {
        envUpdates["API_KEY_MAINTAINERR"] = apiKey
      }

      const plexToken = options.plexToken || options.env["API_KEY_PLEX"]
      let plexConnected = false
      if (plexToken) {
        const plexSet = await this.setPlexToken(plexToken)
        if (plexSet) {
          const servers = await this.getPlexServers()
          if (servers && servers.length > 0) {
            const server = servers[0]
            const localConn = server.connection.find(
              (c) => c.local && c.address.startsWith("192.168")
            )
            const conn = localConn || server.connection[0]

            if (conn) {
              await this.configurePlexServer(
                conn.address,
                conn.port,
                server.name,
                conn.protocol === "https"
              )
            }
          }
          plexConnected = await this.testPlexConnection()
        }
      }

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
