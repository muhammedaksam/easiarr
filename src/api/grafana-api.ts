/**
 * Grafana API Client
 * Handles Grafana auto-setup including admin password change and Prometheus datasource
 */

import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"

interface GrafanaDataSource {
  id?: number
  uid?: string
  orgId?: number
  name: string
  type: string
  access: string
  url: string
  isDefault?: boolean
  jsonData?: Record<string, unknown>
  secureJsonData?: Record<string, unknown>
}

interface GrafanaHealthResponse {
  commit: string
  database: string
  version: string
}

export class GrafanaClient implements IAutoSetupClient {
  private host: string
  private port: number
  private username: string
  private password: string

  constructor(host: string, port: number = 3000, username: string = "admin", password: string = "admin") {
    this.host = host
    this.port = port
    this.username = username
    this.password = password
  }

  /**
   * Get base URL for Grafana
   */
  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  /**
   * Get Basic Auth header
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString("base64")
    return `Basic ${credentials}`
  }

  /**
   * Common headers for Grafana API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: this.getAuthHeader(),
    }
  }

  /**
   * Update credentials (after password change)
   */
  setCredentials(username: string, password: string): void {
    this.username = username
    this.password = password
  }

  /**
   * Check if Grafana is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
      })
      debugLog("GrafanaApi", `Health check: ${response.status}`)
      return response.ok
    } catch (error) {
      debugLog("GrafanaApi", `Health check failed: ${error}`)
      return false
    }
  }

  /**
   * Check if Grafana is already configured (has non-default password)
   */
  async isInitialized(): Promise<boolean> {
    try {
      // Try to login with default credentials
      const response = await fetch(`${this.baseUrl}/api/user`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from("admin:admin").toString("base64")}`,
        },
      })
      // If login with admin:admin fails, it's already configured
      return !response.ok
    } catch {
      return true
    }
  }

  /**
   * Change admin password
   */
  async changeAdminPassword(newPassword: string): Promise<boolean> {
    debugLog("GrafanaApi", "Changing admin password...")

    const response = await fetch(`${this.baseUrl}/api/user/password`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify({
        oldPassword: this.password,
        newPassword: newPassword,
      }),
    })

    if (response.ok) {
      debugLog("GrafanaApi", "Admin password changed successfully")
      this.password = newPassword
      return true
    }

    const text = await response.text()
    debugLog("GrafanaApi", `Failed to change password: ${response.status} - ${text}`)
    return false
  }

  /**
   * Get list of datasources
   */
  async getDataSources(): Promise<GrafanaDataSource[]> {
    const response = await fetch(`${this.baseUrl}/api/datasources`, {
      method: "GET",
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to get datasources: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Check if a datasource with the given name exists
   */
  async dataSourceExists(name: string): Promise<boolean> {
    const dataSources = await this.getDataSources()
    return dataSources.some((ds) => ds.name === name)
  }

  /**
   * Create a Prometheus datasource
   */
  async createPrometheusDataSource(
    name: string = "Prometheus",
    url: string = "http://prometheus:9090",
    isDefault: boolean = true
  ): Promise<boolean> {
    debugLog("GrafanaApi", `Creating Prometheus datasource: ${name} -> ${url}`)

    const payload: GrafanaDataSource = {
      name,
      type: "prometheus",
      access: "proxy",
      url,
      isDefault,
      jsonData: {
        httpMethod: "POST",
        timeInterval: "15s",
      },
    }

    const response = await fetch(`${this.baseUrl}/api/datasources`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      debugLog("GrafanaApi", `Prometheus datasource "${name}" created successfully`)
      return true
    }

    // Check if already exists (409 Conflict)
    if (response.status === 409) {
      debugLog("GrafanaApi", `Datasource "${name}" already exists`)
      return true
    }

    const text = await response.text()
    debugLog("GrafanaApi", `Failed to create datasource: ${response.status} - ${text}`)
    return false
  }

  /**
   * Generate an API key for external integrations
   */
  async createApiKey(name: string = "easiarr", role: string = "Admin"): Promise<string | null> {
    debugLog("GrafanaApi", `Creating API key: ${name}`)

    const response = await fetch(`${this.baseUrl}/api/auth/keys`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        name,
        role,
        secondsToLive: 0, // Never expires
      }),
    })

    if (response.ok) {
      const data = await response.json()
      debugLog("GrafanaApi", "API key created successfully")
      return data.key
    }

    // May already exist
    if (response.status === 409) {
      debugLog("GrafanaApi", "API key already exists")
      return null
    }

    const text = await response.text()
    debugLog("GrafanaApi", `Failed to create API key: ${response.status} - ${text}`)
    return null
  }

  /**
   * Get Grafana server info
   */
  async getServerInfo(): Promise<GrafanaHealthResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
      })

      if (response.ok) {
        return response.json()
      }
    } catch {
      // Ignore
    }
    return null
  }

  /**
   * Run the auto-setup process for Grafana
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Grafana not reachable" }
      }

      // Check if already configured
      const initialized = await this.isInitialized()

      if (!initialized) {
        // First login - change default password
        this.setCredentials("admin", "admin")

        const changed = await this.changeAdminPassword(password)
        if (!changed) {
          return { success: false, message: "Failed to change admin password" }
        }
      } else {
        // Try to login with provided credentials
        this.setCredentials(username, password)

        // Verify login by fetching user
        const response = await fetch(`${this.baseUrl}/api/user`, {
          method: "GET",
          headers: this.getHeaders(),
        })

        if (!response.ok) {
          return { success: false, message: "Login failed - check credentials" }
        }
      }

      // Now configure Prometheus datasource if prometheus is enabled
      // Use container name for internal communication
      const prometheusExists = await this.dataSourceExists("Prometheus")
      if (!prometheusExists) {
        await this.createPrometheusDataSource("Prometheus", "http://prometheus:9090", true)
      }

      // Generate API key for Homepage widget etc.
      const apiKey = await this.createApiKey("easiarr-api-key")

      const envUpdates: Record<string, string> = {}
      if (apiKey) {
        envUpdates["API_KEY_GRAFANA"] = apiKey
      }

      return {
        success: true,
        message: initialized ? "Configured" : "Password changed, Prometheus added",
        envUpdates: Object.keys(envUpdates).length > 0 ? envUpdates : undefined,
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
