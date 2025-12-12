/**
 * *arr API Client
 * Interacts with Radarr, Sonarr, Lidarr, Readarr, Whisparr APIs
 */

// Types for Root Folder API
export interface RootFolder {
  id?: number
  path: string
  accessible?: boolean
  freeSpace?: number | null
  unmappedFolders?: { name: string | null; path: string | null; relativePath: string | null }[]
}

// Types for Download Client API
export interface DownloadClientConfig {
  name: string
  implementation: string
  configContract: string
  enable?: boolean
  priority?: number
  fields: { name: string; value: unknown }[]
}

export interface DownloadClient extends DownloadClientConfig {
  id?: number
}

// Types for Remote Path Mapping API
export interface RemotePathMapping {
  id?: number
  host: string
  remotePath: string
  localPath: string
}

import type { AppId } from "../config/schema"
import { getCategoryForApp, getCategoryFieldName } from "../utils/categories"

// qBittorrent download client config
export function createQBittorrentConfig(
  host: string,
  port: number,
  username: string,
  password: string,
  appId?: AppId
): DownloadClientConfig {
  const category = appId ? getCategoryForApp(appId) : "default"
  const categoryField = appId ? getCategoryFieldName(appId) : "category"

  return {
    name: "qBittorrent",
    implementation: "QBittorrent",
    configContract: "QBittorrentSettings",
    enable: true,
    priority: 1,
    fields: [
      { name: "host", value: host },
      { name: "port", value: port },
      { name: "username", value: username },
      { name: "password", value: password },
      { name: categoryField, value: category },
      { name: "savePath", value: "/data/torrents" },
      { name: "recentMoviePriority", value: 0 },
      { name: "olderMoviePriority", value: 0 },
      { name: "initialState", value: 0 },
      { name: "sequentialOrder", value: false },
      { name: "firstAndLast", value: false },
    ],
  }
}

// SABnzbd download client config
export function createSABnzbdConfig(host: string, port: number, apiKey: string, appId?: AppId): DownloadClientConfig {
  const category = appId ? getCategoryForApp(appId) : "default"
  const categoryField = appId ? getCategoryFieldName(appId) : "category"

  return {
    name: "SABnzbd",
    implementation: "Sabnzbd",
    configContract: "SabnzbdSettings",
    enable: true,
    priority: 1,
    fields: [
      { name: "host", value: host },
      { name: "port", value: port },
      { name: "apiKey", value: apiKey },
      { name: categoryField, value: category },
      { name: "savePath", value: "/data/usenet" },
      { name: "recentMoviePriority", value: -100 },
      { name: "olderMoviePriority", value: -100 },
    ],
  }
}

export type ApiVersion = "v1" | "v3"

/**
 * *arr API Client
 */
export class ArrApiClient {
  private baseUrl: string
  private apiKey: string
  private apiVersion: ApiVersion

  constructor(host: string, port: number, apiKey: string, apiVersion: ApiVersion = "v3") {
    this.baseUrl = `http://${host}:${port}`
    this.apiKey = apiKey
    this.apiVersion = apiVersion
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/${this.apiVersion}${endpoint}`
    const headers = {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    }

    const response = await fetch(url, { ...options, headers })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    // Handle empty responses (DELETE returns empty body)
    const text = await response.text()
    if (!text) return {} as T

    return JSON.parse(text) as T
  }

  // Root Folder methods
  async getRootFolders(): Promise<RootFolder[]> {
    return this.request<RootFolder[]>("/rootfolder")
  }

  async addRootFolder(path: string): Promise<RootFolder> {
    return this.request<RootFolder>("/rootfolder", {
      method: "POST",
      body: JSON.stringify({ path }),
    })
  }

  async deleteRootFolder(id: number): Promise<void> {
    await this.request(`/rootfolder/${id}`, { method: "DELETE" })
  }

  // Download Client methods
  async getDownloadClients(): Promise<DownloadClient[]> {
    return this.request<DownloadClient[]>("/downloadclient")
  }

  async addDownloadClient(config: DownloadClientConfig): Promise<DownloadClient> {
    return this.request<DownloadClient>("/downloadclient", {
      method: "POST",
      body: JSON.stringify(config),
    })
  }

  async deleteDownloadClient(id: number): Promise<void> {
    await this.request(`/downloadclient/${id}`, { method: "DELETE" })
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      await this.request("/system/status")
      return true
    } catch {
      return false
    }
  }

  // Host Config methods - for setting up authentication
  async getHostConfig(): Promise<HostConfig> {
    return this.request<HostConfig>("/config/host")
  }

  async updateHostConfig(username: string, password: string, override = false): Promise<HostConfig | null> {
    // First get current config to preserve all other settings
    const currentConfig = await this.getHostConfig()

    // Only update if no password is set OR override is requested
    if (currentConfig.password && !override) {
      return null // Skip - password already configured
    }

    // Update with authentication settings (id must be in body, not URL)
    const updatedConfig: HostConfig = {
      ...currentConfig,
      authenticationMethod: "forms",
      authenticationRequired: "enabled",
      username,
      password,
      passwordConfirmation: password,
    }

    // PUT to /config/host with id in body (not /config/host/{id})
    return this.request<HostConfig>("/config/host", {
      method: "PUT",
      body: JSON.stringify(updatedConfig),
    })
  }

  // Remote Path Mapping methods - for Docker path translation
  async getRemotePathMappings(): Promise<RemotePathMapping[]> {
    return this.request<RemotePathMapping[]>("/remotepathmapping")
  }

  async addRemotePathMapping(host: string, remotePath: string, localPath: string): Promise<RemotePathMapping> {
    return this.request<RemotePathMapping>("/remotepathmapping", {
      method: "POST",
      body: JSON.stringify({ host, remotePath, localPath }),
    })
  }

  async deleteRemotePathMapping(id: number): Promise<void> {
    await this.request(`/remotepathmapping/${id}`, { method: "DELETE" })
  }
}

// Types for Host Config API
export interface HostConfig {
  id: number
  bindAddress: string | null
  port: number
  sslPort: number
  enableSsl: boolean
  launchBrowser: boolean
  authenticationMethod: "none" | "basic" | "forms" | "external"
  authenticationRequired: "enabled" | "disabledForLocalAddresses"
  analyticsEnabled: boolean
  username: string | null
  password: string | null
  passwordConfirmation: string | null
  logLevel: string | null
  logSizeLimit: number
  consoleLogLevel: string | null
  branch: string | null
  apiKey: string | null
  sslCertPath: string | null
  sslCertPassword: string | null
  urlBase: string | null
  instanceName: string | null
  applicationUrl: string | null
  updateAutomatically: boolean
  updateMechanism: string
  updateScriptPath: string | null
  proxyEnabled: boolean
  proxyType: string
  proxyHostname: string | null
  proxyPort: number
  proxyUsername: string | null
  proxyPassword: string | null
  proxyBypassFilter: string | null
  proxyBypassLocalAddresses: boolean
  certificateValidation: string
  backupFolder: string | null
  backupInterval: number
  backupRetention: number
  trustCgnatIpAddresses: boolean
}
