/**
 * Grafana API Client
 * Handles Grafana auto-setup including admin password change and Prometheus datasource
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { BaseApiClient } from "./base-api"

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

export class GrafanaClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "GrafanaApi"
  private username: string
  private password: string

  constructor(
    host: string,
    port: number = 3000,
    username: string = "admin",
    password: string = "admin"
  ) {
    super(host, port)
    this.username = username
    this.password = password
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
    const response = await this.get<GrafanaHealthResponse>("/api/health")
    return response.success
  }

  /**
   * Check if Grafana is already configured (has non-default password)
   */
  async isInitialized(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/user`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from("admin:admin").toString("base64")}`,
        },
      })
      return !response.ok
    } catch {
      return true
    }
  }

  /**
   * Change admin password
   */
  async changeAdminPassword(newPassword: string): Promise<boolean> {
    const response = await this.put<unknown, { oldPassword: string; newPassword: string }>(
      "/api/user/password",
      { oldPassword: this.password, newPassword },
      { headers: this.getHeaders() }
    )

    if (response.success) {
      this.password = newPassword
      return true
    }
    return false
  }

  /**
   * Get list of datasources
   */
  async getDataSources(): Promise<GrafanaDataSource[]> {
    const response = await this.get<GrafanaDataSource[]>("/api/datasources", {
      headers: this.getHeaders(),
    })
    return response.data ?? []
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

    const response = await this.post<unknown, GrafanaDataSource>("/api/datasources", payload, {
      headers: this.getHeaders(),
    })

    // Success or already exists (409)
    return response.success || response.status === 409
  }

  /**
   * Generate an API key for external integrations
   */
  async createApiKey(name: string = "easiarr", role: string = "Admin"): Promise<string | null> {
    const response = await this.post<
      { key: string },
      { name: string; role: string; secondsToLive: number }
    >("/api/auth/keys", { name, role, secondsToLive: 0 }, { headers: this.getHeaders() })

    if (response.success && response.data?.key) {
      return response.data.key
    }
    return null
  }

  /**
   * Get Grafana server info
   */
  async getServerInfo(): Promise<GrafanaHealthResponse | null> {
    const response = await this.get<GrafanaHealthResponse>("/api/health")
    return response.data ?? null
  }

  /**
   * Run the auto-setup process for Grafana
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Grafana not reachable" }
      }

      const initialized = await this.isInitialized()

      if (!initialized) {
        this.setCredentials("admin", "admin")
        const changed = await this.changeAdminPassword(password)
        if (!changed) {
          return { success: false, message: "Failed to change admin password" }
        }
      } else {
        this.setCredentials(username, password)
        const response = await fetch(`${this.baseUrl}/api/user`, {
          method: "GET",
          headers: this.getHeaders(),
        })
        if (!response.ok) {
          return { success: false, message: "Login failed - check credentials" }
        }
      }

      const prometheusExists = await this.dataSourceExists("Prometheus")
      if (!prometheusExists) {
        await this.createPrometheusDataSource("Prometheus", "http://prometheus:9090", true)
      }

      const apiKey = await this.createApiKey("easiarr-api-key")

      return {
        success: true,
        message: initialized ? "Configured" : "Password changed, Prometheus added",
        data: apiKey ? { apiKey } : undefined,
        envUpdates: apiKey ? { API_KEY_GRAFANA: apiKey } : undefined,
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}
