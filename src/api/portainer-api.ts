/**
 * Portainer API Client
 * Handles Portainer-specific API calls for initialization and management
 */

import { debugLog } from "../utils/debug"
import { ensureMinPasswordLength } from "../utils/password"

// Portainer requires minimum 12 character password
export const PORTAINER_MIN_PASSWORD_LENGTH = 12

export interface PortainerUser {
  Id?: number
  Username: string
  Password?: string
  Role?: number
}

// Result from admin initialization - includes actual password used
export interface PortainerInitResult {
  user: PortainerUser
  /** The actual password used (may be padded if global was < 12 chars) */
  actualPassword: string
  /** True if password was modified (padded) from the original */
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

// Auth response from login
export interface PortainerAuthResponse {
  jwt: string
}

// API Key creation response
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

/**
 * Portainer API Client
 */
export class PortainerApiClient {
  private baseUrl: string
  private jwtToken: string | null = null
  private apiKey: string | null = null

  constructor(host: string, port: number) {
    this.baseUrl = `http://${host}:${port}`
  }

  /**
   * Set API key for authentication (alternative to JWT login)
   * @param apiKey - The Portainer API key (e.g., ptr_xxx)
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

    // Add authentication - prefer API key, fallback to JWT
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey
    } else if (this.jwtToken) {
      headers["Authorization"] = `Bearer ${this.jwtToken}`
    }

    debugLog("PortainerAPI", `${options.method || "GET"} ${url}`)
    if (options.body) {
      debugLog("PortainerAPI", `Request Body: ${options.body}`)
    }

    const response = await fetch(url, { ...options, headers })
    const text = await response.text()

    debugLog("PortainerAPI", `Response ${response.status} from ${endpoint}`)
    if (text && text.length < 2000) {
      debugLog("PortainerAPI", `Response Body: ${text}`)
    }

    if (!response.ok) {
      throw new Error(`Portainer API request failed: ${response.status} ${response.statusText} - ${text}`)
    }

    if (!text) return {} as T
    return JSON.parse(text) as T
  }

  /**
   * Check if Portainer needs initial admin user setup.
   * Returns true if no admin user exists yet.
   */
  async needsInitialization(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/users/admin/check`)
      // 404 means no admin exists yet - needs initialization
      // 204 means admin already exists
      return response.status === 404
    } catch (error) {
      debugLog("PortainerAPI", `Check admin error: ${error}`)
      return false
    }
  }

  /**
   * Login to Portainer and store JWT token for subsequent requests.
   *
   * @param username - Admin username
   * @param password - Admin password
   * @returns JWT token
   */
  async login(username: string, password: string): Promise<string> {
    const safePassword = ensureMinPasswordLength(password, PORTAINER_MIN_PASSWORD_LENGTH)

    const response = await this.request<PortainerAuthResponse>("/auth", {
      method: "POST",
      body: JSON.stringify({
        username,
        password: safePassword,
      }),
    })

    this.jwtToken = response.jwt
    return response.jwt
  }

  /**
   * Initialize the admin user for a fresh Portainer installation.
   * Password will be automatically padded if shorter than 12 characters.
   * Automatically logs in after initialization.
   *
   * @param username - Admin username
   * @param password - Admin password (will be padded if needed)
   * @returns Init result with user, actual password, and padding flag - or null if already initialized
   */
  async initializeAdmin(username: string, password: string): Promise<PortainerInitResult | null> {
    // Check if initialization is needed
    const needsInit = await this.needsInitialization()
    if (!needsInit) {
      debugLog("PortainerAPI", "Admin already initialized, skipping")
      return null
    }

    // Ensure password meets Portainer's minimum length requirement
    const safePassword = ensureMinPasswordLength(password, PORTAINER_MIN_PASSWORD_LENGTH)
    const wasPadded = safePassword !== password

    if (wasPadded) {
      debugLog("PortainerAPI", `Password padded from ${password.length} to ${safePassword.length} characters`)
    }

    const user = await this.request<PortainerUser>("/users/admin/init", {
      method: "POST",
      body: JSON.stringify({
        Username: username,
        Password: safePassword,
      }),
    })

    // Auto-login after initialization
    await this.login(username, safePassword)

    return {
      user,
      actualPassword: safePassword,
      passwordWasPadded: wasPadded,
    }
  }

  /**
   * Generate a permanent API key for the authenticated user.
   * Must be logged in first (call login() or initializeAdmin()).
   *
   * @param userId - User ID (default: 1 for admin)
   * @param description - Description for the API key
   * @param password - User password for confirmation
   * @returns Raw API key to save to .env as API_KEY_PORTAINER
   */
  async generateApiKey(password: string, description: string = "easiarr-api-key", userId: number = 1): Promise<string> {
    if (!this.jwtToken) {
      throw new Error("Must be logged in to generate API key. Call login() first.")
    }

    const safePassword = ensureMinPasswordLength(password, PORTAINER_MIN_PASSWORD_LENGTH)

    const response = await this.request<PortainerApiKeyResponse>(`/users/${userId}/tokens`, {
      method: "POST",
      body: JSON.stringify({
        password: safePassword,
        description,
      }),
    })

    return response.rawAPIKey
  }

  /**
   * Get Portainer system status
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

  /**
   * Get list of Docker endpoints
   */
  async getEndpoints(): Promise<PortainerEndpoint[]> {
    return this.request<PortainerEndpoint[]>("/endpoints")
  }

  /**
   * Get the local Docker socket environment ID.
   * Finds the first endpoint that uses unix:///var/run/docker.sock or is named "local".
   * @returns The environment ID or null if not found
   */
  async getLocalEnvironmentId(): Promise<number | null> {
    try {
      const endpoints = await this.getEndpoints()

      // First, try to find one using Docker socket
      const socketEndpoint = endpoints.find(
        (e) => e.URL === "unix:///var/run/docker.sock" || e.URL.includes("docker.sock")
      )
      if (socketEndpoint) {
        return socketEndpoint.Id
      }

      // Fallback: find one named "local"
      const localEndpoint = endpoints.find((e) => e.Name.toLowerCase() === "local")
      if (localEndpoint) {
        return localEndpoint.Id
      }

      // Last resort: return the first endpoint if any exist
      if (endpoints.length > 0) {
        return endpoints[0].Id
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Get all containers for an endpoint
   */
  async getContainers(endpointId: number = 1): Promise<PortainerContainer[]> {
    return this.request<PortainerContainer[]>(`/endpoints/${endpointId}/docker/containers/json?all=true`)
  }

  /**
   * Start a container by ID
   */
  async startContainer(containerId: string, endpointId: number = 1): Promise<void> {
    await this.request(`/endpoints/${endpointId}/docker/containers/${containerId}/start`, {
      method: "POST",
    })
  }

  /**
   * Stop a container by ID
   */
  async stopContainer(containerId: string, endpointId: number = 1): Promise<void> {
    await this.request(`/endpoints/${endpointId}/docker/containers/${containerId}/stop`, {
      method: "POST",
    })
  }

  /**
   * Restart a container by ID
   */
  async restartContainer(containerId: string, endpointId: number = 1): Promise<void> {
    await this.request(`/endpoints/${endpointId}/docker/containers/${containerId}/restart`, {
      method: "POST",
    })
  }

  /**
   * Get container logs
   */
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
    return this.request<string>(`/endpoints/${endpointId}/docker/containers/${containerId}/logs?${params}`)
  }

  /**
   * Get container stats (CPU, Memory usage)
   */
  async getContainerStats(containerId: string, endpointId: number = 1): Promise<PortainerContainerStats> {
    return this.request<PortainerContainerStats>(
      `/endpoints/${endpointId}/docker/containers/${containerId}/stats?stream=false`
    )
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
