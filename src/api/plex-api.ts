/**
 * Plex API Client
 * Handles Plex Media Server auto-setup including server claiming and library creation
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { debugLog } from "~/utils/debug"
import { BaseApiClient } from "./base-api"

// Plex client identifier for API requests
const PLEX_CLIENT_ID = "easiarr"
const PLEX_PRODUCT = "Easiarr"
const PLEX_VERSION = "1.0.0"
const PLEX_DEVICE = "Server"

interface PlexLibrarySection {
  key: string
  type: string
  title: string
  agent: string
  scanner: string
  language: string
  Location: { id: number; path: string }[]
}

interface PlexServerInfo {
  machineIdentifier: string
  version: string
  claimed: boolean
}

export class PlexApiClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "PlexApi"
  private token?: string

  constructor(host: string, port: number = 32400, token?: string) {
    super(host, port)
    this.token = token
  }

  /**
   * Set the Plex token for authenticated requests
   */
  setToken(token: string): void {
    this.token = token
  }

  /**
   * Common headers for Plex API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
      "X-Plex-Product": PLEX_PRODUCT,
      "X-Plex-Version": PLEX_VERSION,
      "X-Plex-Device": PLEX_DEVICE,
    }
    if (this.token) {
      headers["X-Plex-Token"] = this.token
    }
    return headers
  }

  /**
   * Check if Plex server is reachable
   */
  async isHealthy(): Promise<boolean> {
    const response = await this.get<unknown>("/identity", { headers: this.getHeaders() })
    return response.success
  }

  /**
   * Check if server is already claimed (initialized)
   */
  async isInitialized(): Promise<boolean> {
    try {
      const info = await this.getServerInfo()
      return info.claimed
    } catch {
      return false
    }
  }

  /**
   * Get server information including claim status
   */
  async getServerInfo(): Promise<PlexServerInfo> {
    const response = await fetch(`${this.baseUrl}/`, {
      method: "GET",
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to get server info: ${response.status}`)
    }

    const data = await response.json()
    const container = data.MediaContainer

    return {
      machineIdentifier: container.machineIdentifier,
      version: container.version,
      claimed: container.myPlex === true || !!container.myPlexUsername,
    }
  }

  /**
   * Claim the server using a claim token from plex.tv/claim
   */
  async claimServer(claimToken: string): Promise<void> {
    debugLog("PlexApi", "Claiming server with token...")

    const token = claimToken.startsWith("claim-") ? claimToken : `claim-${claimToken}`

    const response = await this.post<unknown>(`/myplex/claim?token=${token}`, undefined, {
      headers: this.getHeaders(),
    })

    if (!response.success) {
      throw new Error(`Failed to claim server: ${response.status}`)
    }

    debugLog("PlexApi", "Server claimed successfully")
  }

  /**
   * Get list of library sections
   */
  async getLibrarySections(): Promise<PlexLibrarySection[]> {
    const response = await fetch(`${this.baseUrl}/library/sections`, {
      method: "GET",
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to get library sections: ${response.status}`)
    }

    const data = await response.json()
    return data.MediaContainer?.Directory || []
  }

  /**
   * Create a library section
   */
  async createLibrary(
    name: string,
    type: "movie" | "show" | "artist",
    path: string,
    language: string = "en-US"
  ): Promise<void> {
    debugLog("PlexApi", `Creating library: ${name} (${type}) at ${path}`)

    const agents: Record<string, { agent: string; scanner: string }> = {
      movie: { agent: "tv.plex.agents.movie", scanner: "Plex Movie" },
      show: { agent: "tv.plex.agents.series", scanner: "Plex TV Series" },
      artist: { agent: "tv.plex.agents.music", scanner: "Plex Music" },
    }

    const config = agents[type]
    if (!config) {
      throw new Error(`Unknown library type: ${type}`)
    }

    const params = new URLSearchParams({
      name,
      type,
      agent: config.agent,
      scanner: config.scanner,
      language,
      location: path,
    })

    const response = await this.post<unknown>(`/library/sections?${params.toString()}`, undefined, {
      headers: this.getHeaders(),
    })

    if (!response.success) {
      throw new Error(`Failed to create library: ${response.status}`)
    }

    debugLog("PlexApi", `Library "${name}" created successfully`)
  }

  /**
   * Check if a library with the given path already exists
   */
  async libraryExistsForPath(path: string): Promise<boolean> {
    const sections = await this.getLibrarySections()
    return sections.some((section) => section.Location?.some((loc) => loc.path === path))
  }

  /**
   * Trigger a library scan for all sections
   */
  async scanAllLibraries(): Promise<void> {
    const sections = await this.getLibrarySections()
    for (const section of sections) {
      await fetch(`${this.baseUrl}/library/sections/${section.key}/refresh`, {
        method: "GET",
        headers: this.getHeaders(),
      })
    }
    debugLog("PlexApi", "Triggered scan for all libraries")
  }

  /**
   * Create libraries based on enabled *arr apps
   */
  private async createDefaultLibraries(enabledApps?: string[]): Promise<number> {
    const libraryMap = [
      { app: "radarr", name: "Movies", type: "movie" as const, path: "/data/media/movies" },
      { app: "sonarr", name: "TV Shows", type: "show" as const, path: "/data/media/tv" },
      { app: "lidarr", name: "Music", type: "artist" as const, path: "/data/media/music" },
    ]

    const libraries = enabledApps
      ? libraryMap.filter((lib) => enabledApps.includes(lib.app))
      : libraryMap

    let librariesCreated = 0
    for (const lib of libraries) {
      const exists = await this.libraryExistsForPath(lib.path)
      if (!exists) {
        try {
          await this.createLibrary(lib.name, lib.type, lib.path)
          librariesCreated++
        } catch (e) {
          debugLog("PlexApi", `Could not create library ${lib.name}: ${e}`)
        }
      }
    }
    return librariesCreated
  }

  /**
   * Run the auto-setup process for Plex
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { env, plexToken, enabledApps } = options

    const healthy = await this.isHealthy()
    if (!healthy) {
      return { success: false, message: "Plex server not reachable" }
    }

    if (plexToken) {
      this.setToken(plexToken)
    } else if (env["API_KEY_PLEX"]) {
      this.setToken(env["API_KEY_PLEX"])
    }

    try {
      const serverInfo = await this.getServerInfo()
      if (serverInfo.claimed) {
        const librariesCreated = await this.createDefaultLibraries(enabledApps)
        return {
          success: true,
          message:
            librariesCreated > 0
              ? `Already claimed, ${librariesCreated} libraries configured`
              : "Already claimed",
          data: {
            machineIdentifier: serverInfo.machineIdentifier,
            version: serverInfo.version,
            librariesCreated,
          },
        }
      }
    } catch (e) {
      const errMsg = String(e)
      if (errMsg.includes("401")) {
        return {
          success: true,
          message: "Already claimed - add API_KEY_PLEX to .env to create libraries",
          data: { requiresWizard: false },
        }
      }
    }

    const claimToken = env["PLEX_CLAIM"]
    if (!claimToken) {
      return {
        success: false,
        message: "No PLEX_CLAIM token. Get one from https://plex.tv/claim (4-min expiry)",
      }
    }

    try {
      await this.claimServer(claimToken)
      const serverInfo = await this.getServerInfo()
      const librariesCreated = await this.createDefaultLibraries(enabledApps)

      return {
        success: true,
        message: `Server claimed, ${librariesCreated} libraries configured`,
        data: {
          machineIdentifier: serverInfo.machineIdentifier,
          version: serverInfo.version,
          librariesCreated,
        },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
