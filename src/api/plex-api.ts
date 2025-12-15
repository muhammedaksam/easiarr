/**
 * Plex API Client
 * Handles Plex Media Server auto-setup including server claiming and library creation
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

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

export class PlexApiClient implements IAutoSetupClient {
  private host: string
  private port: number
  private token?: string

  constructor(host: string, port: number = 32400, token?: string) {
    this.host = host
    this.port = port
    this.token = token
  }

  /**
   * Set the Plex token for authenticated requests
   */
  setToken(token: string): void {
    this.token = token
  }

  /**
   * Get base URL for local Plex server
   */
  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`
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
    try {
      const response = await fetch(`${this.baseUrl}/identity`, {
        method: "GET",
        headers: this.getHeaders(),
      })
      debugLog("PlexApi", `Health check: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("PlexApi", `Health check failed: ${error}`)
      return false
    }
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
   * The claim token has a 4-minute expiry
   */
  async claimServer(claimToken: string): Promise<void> {
    debugLog("PlexApi", "Claiming server with token...")

    // Claim token should start with "claim-"
    const token = claimToken.startsWith("claim-") ? claimToken : `claim-${claimToken}`

    const response = await fetch(`${this.baseUrl}/myplex/claim?token=${token}`, {
      method: "POST",
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to claim server: ${response.status} - ${text}`)
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
   * @param name - Display name for the library
   * @param type - Library type: movie, show, artist (music)
   * @param path - Path to media files (inside container)
   * @param language - Language code (default: en-US)
   */
  async createLibrary(
    name: string,
    type: "movie" | "show" | "artist",
    path: string,
    language: string = "en-US"
  ): Promise<void> {
    debugLog("PlexApi", `Creating library: ${name} (${type}) at ${path}`)

    // Map type to agent and scanner
    const agents: Record<string, { agent: string; scanner: string }> = {
      movie: {
        agent: "tv.plex.agents.movie",
        scanner: "Plex Movie",
      },
      show: {
        agent: "tv.plex.agents.series",
        scanner: "Plex TV Series",
      },
      artist: {
        agent: "tv.plex.agents.music",
        scanner: "Plex Music",
      },
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
      "location[0]": path,
    })

    const response = await fetch(`${this.baseUrl}/library/sections?${params.toString()}`, {
      method: "POST",
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to create library: ${response.status} - ${text}`)
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
   * Run the auto-setup process for Plex
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { env } = options

    // Check if server is reachable
    const healthy = await this.isHealthy()
    if (!healthy) {
      return { success: false, message: "Plex server not reachable" }
    }

    // Check if already claimed
    const initialized = await this.isInitialized()
    if (initialized) {
      return { success: true, message: "Already claimed" }
    }

    // Get claim token from environment
    const claimToken = env["PLEX_CLAIM"]
    if (!claimToken) {
      return {
        success: false,
        message: "No PLEX_CLAIM token. Get one from https://plex.tv/claim (4-min expiry)",
      }
    }

    try {
      // Claim the server
      await this.claimServer(claimToken)

      // Create default libraries if paths exist
      const libraries = [
        { name: "Movies", type: "movie" as const, path: "/data/media/movies" },
        { name: "TV Shows", type: "show" as const, path: "/data/media/tv" },
        { name: "Music", type: "artist" as const, path: "/data/media/music" },
      ]

      for (const lib of libraries) {
        const exists = await this.libraryExistsForPath(lib.path)
        if (!exists) {
          try {
            await this.createLibrary(lib.name, lib.type, lib.path)
          } catch (e) {
            // Library creation may fail if path doesn't exist - that's OK
            debugLog("PlexApi", `Could not create library ${lib.name}: ${e}`)
          }
        }
      }

      return { success: true, message: "Server claimed, libraries configured" }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
