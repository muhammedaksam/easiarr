/**
 * qBittorrent WebAPI Client
 * Configures qBittorrent settings via API
 * API docs: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)
 */

import { debugLog } from "../utils/debug"

export interface QBittorrentPreferences {
  save_path?: string
  temp_path_enabled?: boolean
  temp_path?: string
  auto_tmm_enabled?: boolean
  category_changed_tmm_enabled?: boolean
  save_path_changed_tmm_enabled?: boolean
}

export interface QBittorrentCategory {
  name: string
  savePath: string
}

export class QBittorrentClient {
  private baseUrl: string
  private username: string
  private password: string
  private cookie: string | null = null

  constructor(host: string, port: number, username: string, password: string) {
    this.baseUrl = `http://${host}:${port}`
    this.username = username
    this.password = password
  }

  /**
   * Authenticate with qBittorrent WebUI
   * POST /api/v2/auth/login
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
        debugLog("qBittorrent", `Login failed: ${response.status}`)
        return false
      }

      // Extract SID cookie from response
      const setCookie = response.headers.get("set-cookie")
      if (setCookie) {
        const match = setCookie.match(/SID=([^;]+)/)
        if (match) {
          this.cookie = `SID=${match[1]}`
          debugLog("qBittorrent", "Login successful (cookie)")
          return true
        }
      }

      // Check response text for "Ok."
      const text = await response.text()
      const success = text === "Ok."
      debugLog("qBittorrent", `Login response: ${text}, success: ${success}`)
      return success
    } catch (e) {
      debugLog("qBittorrent", `Login error: ${e}`)
      return false
    }
  }

  /**
   * Check if connected to qBittorrent
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
   * GET /api/v2/app/preferences
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
   * POST /api/v2/app/setPreferences
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
   * GET /api/v2/torrents/categories
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
   * POST /api/v2/torrents/createCategory
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

    // 409 means category already exists - that's OK
    if (!response.ok && response.status !== 409) {
      throw new Error(`Failed to create category: ${response.status}`)
    }
  }

  /**
   * Edit a category's save path
   * POST /api/v2/torrents/editCategory
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
   * Sets proper save paths and creates categories based on enabled *arr apps
   * @param categories - Array of {name, savePath} for each enabled *arr app
   * @param auth - Optional credentials to enforce (update username/password)
   */
  async configureTRaSHCompliant(
    categories: QBittorrentCategory[] = [],
    auth?: { user: string; pass: string }
  ): Promise<void> {
    debugLog("qBittorrent", "Configuring TRaSH-compliant settings")

    // 1. Set global preferences
    debugLog("qBittorrent", "Setting save_path to /data/torrents")
    const prefs: Record<string, unknown> = {
      save_path: "/data/torrents",
      temp_path_enabled: false,
      auto_tmm_enabled: true,
      category_changed_tmm_enabled: true,
      save_path_changed_tmm_enabled: true,
    }

    if (auth) {
      debugLog("qBittorrent", "Setting WebUI username/password")
      prefs.web_ui_username = auth.user
      prefs.web_ui_password = auth.pass
    }

    await this.setPreferences(prefs)

    // 2. Create categories for each enabled media type
    for (const cat of categories) {
      debugLog("qBittorrent", `Creating category: ${cat.name} -> ${cat.savePath}`)
      try {
        await this.createCategory(cat.name, cat.savePath)
      } catch {
        // Try to update existing category
        try {
          await this.editCategory(cat.name, cat.savePath)
        } catch {
          // Ignore - category might not exist or be locked
        }
      }
    }
    debugLog("qBittorrent", "TRaSH configuration complete")
  }
}
