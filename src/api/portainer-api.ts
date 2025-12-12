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

  constructor(host: string, port: number) {
    this.baseUrl = `http://${host}:${port}`
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    }

    // Add JWT token if authenticated
    if (this.jwtToken) {
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
}
