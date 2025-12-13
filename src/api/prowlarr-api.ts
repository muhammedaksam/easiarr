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

  // Indexer Management
  async getIndexerSchemas(): Promise<ProwlarrIndexerSchema[]> {
    return this.request<ProwlarrIndexerSchema[]>("/indexer/schema")
  }

  async getIndexers(): Promise<ProwlarrIndexer[]> {
    return this.request<ProwlarrIndexer[]>("/indexer")
  }

  async createIndexer(indexer: ProwlarrIndexerSchema): Promise<ProwlarrIndexer> {
    // Ensure required fields are set
    const payload = {
      ...indexer,
      id: undefined, // Create new
      appProfileId: 1, // Default profile
    }
    return this.request<ProwlarrIndexer>("/indexer", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  // Sync Profile management (aka App Sync Profile)
  async getSyncProfiles(): Promise<SyncProfile[]> {
    return this.request<SyncProfile[]>("/appsyncprofile")
  }

  async createSyncProfile(profile: Omit<SyncProfile, "id">): Promise<SyncProfile> {
    return this.request<SyncProfile>("/appsyncprofile", {
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

  // Sync all apps - triggers Prowlarr to push indexers to connected apps
  async syncApplications(): Promise<void> {
    await this.request("/applications/action/sync", {
      method: "POST",
      body: JSON.stringify({}), // API requires non-empty body
    })
  }

  // Add *arr app with auto-detection
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

    // Check if app already exists
    const apps = await this.getApplications()
    const existing = apps.find((a) => a.implementation === appType)
    if (existing) {
      return existing
    }

    return this.addApplication(appType, appType, prowlarrUrl, appUrl, apiKey, "fullSync", syncCategories)
  }
}

export const PROWLARR_CATEGORIES = [
  {
    id: 1000,
    name: "Console",
    subCategories: [
      {
        id: 1010,
        name: "Console/NDS",
        subCategories: [],
      },
      {
        id: 1020,
        name: "Console/PSP",
        subCategories: [],
      },
      {
        id: 1030,
        name: "Console/Wii",
        subCategories: [],
      },
      {
        id: 1040,
        name: "Console/XBox",
        subCategories: [],
      },
      {
        id: 1050,
        name: "Console/XBox 360",
        subCategories: [],
      },
      {
        id: 1060,
        name: "Console/Wiiware",
        subCategories: [],
      },
      {
        id: 1070,
        name: "Console/XBox 360 DLC",
        subCategories: [],
      },
      {
        id: 1080,
        name: "Console/PS3",
        subCategories: [],
      },
      {
        id: 1090,
        name: "Console/Other",
        subCategories: [],
      },
      {
        id: 1110,
        name: "Console/3DS",
        subCategories: [],
      },
      {
        id: 1120,
        name: "Console/PS Vita",
        subCategories: [],
      },
      {
        id: 1130,
        name: "Console/WiiU",
        subCategories: [],
      },
      {
        id: 1140,
        name: "Console/XBox One",
        subCategories: [],
      },
      {
        id: 1180,
        name: "Console/PS4",
        subCategories: [],
      },
    ],
  },
  {
    id: 2000,
    name: "Movies",
    subCategories: [
      {
        id: 2010,
        name: "Movies/Foreign",
        subCategories: [],
      },
      {
        id: 2020,
        name: "Movies/Other",
        subCategories: [],
      },
      {
        id: 2030,
        name: "Movies/SD",
        subCategories: [],
      },
      {
        id: 2040,
        name: "Movies/HD",
        subCategories: [],
      },
      {
        id: 2045,
        name: "Movies/UHD",
        subCategories: [],
      },
      {
        id: 2050,
        name: "Movies/BluRay",
        subCategories: [],
      },
      {
        id: 2060,
        name: "Movies/3D",
        subCategories: [],
      },
      {
        id: 2070,
        name: "Movies/DVD",
        subCategories: [],
      },
      {
        id: 2080,
        name: "Movies/WEB-DL",
        subCategories: [],
      },
      {
        id: 2090,
        name: "Movies/x265",
        subCategories: [],
      },
    ],
  },
  {
    id: 3000,
    name: "Audio",
    subCategories: [
      {
        id: 3010,
        name: "Audio/MP3",
        subCategories: [],
      },
      {
        id: 3020,
        name: "Audio/Video",
        subCategories: [],
      },
      {
        id: 3030,
        name: "Audio/Audiobook",
        subCategories: [],
      },
      {
        id: 3040,
        name: "Audio/Lossless",
        subCategories: [],
      },
      {
        id: 3050,
        name: "Audio/Other",
        subCategories: [],
      },
      {
        id: 3060,
        name: "Audio/Foreign",
        subCategories: [],
      },
    ],
  },
  {
    id: 4000,
    name: "PC",
    subCategories: [
      {
        id: 4010,
        name: "PC/0day",
        subCategories: [],
      },
      {
        id: 4020,
        name: "PC/ISO",
        subCategories: [],
      },
      {
        id: 4030,
        name: "PC/Mac",
        subCategories: [],
      },
      {
        id: 4040,
        name: "PC/Mobile-Other",
        subCategories: [],
      },
      {
        id: 4050,
        name: "PC/Games",
        subCategories: [],
      },
      {
        id: 4060,
        name: "PC/Mobile-iOS",
        subCategories: [],
      },
      {
        id: 4070,
        name: "PC/Mobile-Android",
        subCategories: [],
      },
    ],
  },
  {
    id: 5000,
    name: "TV",
    subCategories: [
      {
        id: 5010,
        name: "TV/WEB-DL",
        subCategories: [],
      },
      {
        id: 5020,
        name: "TV/Foreign",
        subCategories: [],
      },
      {
        id: 5030,
        name: "TV/SD",
        subCategories: [],
      },
      {
        id: 5040,
        name: "TV/HD",
        subCategories: [],
      },
      {
        id: 5045,
        name: "TV/UHD",
        subCategories: [],
      },
      {
        id: 5050,
        name: "TV/Other",
        subCategories: [],
      },
      {
        id: 5060,
        name: "TV/Sport",
        subCategories: [],
      },
      {
        id: 5070,
        name: "TV/Anime",
        subCategories: [],
      },
      {
        id: 5080,
        name: "TV/Documentary",
        subCategories: [],
      },
      {
        id: 5090,
        name: "TV/x265",
        subCategories: [],
      },
    ],
  },
  {
    id: 6000,
    name: "XXX",
    subCategories: [
      {
        id: 6010,
        name: "XXX/DVD",
        subCategories: [],
      },
      {
        id: 6020,
        name: "XXX/WMV",
        subCategories: [],
      },
      {
        id: 6030,
        name: "XXX/XviD",
        subCategories: [],
      },
      {
        id: 6040,
        name: "XXX/x264",
        subCategories: [],
      },
      {
        id: 6045,
        name: "XXX/UHD",
        subCategories: [],
      },
      {
        id: 6050,
        name: "XXX/Pack",
        subCategories: [],
      },
      {
        id: 6060,
        name: "XXX/ImageSet",
        subCategories: [],
      },
      {
        id: 6070,
        name: "XXX/Other",
        subCategories: [],
      },
      {
        id: 6080,
        name: "XXX/SD",
        subCategories: [],
      },
      {
        id: 6090,
        name: "XXX/WEB-DL",
        subCategories: [],
      },
    ],
  },
  {
    id: 7000,
    name: "Books",
    subCategories: [
      {
        id: 7010,
        name: "Books/Mags",
        subCategories: [],
      },
      {
        id: 7020,
        name: "Books/EBook",
        subCategories: [],
      },
      {
        id: 7030,
        name: "Books/Comics",
        subCategories: [],
      },
      {
        id: 7040,
        name: "Books/Technical",
        subCategories: [],
      },
      {
        id: 7050,
        name: "Books/Other",
        subCategories: [],
      },
      {
        id: 7060,
        name: "Books/Foreign",
        subCategories: [],
      },
    ],
  },
  {
    id: 8000,
    name: "Other",
    subCategories: [
      {
        id: 8010,
        name: "Other/Misc",
        subCategories: [],
      },
      {
        id: 8020,
        name: "Other/Hashed",
        subCategories: [],
      },
    ],
  },
  {
    id: 0,
    name: "Other",
    subCategories: [
      {
        id: 10,
        name: "Other/Misc",
        subCategories: [],
      },
      {
        id: 20,
        name: "Other/Hashed",
        subCategories: [],
      },
    ],
  },
]
