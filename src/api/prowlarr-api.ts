/**
 * Prowlarr API Client
 * Manages Indexer Proxies, Sync Profiles, and FlareSolverr integration
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { debugLog } from "~/utils/debug"
import { BaseApiClient } from "./base-api"

export interface IndexerProxy {
  id?: number
  name: string
  tags: number[]
  implementation: string
  configContract: string
  fields: { name: string; value: unknown }[]
}

export interface ProwlarrIndexerSchema {
  id?: number
  name: string
  implementation: string
  configContract: string
  fields: { name: string; value?: unknown }[]
  tags: number[]
  enable: boolean
  privacy: "public" | "private" | "semi-private"
  protocol: "torrent" | "usenet"
  priority: number
  capabilities?: {
    categories: { id: number; name: string; subCategories?: { id: number; name: string }[] }[]
  }
}

export interface ProwlarrIndexer {
  id?: number
  name: string
  fields: { name: string; value?: unknown }[]
  tags: number[]
  enable: boolean
  protocol: string
  implementation: string
  configContract: string
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

export type ArrAppType = "Radarr" | "Sonarr" | "Lidarr" | "Readarr" | "Whisparr" | "Mylar"

export class ProwlarrClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "Prowlarr"
  private apiKey: string

  constructor(host: string, port: number, apiKey: string) {
    super(host, port)
    this.apiKey = apiKey
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`
    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    }

    debugLog("Prowlarr", `${options.method || "GET"} ${url}`)

    const response = await fetch(url, { ...options, headers })
    const text = await response.text()

    if (!response.ok) {
      throw new Error(`Prowlarr API request failed: ${response.status} ${response.statusText}`)
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

  async addFlareSolverr(
    name: string,
    host: string,
    tags: number[] = [],
    requestTimeout = 60
  ): Promise<IndexerProxy> {
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

  // Indexer Management
  async getIndexerSchemas(): Promise<ProwlarrIndexerSchema[]> {
    return this.request<ProwlarrIndexerSchema[]>("/indexer/schema")
  }

  async getIndexers(): Promise<ProwlarrIndexer[]> {
    return this.request<ProwlarrIndexer[]>("/indexer")
  }

  async createIndexer(indexer: ProwlarrIndexerSchema): Promise<ProwlarrIndexer> {
    const payload = {
      ...indexer,
      id: undefined,
      appProfileId: 1,
    }
    return this.request<ProwlarrIndexer>("/indexer", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  // Sync Profile management
  async getSyncProfiles(): Promise<SyncProfile[]> {
    return this.request<SyncProfile[]>("/appprofile")
  }

  async createSyncProfile(profile: Omit<SyncProfile, "id">): Promise<SyncProfile> {
    return this.request<SyncProfile>("/appprofile", {
      method: "POST",
      body: JSON.stringify(profile),
    })
  }

  async createLimitedAPISyncProfiles(): Promise<{
    automatic: SyncProfile
    interactive: SyncProfile
  }> {
    const existingProfiles = await this.getSyncProfiles()
    const findByName = (name: string) => existingProfiles.find((p) => p.name === name)

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

  async configureFlareSolverr(flareSolverrHost: string): Promise<void> {
    const tag = await this.getOrCreateTag("flaresolverr")
    const proxies = await this.getIndexerProxies()
    const existingFS = proxies.find((p) => p.implementation === "FlareSolverr")

    if (!existingFS) {
      await this.addFlareSolverr("FlareSolverr", flareSolverrHost, [tag.id])
    }
  }

  // Application management
  async getApplications(): Promise<Application[]> {
    return this.request<Application[]>("/applications")
  }

  async addApplication(
    appType: ArrAppType,
    name: string,
    prowlarrUrl: string,
    appUrl: string,
    appApiKey: string,
    syncLevel: "disabled" | "addOnly" | "fullSync" = "fullSync",
    syncCategories: number[] = []
  ): Promise<Application> {
    const fields: { name: string; value: unknown }[] = [
      { name: "prowlarrUrl", value: prowlarrUrl },
      { name: "baseUrl", value: appUrl },
      { name: "apiKey", value: appApiKey },
      { name: "syncCategories", value: syncCategories },
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

  async updateApplication(
    id: number,
    appType: ArrAppType,
    name: string,
    prowlarrUrl: string,
    appUrl: string,
    appApiKey: string,
    syncLevel: "disabled" | "addOnly" | "fullSync" = "fullSync",
    syncCategories: number[] = [],
    tags: number[] = []
  ): Promise<Application> {
    const fields: { name: string; value: unknown }[] = [
      { name: "prowlarrUrl", value: prowlarrUrl },
      { name: "baseUrl", value: appUrl },
      { name: "apiKey", value: appApiKey },
      { name: "syncCategories", value: syncCategories },
      { name: "syncRejectBlocklistedTorrentHashesWhileGrabbing", value: false },
    ]

    return this.request<Application>(`/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        id,
        name,
        syncLevel,
        enable: true,
        implementation: appType,
        implementationName: appType,
        configContract: `${appType}Settings`,
        infoLink: `https://wiki.servarr.com/prowlarr/supported#${appType.toLowerCase()}`,
        fields,
        tags,
      }),
    })
  }

  async syncApplications(): Promise<void> {
    await this.request("/command", {
      method: "POST",
      body: JSON.stringify({
        name: "ApplicationIndexerSync",
        forceSync: true,
      }),
    })
  }

  async addArrApp(
    appType: ArrAppType,
    host: string,
    port: number,
    apiKey: string,
    prowlarrHost: string,
    prowlarrPort: number,
    syncCategories?: number[]
  ): Promise<Application> {
    const prowlarrUrl = `http://${prowlarrHost}:${prowlarrPort}`
    const appUrl = `http://${host}:${port}`

    const apps = await this.getApplications()
    const existing = apps.find((a) => a.implementation === appType)

    if (existing && existing.id) {
      return this.updateApplication(
        existing.id,
        appType,
        existing.name,
        prowlarrUrl,
        appUrl,
        apiKey,
        "fullSync",
        syncCategories || [],
        existing.tags || []
      )
    }

    return this.addApplication(
      appType,
      appType,
      prowlarrUrl,
      appUrl,
      apiKey,
      "fullSync",
      syncCategories
    )
  }

  async isInitialized(): Promise<boolean> {
    try {
      const indexers = await this.getIndexers()
      return indexers.length > 0
    } catch {
      return false
    }
  }

  async setup(_options: AutoSetupOptions): Promise<AutoSetupResult> {
    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Prowlarr not reachable" }
      }

      const indexers = await this.getIndexers()
      const apps = await this.getApplications()
      const proxies = await this.getIndexerProxies()

      return {
        success: true,
        message: indexers.length > 0 ? "Configured" : "Ready for indexer setup",
        data: {
          indexerCount: indexers.length,
          appCount: apps.length,
          proxyCount: proxies.length,
        },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}

export const PROWLARR_CATEGORIES = [
  { id: 1000, name: "Console", subCategories: [] as { id: number; name: string }[] },
  {
    id: 2000,
    name: "Movies",
    subCategories: [
      { id: 2010, name: "Movies/Foreign" },
      { id: 2020, name: "Movies/Other" },
      { id: 2030, name: "Movies/SD" },
      { id: 2040, name: "Movies/HD" },
      { id: 2045, name: "Movies/UHD" },
      { id: 2050, name: "Movies/BluRay" },
      { id: 2060, name: "Movies/3D" },
      { id: 2070, name: "Movies/DVD" },
      { id: 2080, name: "Movies/WEB-DL" },
    ],
  },
  { id: 3000, name: "Audio", subCategories: [] as { id: number; name: string }[] },
  { id: 4000, name: "PC", subCategories: [] as { id: number; name: string }[] },
  {
    id: 5000,
    name: "TV",
    subCategories: [
      { id: 5010, name: "TV/WEB-DL" },
      { id: 5020, name: "TV/Foreign" },
      { id: 5030, name: "TV/SD" },
      { id: 5040, name: "TV/HD" },
      { id: 5045, name: "TV/UHD" },
      { id: 5050, name: "TV/Other" },
      { id: 5060, name: "TV/Sport" },
      { id: 5070, name: "TV/Anime" },
      { id: 5080, name: "TV/Documentary" },
    ],
  },
  { id: 6000, name: "XXX", subCategories: [] as { id: number; name: string }[] },
  { id: 7000, name: "Books", subCategories: [] as { id: number; name: string }[] },
  { id: 8000, name: "Other", subCategories: [] as { id: number; name: string }[] },
]
