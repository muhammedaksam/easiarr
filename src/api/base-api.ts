/**
 * Base API Client
 * Abstract class providing shared fetch, logging, and error handling for all API clients.
 */

import { debugLog } from "~/utils/debug"

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  status?: number
}

export abstract class BaseApiClient {
  protected host: string
  protected port: number
  protected abstract readonly logPrefix: string

  constructor(host: string, port: number) {
    this.host = host
    this.port = port
  }

  /**
   * Base URL for the API (override in subclass if protocol differs)
   */
  protected get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  /**
   * Build API URL for a given endpoint
   */
  protected buildUrl(endpoint: string, basePath: string = ""): string {
    return `${this.baseUrl}${basePath}${endpoint}`
  }

  /**
   * Generic GET request with logging and error handling
   */
  protected async get<T>(
    endpoint: string,
    options: { basePath?: string; headers?: Record<string, string> } = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, options.basePath)
    try {
      debugLog(this.logPrefix, `GET ${endpoint}`)
      const response = await fetch(url, {
        method: "GET",
        headers: options.headers,
      })
      if (!response.ok) {
        debugLog(this.logPrefix, `GET ${endpoint} failed: ${response.status}`)
        return { success: false, status: response.status }
      }
      const data = (await response.json()) as T
      return { success: true, data }
    } catch (error) {
      debugLog(this.logPrefix, `GET ${endpoint} error: ${error}`)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Generic GET request returning plain text
   */
  protected async getText(
    endpoint: string,
    options: { basePath?: string; headers?: Record<string, string> } = {}
  ): Promise<ApiResponse<string>> {
    const url = this.buildUrl(endpoint, options.basePath)
    try {
      debugLog(this.logPrefix, `GET (text) ${endpoint}`)
      const response = await fetch(url, {
        method: "GET",
        headers: options.headers,
      })
      if (!response.ok) {
        debugLog(this.logPrefix, `GET ${endpoint} failed: ${response.status}`)
        return { success: false, status: response.status }
      }
      const data = await response.text()
      return { success: true, data }
    } catch (error) {
      debugLog(this.logPrefix, `GET ${endpoint} error: ${error}`)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Generic POST request with logging and error handling
   */
  protected async post<T, B = unknown>(
    endpoint: string,
    body?: B,
    options: { basePath?: string; headers?: Record<string, string> } = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, options.basePath)
    try {
      debugLog(this.logPrefix, `POST ${endpoint}`)
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!response.ok) {
        debugLog(this.logPrefix, `POST ${endpoint} failed: ${response.status}`)
        return { success: false, status: response.status }
      }
      // Handle empty responses
      const text = await response.text()
      if (!text) {
        return { success: true }
      }
      try {
        const data = JSON.parse(text) as T
        return { success: true, data }
      } catch {
        // Response was not JSON
        return { success: true }
      }
    } catch (error) {
      debugLog(this.logPrefix, `POST ${endpoint} error: ${error}`)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Generic PUT request with logging and error handling
   */
  protected async put<T, B = unknown>(
    endpoint: string,
    body?: B,
    options: { basePath?: string; headers?: Record<string, string> } = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, options.basePath)
    try {
      debugLog(this.logPrefix, `PUT ${endpoint}`)
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!response.ok) {
        debugLog(this.logPrefix, `PUT ${endpoint} failed: ${response.status}`)
        return { success: false, status: response.status }
      }
      const text = await response.text()
      if (!text) {
        return { success: true }
      }
      try {
        const data = JSON.parse(text) as T
        return { success: true, data }
      } catch {
        return { success: true }
      }
    } catch (error) {
      debugLog(this.logPrefix, `PUT ${endpoint} error: ${error}`)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Generic DELETE request with logging and error handling
   */
  protected async delete<T>(
    endpoint: string,
    options: { basePath?: string; headers?: Record<string, string> } = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, options.basePath)
    try {
      debugLog(this.logPrefix, `DELETE ${endpoint}`)
      const response = await fetch(url, {
        method: "DELETE",
        headers: options.headers,
      })
      if (!response.ok) {
        debugLog(this.logPrefix, `DELETE ${endpoint} failed: ${response.status}`)
        return { success: false, status: response.status }
      }
      const text = await response.text()
      if (!text) {
        return { success: true }
      }
      try {
        const data = JSON.parse(text) as T
        return { success: true, data }
      } catch {
        return { success: true }
      }
    } catch (error) {
      debugLog(this.logPrefix, `DELETE ${endpoint} error: ${error}`)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Simple health check - override in subclass for custom logic
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, { method: "HEAD" })
      return response.ok
    } catch {
      return false
    }
  }
}
