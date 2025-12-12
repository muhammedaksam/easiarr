/**
 * Prowlarr API Client
 * Manages Indexer Proxies, Sync Profiles, and FlareSolverr integration
 */

import { debugLog } from "../utils/debug"

export interface IndexerProxy {
  id?: number
  name: string
  tags: number[]
  implementation: string
  configContract: string
  fields: { name: string; value: unknown }[]
}

export interface SyncProfile {
  id?: number
  name: string
  enableRss: boolean
  enableInteractiveSearch: boolean
  enableAutomaticSearch: boolean
  minimumSeeders: number
}

export interface Tag {
  id: number
  label: string
}

export interface Application {
  id?: number
  name: string
  syncLevel: "disabled" | "addOnly" | "fullSync"
  implementation: string
  configContract: string
  fields: { name: string; value: unknown }[]
  tags: number[]
}

export type ArrAppType = "Radarr" | "Sonarr" | "Lidarr" | "Readarr"

export class ProwlarrClient {
  private baseUrl: string
  private apiKey: string

  constructor(host: string, port: number, apiKey: string) {
    this.baseUrl = `http://${host}:${port}/api/v1`
    this.apiKey = apiKey
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    }

    debugLog("Prowlarr", `${options.method || "GET"} ${url}`)
    if (options.body) {
      debugLog("Prowlarr", `Request Body: ${options.body}`)
    }

    const response = await fetch(url, { ...options, headers })
    const text = await response.text()

    debugLog("Prowlarr", `Response ${response.status} from ${endpoint}`)
    if (text && text.length < 2000) {
      debugLog("Prowlarr", `Response Body: ${text}`)
    }

    if (!response.ok) {
      throw new Error(`Prowlarr API request failed: ${response.status} ${response.statusText} - ${text}`)
    }

    if (!text) return {} as T
    return JSON.parse(text) as T
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      await this.request("/health")
      return true
    } catch {
      return false
    }
  }

  // Tag management
  async getTags(): Promise<Tag[]> {
    return this.request<Tag[]>("/tag")
  }

  async createTag(label: string): Promise<Tag> {
    return this.request<Tag>("/tag", {
      method: "POST",
      body: JSON.stringify({ label }),
    })
  }

  async getOrCreateTag(label: string): Promise<Tag> {
    const tags = await this.getTags()
    const existing = tags.find((t) => t.label.toLowerCase() === label.toLowerCase())
    if (existing) return existing
    return this.createTag(label)
  }

  // Indexer Proxy management
  async getIndexerProxies(): Promise<IndexerProxy[]> {
    return this.request<IndexerProxy[]>("/indexerproxy")
  }

  async addHttpProxy(
    name: string,
    host: string,
    port: number,
    tags: number[] = [],
    username?: string,
    password?: string
  ): Promise<IndexerProxy> {
    const fields: { name: string; value: unknown }[] = [
      { name: "host", value: host },
      { name: "port", value: port },
      { name: "username", value: username || "" },
      { name: "password", value: password || "" },
    ]

    return this.request<IndexerProxy>("/indexerproxy", {
      method: "POST",
      body: JSON.stringify({
        name,
        tags,
        implementation: "Http",
        configContract: "HttpSettings",
        fields,
      }),
    })
  }

  async addSocks5Proxy(
    name: string,
    host: string,
    port: number,
    tags: number[] = [],
    username?: string,
    password?: string
  ): Promise<IndexerProxy> {
    const fields: { name: string; value: unknown }[] = [
      { name: "host", value: host },
      { name: "port", value: port },
      { name: "username", value: username || "" },
      { name: "password", value: password || "" },
    ]

    return this.request<IndexerProxy>("/indexerproxy", {
      method: "POST",
      body: JSON.stringify({
        name,
        tags,
        implementation: "Socks5",
        configContract: "Socks5Settings",
        fields,
      }),
    })
  }

  async addFlareSolverr(name: string, host: string, tags: number[] = [], requestTimeout = 60): Promise<IndexerProxy> {
    const fields: { name: string; value: unknown }[] = [
      { name: "host", value: host },
      { name: "requestTimeout", value: requestTimeout },
    ]

    return this.request<IndexerProxy>("/indexerproxy", {
      method: "POST",
      body: JSON.stringify({
        name,
        tags,
        implementation: "FlareSolverr",
        configContract: "FlareSolverrSettings",
        fields,
      }),
    })
  }

  async deleteIndexerProxy(id: number): Promise<void> {
    await this.request(`/indexerproxy/${id}`, { method: "DELETE" })
  }

  // Sync Profile management
  async getSyncProfiles(): Promise<SyncProfile[]> {
    return this.request<SyncProfile[]>("/syncprofile")
  }

  async createSyncProfile(profile: Omit<SyncProfile, "id">): Promise<SyncProfile> {
    return this.request<SyncProfile>("/syncprofile", {
      method: "POST",
      body: JSON.stringify(profile),
    })
  }

  // Create TRaSH-recommended sync profiles for limited API indexers
  async createLimitedAPISyncProfiles(): Promise<{ automatic: SyncProfile; interactive: SyncProfile }> {
    const existingProfiles = await this.getSyncProfiles()

    const findByName = (name: string) => existingProfiles.find((p) => p.name === name)

    // Automatic Search profile (disable RSS)
    let automatic = findByName("Automatic Search")
    if (!automatic) {
      automatic = await this.createSyncProfile({
        name: "Automatic Search",
        enableRss: false,
        enableInteractiveSearch: true,
        enableAutomaticSearch: true,
        minimumSeeders: 1,
      })
    }

    // Interactive Search profile (disable RSS and Automatic)
    let interactive = findByName("Interactive Search")
    if (!interactive) {
      interactive = await this.createSyncProfile({
        name: "Interactive Search",
        enableRss: false,
        enableInteractiveSearch: true,
        enableAutomaticSearch: false,
        minimumSeeders: 1,
      })
    }

    return { automatic, interactive }
  }

  // Configure FlareSolverr for Cloudflare-protected indexers
  async configureFlareSolverr(flareSolverrHost: string): Promise<void> {
    // Create flaresolverr tag
    const tag = await this.getOrCreateTag("flaresolverr")

    // Check if FlareSolverr proxy already exists
    const proxies = await this.getIndexerProxies()
    const existingFS = proxies.find((p) => p.implementation === "FlareSolverr")

    if (!existingFS) {
      await this.addFlareSolverr("FlareSolverr", flareSolverrHost, [tag.id])
    }
  }

  // Application management (sync *arr apps)
  async getApplications(): Promise<Application[]> {
    return this.request<Application[]>("/applications")
  }

  async addApplication(
    appType: ArrAppType,
    name: string,
    prowlarrUrl: string,
    appUrl: string,
    appApiKey: string,
    syncLevel: "disabled" | "addOnly" | "fullSync" = "fullSync"
  ): Promise<Application> {
    const fields: { name: string; value: unknown }[] = [
      { name: "prowlarrUrl", value: prowlarrUrl },
      { name: "baseUrl", value: appUrl },
      { name: "apiKey", value: appApiKey },
      { name: "syncCategories", value: [] },
    ]

    return this.request<Application>("/applications", {
      method: "POST",
      body: JSON.stringify({
        name,
        syncLevel,
        implementation: appType,
        configContract: `${appType}Settings`,
        fields,
        tags: [],
      }),
    })
  }

  async deleteApplication(id: number): Promise<void> {
    await this.request(`/applications/${id}`, { method: "DELETE" })
  }

  // Sync all apps - triggers Prowlarr to push indexers to connected apps
  async syncApplications(): Promise<void> {
    await this.request("/applications/action/sync", { method: "POST" })
  }

  // Add *arr app with auto-detection
  async addArrApp(
    appType: ArrAppType,
    host: string,
    port: number,
    apiKey: string,
    prowlarrHost: string,
    prowlarrPort: number
  ): Promise<Application> {
    const prowlarrUrl = `http://${prowlarrHost}:${prowlarrPort}`
    const appUrl = `http://${host}:${port}`

    // Check if app already exists
    const apps = await this.getApplications()
    const existing = apps.find((a) => a.implementation === appType)
    if (existing) {
      return existing
    }

    return this.addApplication(appType, appType, prowlarrUrl, appUrl, apiKey)
  }
}
