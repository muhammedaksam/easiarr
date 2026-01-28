/**
 * Portainer API Client
 * Handles Portainer-specific API calls for initialization and management
 */

import type { AutoSetupOptions, AutoSetupResult, IAutoSetupClient } from "./auto-setup-types"
import { debugLog } from "~/utils/debug"
import { ensureMinPasswordLength } from "~/utils/password"
import { BaseApiClient } from "./base-api"

// Portainer requires minimum 12 character password
export const PORTAINER_MIN_PASSWORD_LENGTH = 12

export interface PortainerUser {
  Id?: number
  Username: string
  Password?: string
  Role?: number
}

export interface PortainerInitResult {
  user: PortainerUser
  actualPassword: string
  passwordWasPadded: boolean
}

export interface PortainerStatus {
  Version: string
  InstanceID: string
}

export interface PortainerSettings {
  AuthenticationMethod: number
  LogoURL: string
  BlackListedLabels: string[]
  InternalAuthSettings: {
    RequiredPasswordLength: number
  }
}

export interface PortainerAuthResponse {
  jwt: string
}

export interface PortainerApiKeyResponse {
  rawAPIKey: string
  apiKey: {
    id: number
    userId: number
    description: string
    prefix: string
    dateCreated: number
    lastUsed: number
    digest: string
  }
}

export class PortainerApiClient extends BaseApiClient implements IAutoSetupClient {
  protected readonly logPrefix = "PortainerAPI"
  private jwtToken: string | null = null
  private apiKey: string | null = null

  constructor(host: string, port: number) {
    super(host, port)
  }

  /**
   * Set API key for authentication
   */
  setApiKey(key: string): void {
    if (key) {
      this.apiKey = key
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    }

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey
    } else if (this.jwtToken) {
      headers["Authorization"] = `Bearer ${this.jwtToken}`
    }

    debugLog("PortainerAPI", `${options.method || "GET"} ${url}`)

    const response = await fetch(url, { ...options, headers })
    const text = await response.text()

    if (!response.ok) {
      throw new Error(`Portainer API request failed: ${response.status} ${response.statusText}`)
    }

    if (!text) return {} as T
    return JSON.parse(text) as T
  }

  /**
   * Check if Portainer needs initialization
   */
  async needsInitialization(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/users/admin/check`)
      return response.status === 404
    } catch {
      return false
    }
  }

  /**
   * Login to Portainer
   */
  async login(username: string, password: string): Promise<string> {
    const safePassword = ensureMinPasswordLength(password, PORTAINER_MIN_PASSWORD_LENGTH)
    const response = await this.request<PortainerAuthResponse>("/auth", {
      method: "POST",
      body: JSON.stringify({ username, password: safePassword }),
    })
    this.jwtToken = response.jwt
    return response.jwt
  }

  /**
   * Initialize the admin user
   */
  async initializeAdmin(username: string, password: string): Promise<PortainerInitResult | null> {
    const needsInit = await this.needsInitialization()
    if (!needsInit) {
      return null
    }

    const safePassword = ensureMinPasswordLength(password, PORTAINER_MIN_PASSWORD_LENGTH)
    const wasPadded = safePassword !== password

    const user = await this.request<PortainerUser>("/users/admin/init", {
      method: "POST",
      body: JSON.stringify({ Username: username, Password: safePassword }),
    })

    await this.login(username, safePassword)

    return { user, actualPassword: safePassword, passwordWasPadded: wasPadded }
  }

  /**
   * Generate an API key
   */
  async generateApiKey(
    password: string,
    description: string = "easiarr-api-key",
    userId: number = 1
  ): Promise<string> {
    if (!this.jwtToken) {
      throw new Error("Must be logged in to generate API key")
    }

    const safePassword = ensureMinPasswordLength(password, PORTAINER_MIN_PASSWORD_LENGTH)
    const response = await this.request<PortainerApiKeyResponse>(`/users/${userId}/tokens`, {
      method: "POST",
      body: JSON.stringify({ password: safePassword, description }),
    })

    return response.rawAPIKey
  }

  /**
   * Get Portainer status
   */
  async getStatus(): Promise<PortainerStatus> {
    return this.request<PortainerStatus>("/status")
  }

  /**
   * Check if Portainer is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.getStatus()
      return true
    } catch {
      return false
    }
  }

  // ==========================================
  // Container Management Methods
  // ==========================================

  async getEndpoints(): Promise<PortainerEndpoint[]> {
    return this.request<PortainerEndpoint[]>("/endpoints")
  }

  async getLocalEnvironmentId(): Promise<number | null> {
    try {
      const endpoints = await this.getEndpoints()
      const socketEndpoint = endpoints.find(
        (e) => e.URL === "unix:///var/run/docker.sock" || e.URL.includes("docker.sock")
      )
      if (socketEndpoint) return socketEndpoint.Id

      const localEndpoint = endpoints.find((e) => e.Name.toLowerCase() === "local")
      if (localEndpoint) return localEndpoint.Id

      if (endpoints.length > 0) return endpoints[0].Id
      return null
    } catch {
      return null
    }
  }

  async getContainers(endpointId: number = 1): Promise<PortainerContainer[]> {
    return this.request<PortainerContainer[]>(
      `/endpoints/${endpointId}/docker/containers/json?all=true`
    )
  }

  async startContainer(containerId: string, endpointId: number = 1): Promise<void> {
    await this.request(`/endpoints/${endpointId}/docker/containers/${containerId}/start`, {
      method: "POST",
    })
  }

  async stopContainer(containerId: string, endpointId: number = 1): Promise<void> {
    await this.request(`/endpoints/${endpointId}/docker/containers/${containerId}/stop`, {
      method: "POST",
    })
  }

  async restartContainer(containerId: string, endpointId: number = 1): Promise<void> {
    await this.request(`/endpoints/${endpointId}/docker/containers/${containerId}/restart`, {
      method: "POST",
    })
  }

  async getContainerLogs(
    containerId: string,
    endpointId: number = 1,
    options: { stdout?: boolean; stderr?: boolean; tail?: number } = {}
  ): Promise<string> {
    const { stdout = true, stderr = true, tail = 100 } = options
    const params = new URLSearchParams({
      stdout: String(stdout),
      stderr: String(stderr),
      tail: String(tail),
    })
    return this.request<string>(
      `/endpoints/${endpointId}/docker/containers/${containerId}/logs?${params}`
    )
  }

  async getContainerStats(
    containerId: string,
    endpointId: number = 1
  ): Promise<PortainerContainerStats> {
    return this.request<PortainerContainerStats>(
      `/endpoints/${endpointId}/docker/containers/${containerId}/stats?stream=false`
    )
  }

  /**
   * Check if already configured
   */
  async isInitialized(): Promise<boolean> {
    return !(await this.needsInitialization())
  }

  /**
   * Run the auto-setup process
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Portainer not reachable" }
      }

      const needsInit = await this.needsInitialization()

      let actualPassword = ensureMinPasswordLength(password, PORTAINER_MIN_PASSWORD_LENGTH)
      let passwordPadded = actualPassword !== password
      let apiKey: string | undefined

      if (needsInit) {
        const result = await this.initializeAdmin(username, password)
        if (result) {
          actualPassword = result.actualPassword
          passwordPadded = result.passwordWasPadded
        }

        try {
          apiKey = await this.generateApiKey(actualPassword)
        } catch {
          // API key generation may fail
        }
      } else {
        try {
          await this.login(username, actualPassword)
        } catch {
          return { success: false, message: "Login failed - check credentials" }
        }
      }

      const envId = await this.getLocalEnvironmentId()

      return {
        success: true,
        message: needsInit
          ? passwordPadded
            ? `Admin created (password padded to ${PORTAINER_MIN_PASSWORD_LENGTH} chars)`
            : "Admin created"
          : "Logged in",
        data: {
          adminCreated: needsInit,
          passwordPadded,
          apiKey,
          environmentId: envId,
        },
        envUpdates: {
          ...(apiKey ? { API_KEY_PORTAINER: apiKey } : {}),
          ...(envId ? { PORTAINER_ENV: String(envId) } : {}),
          ...(passwordPadded ? { PASSWORD_PORTAINER: actualPassword } : {}),
        },
      }
    } catch (error) {
      return { success: false, message: `${error}` }
    }
  }
}

// ==========================================
// Additional Type Definitions
// ==========================================

export interface PortainerEndpoint {
  Id: number
  Name: string
  Type: number
  Status: number
  URL: string
}

export interface PortainerContainer {
  Id: string
  Names: string[]
  Image: string
  State: string
  Status: string
  Ports: Array<{
    IP?: string
    PrivatePort: number
    PublicPort?: number
    Type: string
  }>
  Labels: Record<string, string>
  Created: number
}

export interface PortainerContainerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number }
    system_cpu_usage: number
    online_cpus: number
  }
  memory_stats: {
    usage: number
    limit: number
  }
}
