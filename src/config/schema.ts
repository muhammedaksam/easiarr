/**
 * Easiarr Configuration Schema
 * TypeScript interfaces for configuration management
 */

import { VersionInfo } from "../VersionInfo"

export interface EasiarrConfig {
  version: string
  rootDir: string
  timezone: string
  uid: number
  gid: number
  umask: string
  apps: AppConfig[]
  network?: NetworkConfig
  traefik?: TraefikConfig
  vpn?: VpnConfig
  monitor?: MonitorConfig
  createdAt: string
  updatedAt: string
}

export type VpnMode = "full" | "mini" | "none"

export interface VpnConfig {
  mode: VpnMode
  provider?: string // For future use (e.g. custom, airvpn, protonvpn)
}

// ==========================================
// Monitoring Configuration
// ==========================================

export type MonitorCheckType = "health" | "diskspace" | "status" | "queue"

export interface MonitorOptions {
  health: boolean
  diskspace: boolean
  status: boolean
  queue: boolean
}

export interface CategoryMonitorConfig {
  category: AppCategory
  enabled: boolean
  checks: MonitorOptions
}

export interface AppMonitorConfig {
  appId: AppId
  override: boolean // If true, uses app-specific settings instead of category defaults
  enabled: boolean
  checks: MonitorOptions
}

export interface MonitorConfig {
  categories: CategoryMonitorConfig[]
  apps: AppMonitorConfig[] // App-specific overrides
  pollIntervalSeconds: number
}

export interface TraefikConfig {
  enabled: boolean
  domain: string
  entrypoint: string
  middlewares: string[]
}

export interface AppConfig {
  id: AppId
  enabled: boolean
  port?: number
  customEnv?: Record<string, string>
  customVolumes?: string[]
  labels?: string[]
  devices?: string[]
  cap_add?: string[]
}

export interface NetworkConfig {
  name: string
  driver: "bridge" | "host" | "none"
}

export type AppId =
  // Media Management (Servarr)
  | "radarr"
  | "sonarr"
  | "lidarr"
  | "readarr"
  | "bazarr"
  | "mylar3"
  | "whisparr"
  | "audiobookshelf"
  // Indexers
  | "prowlarr"
  | "jackett"
  | "flaresolverr"
  // Download Clients
  | "qbittorrent"
  | "sabnzbd"
  // Media Servers
  | "plex"
  | "jellyfin"
  | "tautulli"
  | "tdarr"
  // Request Management
  | "overseerr"
  | "jellyseerr"
  // Dashboards
  | "homarr"
  | "heimdall"
  | "homepage"
  // Utilities
  | "huntarr"
  | "unpackerr"
  | "filebot"
  | "chromium"
  | "guacamole"
  | "guacd"
  | "ddns-updater"
  | "easiarr"
  // VPN
  | "gluetun"
  // Monitoring & Infra
  | "portainer"
  | "dozzle"
  | "uptime-kuma"
  // Monitoring
  | "grafana"
  | "prometheus"
  // Reverse Proxy
  | "traefik"
  | "traefik-certs-dumper"
  | "crowdsec"
  // Network/VPN
  | "headscale"
  | "headplane"
  | "tailscale"
  // Authentication
  | "authentik"
  | "authentik-worker"
  // Database
  | "postgresql"
  | "valkey"

export type AppCategory =
  | "servarr"
  | "indexer"
  | "downloader"
  | "mediaserver"
  | "request"
  | "dashboard"
  | "utility"
  | "vpn"
  | "monitoring"
  | "infrastructure"

export type Architecture = "x64" | "arm64" | "arm32"

export interface ArchCompatibility {
  /** Architectures with full support */
  supported?: Architecture[]
  /** Architectures with deprecated/broken support - will show warning */
  deprecated?: Architecture[]
  /** Warning message to show for deprecated architectures */
  warning?: string
}

export interface AppDefinition {
  id: AppId
  name: string
  description: string
  category: AppCategory
  defaultPort: number
  /** Internal container port if different from defaultPort */
  internalPort?: number
  image: string
  puid: number
  pgid: number
  volumes: (rootDir: string) => string[]
  environment?: Record<string, string>
  dependsOn?: AppId[]
  trashGuide?: string
  secrets?: AppSecret[]
  devices?: string[]
  cap_add?: string[]
  apiKeyMeta?: ApiKeyMeta
  rootFolder?: RootFolderMeta
  prowlarrCategoryIds?: number[]
  /** Architecture compatibility info - omit if supports all */
  arch?: ArchCompatibility
  /** Minimum password length requirement for user creation */
  minPasswordLength?: number
  /** Homepage dashboard configuration */
  homepage?: HomepageMeta
}

/** Homepage dashboard widget/service configuration */
export interface HomepageMeta {
  /** Icon name from Dashboard Icons (e.g., "radarr.png", "mdi-web") */
  icon?: string
  /** Widget type for Homepage (e.g., "radarr", "sonarr", "qbittorrent") */
  widget?: string
  /** Custom widget fields if needed */
  widgetFields?: Record<string, string>
}

export interface RootFolderMeta {
  path: string // e.g. "/data/media/movies"
  apiVersion: "v1" | "v3"
}

export interface ApiKeyMeta {
  configFile: string // Relative to config volume root
  parser: ApiKeyParserType
  selector: string // Regex group 1, or XML tag, or INI key, JSON/YAML dot path
  /** INI section name (for parser: "ini") */
  section?: string
  /** INI key that controls if API is enabled (for parser: "ini") */
  enabledKey?: string
  /** Generate API key if missing or None (for apps like Mylar3) */
  generateIfMissing?: boolean
  description?: string
  transform?: (value: string) => string
}

export type ApiKeyParserType = "xml" | "ini" | "json" | "yaml" | "regex"

export interface AppSecret {
  name: string
  description: string
  required: boolean
  default?: string
  generate?: boolean // Suggest auto-generation
  mask?: boolean // Mask input
}

export const APP_CATEGORIES: Record<AppCategory, string> = {
  servarr: "Media Management",
  indexer: "Indexers",
  downloader: "Download Clients",
  mediaserver: "Media Servers",
  request: "Request Management",
  dashboard: "Dashboards",
  utility: "Utilities",
  vpn: "VPN",
  monitoring: "Monitoring",
  infrastructure: "Infrastructure",
}

export const DEFAULT_CONFIG: Omit<EasiarrConfig, "createdAt" | "updatedAt"> = {
  version: VersionInfo.version,
  rootDir: "",
  timezone: "",
  uid: 1000,
  gid: 1000,
  umask: "002",
  apps: [],
}
