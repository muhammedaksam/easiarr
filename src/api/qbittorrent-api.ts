/**
 * qBittorrent WebAPI Client
 * Configures qBittorrent settings via API
 * API docs: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { debugLog } from "~/utils/debug"
import { BaseApiClient } from "./base-api"

export interface QBittorrentPreferences {
  save_path?: string
  temp_path_enabled?: boolean
  temp_path?: string
  auto_tmm_enabled?: boolean
  category_changed_tmm_enabled?: boolean
  save_path_changed_tmm_enabled?: boolean
  max_ratio?: number
  max_ratio_enabled?: boolean
  max_ratio_act?: number
  max_seeding_time?: number
  max_seeding_time_enabled?: boolean
  queueing_enabled?: boolean
  web_ui_username?: string
  web_ui_password?: string
  listen_port?: number
  upnp?: boolean
  natpmp?: boolean
  dl_limit?: number
  up_limit?: number
  limit_utp_rate?: boolean
  limit_tcp_overhead?: boolean
  limit_lan_peers?: boolean
  enable_dht?: boolean
  enable_pex?: boolean
  enable_lsd?: boolean
  encryption_mode?: number
  anonymous_mode?: boolean
  add_trackers_enabled?: boolean
  pre_allocate_all?: boolean
  incomplete_files_ext?: boolean
  create_subfolder_enabled?: boolean
}

export interface QBittorrentCategory {
  name: string
  savePath: string
}

export class QBittorrentClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "qBittorrent"
  private username: string
  private password: string
  private cookie: string | null = null

  constructor(host: string, port: number, username: string, password: string) {
    super(host, port)
    this.username = username
    this.password = password
  }

  /**
   * Authenticate with qBittorrent WebUI
   */
  async login(): Promise<boolean> {
    try {
      debugLog("qBittorrent", `Logging in to ${this.baseUrl} as ${this.username}`)
      const response = await fetch(`${this.baseUrl}/api/v2/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`,
      })

      if (!response.ok) {
        return false
      }

      const setCookie = response.headers.get("set-cookie")
      if (setCookie) {
        const match = setCookie.match(/SID=([^;]+)/)
        if (match) {
          this.cookie = `SID=${match[1]}`
          return true
        }
      }

      const text = await response.text()
      return text === "Ok."
    } catch {
      return false
    }
  }

  /**
   * Check if connected
   */
  async isConnected(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/app/version`, {
        headers: this.cookie ? { Cookie: this.cookie } : {},
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get current preferences
   */
  async getPreferences(): Promise<QBittorrentPreferences> {
    const response = await fetch(`${this.baseUrl}/api/v2/app/preferences`, {
      headers: this.cookie ? { Cookie: this.cookie } : {},
    })

    if (!response.ok) {
      throw new Error(`Failed to get preferences: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Set preferences
   */
  async setPreferences(prefs: QBittorrentPreferences): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v2/app/setPreferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: `json=${encodeURIComponent(JSON.stringify(prefs))}`,
    })

    if (!response.ok) {
      throw new Error(`Failed to set preferences: ${response.status}`)
    }
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<Record<string, { name: string; savePath: string }>> {
    const response = await fetch(`${this.baseUrl}/api/v2/torrents/categories`, {
      headers: this.cookie ? { Cookie: this.cookie } : {},
    })

    if (!response.ok) {
      throw new Error(`Failed to get categories: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Create a category
   */
  async createCategory(name: string, savePath: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v2/torrents/createCategory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: `category=${encodeURIComponent(name)}&savePath=${encodeURIComponent(savePath)}`,
    })

    if (!response.ok && response.status !== 409) {
      throw new Error(`Failed to create category: ${response.status}`)
    }
  }

  /**
   * Edit a category's save path
   */
  async editCategory(name: string, savePath: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v2/torrents/editCategory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: `category=${encodeURIComponent(name)}&savePath=${encodeURIComponent(savePath)}`,
    })

    if (!response.ok) {
      throw new Error(`Failed to edit category: ${response.status}`)
    }
  }

  /**
   * Configure qBittorrent for TRaSH Guide compliance
   */
  async configureTRaSHCompliant(
    categories: QBittorrentCategory[] = [],
    auth?: { user: string; pass: string }
  ): Promise<void> {
    debugLog("qBittorrent", "Configuring TRaSH-compliant settings")

    const prefs: Record<string, unknown> = {
      save_path: "/data/torrents",
      temp_path_enabled: false,
      auto_tmm_enabled: true,
      category_changed_tmm_enabled: true,
      save_path_changed_tmm_enabled: true,
      pre_allocate_all: false,
      incomplete_files_ext: true,
      create_subfolder_enabled: true,
      upnp: false,
      natpmp: false,
      dl_limit: -1,
      up_limit: -1,
      limit_utp_rate: true,
      limit_tcp_overhead: false,
      limit_lan_peers: true,
      enable_dht: true,
      enable_pex: true,
      enable_lsd: true,
      encryption_mode: 0,
      anonymous_mode: false,
      add_trackers_enabled: false,
      queueing_enabled: true,
      max_ratio: -1,
      max_ratio_enabled: false,
      max_seeding_time_enabled: false,
      max_ratio_act: 0,
    }

    if (auth) {
      prefs.web_ui_username = auth.user
      prefs.web_ui_password = auth.pass
    }

    await this.setPreferences(prefs)

    for (const cat of categories) {
      try {
        await this.createCategory(cat.name, cat.savePath)
      } catch {
        try {
          await this.editCategory(cat.name, cat.savePath)
        } catch {
          // Ignore
        }
      }
    }
  }

  /**
   * Check if qBittorrent is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/app/version`)
      return response.ok || response.status === 403
    } catch {
      return false
    }
  }

  /**
   * Check if already configured
   */
  async isInitialized(): Promise<boolean> {
    return this.isConnected()
  }

  /**
   * Run the auto-setup process
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "qBittorrent not reachable" }
      }

      this.username = username
      this.password = password

      const loggedIn = await this.login()
      if (!loggedIn) {
        return { success: false, message: "Login failed - check credentials" }
      }

      await this.configureTRaSHCompliant([], { user: username, pass: password })

      return {
        success: true,
        message: "Configured with TRaSH-compliant settings",
        data: { trashCompliant: true },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
