/**
 * Huntarr API Client
 * Provides health check, version info, and auto-setup for Huntarr
 * Configures Sonarr, Radarr, Lidarr, Readarr, Whisparr instances automatically
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import type { AppConfig } from "~/config/schema"
import { getApp } from "~/apps/registry"
import { BaseApiClient } from "./base-api"

interface HuntarrVersion {
  version: string
}

interface TestConnectionResult {
  success: boolean
  message?: string
  version?: string
}

interface HuntarrInstance {
  name: string
  api_url: string
  api_key: string
  enabled?: boolean
  [key: string]: unknown
}

interface HuntarrAppSettings {
  instances?: HuntarrInstance[]
  [key: string]: unknown
}

const HUNTARR_APP_TYPES = ["sonarr", "radarr", "lidarr", "readarr", "whisparr"] as const
type HuntarrAppType = (typeof HUNTARR_APP_TYPES)[number]

export class HuntarrClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "HuntarrApi"
  private sessionCookie: string | null = null

  constructor(host: string, port: number = 9705) {
    super(host, port)
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    }
    if (this.sessionCookie) {
      headers["Cookie"] = `huntarr_session=${this.sessionCookie}`
    }
    return headers
  }

  async userExists(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/setup/status`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      })
      const data = await response.json()
      return data.user_exists === true
    } catch {
      return false
    }
  }

  async createUser(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          confirm_password: password,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        const setCookie = response.headers.get("set-cookie")
        if (setCookie) {
          const match = setCookie.match(/huntarr_session=([^;]+)/)
          if (match) {
            this.sessionCookie = match[1]
          }
        }
        await this.completeSetup(username)
        await this.enableLocalAccessBypass()
        return true
      }
    } catch {
      // Ignore
    }
    return false
  }

  async enableLocalAccessBypass(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/settings/general`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ local_access_bypass: true }),
        signal: AbortSignal.timeout(10000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async completeSetup(username: string): Promise<boolean> {
    try {
      const progress = {
        current_step: 6,
        completed_steps: [1, 2, 3, 4, 5],
        account_created: true,
        two_factor_enabled: false,
        plex_setup_done: false,
        auth_mode_selected: false,
        recovery_key_generated: true,
        username,
        timestamp: new Date().toISOString(),
      }

      const saveResponse = await fetch(`${this.baseUrl}/api/setup/progress`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ progress }),
        signal: AbortSignal.timeout(5000),
      })

      if (!saveResponse.ok) return false

      const clearResponse = await fetch(`${this.baseUrl}/api/setup/clear`, {
        method: "POST",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      })

      return clearResponse.ok
    } catch {
      return false
    }
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        const setCookie = response.headers.get("set-cookie")
        if (setCookie) {
          const match = setCookie.match(/huntarr_session=([^;]+)/)
          if (match) {
            this.sessionCookie = match[1]
            return true
          }
        }
        const data = await response.json()
        return data.success === true
      }
    } catch {
      // Ignore
    }
    return false
  }

  async authenticate(username: string, password: string): Promise<boolean> {
    const exists = await this.userExists()

    if (!exists) {
      return await this.createUser(username, password)
    }

    const loggedIn = await this.login(username, password)
    if (loggedIn) {
      await this.enableLocalAccessBypass()
    }
    return loggedIn
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async isInitialized(): Promise<boolean> {
    return this.isHealthy()
  }

  async getVersion(): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        const data = (await response.json()) as HuntarrVersion
        return data.version
      }
    } catch {
      // Ignore
    }
    return null
  }

  async testConnection(
    appType: HuntarrAppType,
    apiUrl: string,
    apiKey: string
  ): Promise<TestConnectionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/${appType}/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_url: apiUrl,
          api_key: apiKey,
          api_timeout: 30,
        }),
        signal: AbortSignal.timeout(35000),
      })

      return (await response.json()) as TestConnectionResult
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }

  async getSettings(appType: HuntarrAppType): Promise<HuntarrAppSettings | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/settings/${appType}`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        return (await response.json()) as HuntarrAppSettings
      }
    } catch {
      // Ignore
    }
    return null
  }

  async saveSettings(appType: HuntarrAppType, settings: HuntarrAppSettings): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/settings/${appType}`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(settings),
        signal: AbortSignal.timeout(10000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async addArrInstance(
    appType: HuntarrAppType,
    name: string,
    apiUrl: string,
    apiKey: string
  ): Promise<boolean> {
    try {
      const settings = await this.getSettings(appType)

      if (!settings) {
        return await this.saveSettings(appType, {
          instances: [{ name, api_url: apiUrl, api_key: apiKey, enabled: true }],
        })
      }

      if (!settings.instances) settings.instances = []

      const existingByUrl = settings.instances.find((i) => i.api_url === apiUrl && i.api_key)
      if (existingByUrl) return true

      const emptyInstance = settings.instances.find((i) => !i.api_url || !i.api_key)
      if (emptyInstance) {
        emptyInstance.name = name
        emptyInstance.api_url = apiUrl
        emptyInstance.api_key = apiKey
        emptyInstance.enabled = true
      } else {
        settings.instances.push({
          name,
          api_url: apiUrl,
          api_key: apiKey,
          enabled: true,
        })
      }

      return await this.saveSettings(appType, settings)
    } catch {
      return false
    }
  }

  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { env } = options
    const results: Array<{ app: string; success: boolean; message?: string }> = []

    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Huntarr not reachable" }
      }

      const version = await this.getVersion()

      for (const appType of HUNTARR_APP_TYPES) {
        const apiKeyEnvName = `API_KEY_${appType.toUpperCase()}`
        const apiKey = env[apiKeyEnvName]

        if (!apiKey) continue

        const appDef = getApp(appType)
        const port = appDef?.defaultPort ?? 8989
        const apiUrl = `http://${appType}:${port}`

        const result = await this.testConnection(appType, apiUrl, apiKey)
        results.push({
          app: appType,
          success: result.success,
          message: result.message,
        })
      }

      const successCount = results.filter((r) => r.success).length
      const failCount = results.filter((r) => !r.success).length

      if (results.length === 0) {
        return {
          success: true,
          message: "No *arr apps configured with API keys",
          data: { version },
        }
      }

      if (failCount === 0) {
        return {
          success: true,
          message: `All ${successCount} *arr connections verified`,
          data: { version, results },
        }
      }

      return {
        success: successCount > 0,
        message: `${successCount} succeeded, ${failCount} failed.`,
        data: { version, results },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }

  async setupEasiarrApps(
    apps: AppConfig[],
    env: Record<string, string>
  ): Promise<{
    added: number
    skipped: number
    results: Array<{ app: string; success: boolean; message?: string }>
  }> {
    const results: Array<{ app: string; success: boolean; message?: string }> = []

    for (const appConfig of apps) {
      if (!appConfig.enabled) continue
      if (!HUNTARR_APP_TYPES.includes(appConfig.id as HuntarrAppType)) continue

      const appType = appConfig.id as HuntarrAppType
      const apiKey = env[`API_KEY_${appType.toUpperCase()}`]

      if (!apiKey) continue

      const appDef = getApp(appType)
      const port = appDef?.defaultPort ?? 8989
      const apiUrl = `http://${appType}:${port}`
      const instanceName = appDef?.name ?? appType

      const added = await this.addArrInstance(appType, instanceName, apiUrl, apiKey)
      results.push({
        app: appType,
        success: added,
        message: added ? "Added to Huntarr" : "Failed to add",
      })
    }

    const prowlarrConfig = apps.find((a) => a.id === "prowlarr" && a.enabled)
    if (prowlarrConfig) {
      const prowlarrApiKey = env["API_KEY_PROWLARR"]
      if (prowlarrApiKey) {
        const prowlarrDef = getApp("prowlarr")
        const prowlarrPort = prowlarrConfig.port || prowlarrDef?.defaultPort || 9696
        const prowlarrUrl = `http://prowlarr:${prowlarrPort}`

        const configured = await this.configureProwlarr(prowlarrUrl, prowlarrApiKey)
        results.push({
          app: "prowlarr",
          success: configured,
          message: configured ? "Configured in Huntarr" : "Failed to configure",
        })
      }
    }

    return {
      added: results.filter((r) => r.success).length,
      skipped: results.filter((r) => !r.success).length,
      results,
    }
  }

  async configureProwlarr(apiUrl: string, apiKey: string): Promise<boolean> {
    try {
      const settings = {
        api_url: apiUrl,
        api_key: apiKey,
        name: "Prowlarr",
        enabled: true,
      }

      const response = await fetch(`${this.baseUrl}/api/settings/prowlarr`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(settings),
        signal: AbortSignal.timeout(10000),
      })

      return response.ok
    } catch {
      return false
    }
  }
}
