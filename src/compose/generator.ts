/**
 * Docker Compose Generator
 * Generates docker-compose.yml from easiarr configuration
 */

import { writeFile } from "node:fs/promises"
import type { EasiarrConfig, AppConfig, TraefikConfig, AppId } from "../config/schema"
import { getComposePath } from "../config/manager"
import { getApp } from "../apps/registry"
import { generateServiceYaml } from "./templates"
import { updateEnv, getLocalIp } from "../utils/env"
import { saveTraefikConfig } from "./traefik-config"
import { debugLog } from "../utils/debug"

export interface ComposeService {
  image: string
  container_name: string
  environment: Record<string, string | number>
  volumes: string[]
  ports: string[]
  restart: string
  depends_on?: string[]
  network_mode?: string
  labels?: string[]
  devices?: string[]
  cap_add?: string[]
  command?: string
}

export interface ComposeFile {
  services: Record<string, ComposeService>
}

export function generateCompose(config: EasiarrConfig): string {
  debugLog("ComposeGenerator", `Generating compose for ${config.apps.filter((a) => a.enabled).length} enabled apps`)
  const services: Record<string, ComposeService> = {}

  // Track ports to move to Gluetun
  const gluetunPorts: string[] = []
  // Track routing decisions
  const routedApps = new Set<string>()

  // 1. Build all services first
  for (const appConfig of config.apps) {
    if (!appConfig.enabled) continue

    const appDef = getApp(appConfig.id)
    if (!appDef) continue

    debugLog("ComposeGenerator", `Building service: ${appConfig.id}`)
    const service = buildService(appDef, appConfig, config)
    services[appConfig.id] = service
  }

  // 2. Apply VPN routing if enabled
  if (config.vpn && config.vpn.mode !== "none" && services["gluetun"]) {
    const vpnMode = config.vpn.mode

    for (const [id, service] of Object.entries(services)) {
      if (id === "gluetun") continue

      const appDef = getApp(id as AppId)
      if (!appDef) continue

      // Determine if app should be routed
      let shouldRoute = false

      // Mini: Downloaders only
      if (vpnMode === "mini" && appDef.category === "downloader") {
        shouldRoute = true
      }
      // Full: Downloaders, Indexers, Requests, MediaServers, Servarr
      else if (
        vpnMode === "full" &&
        ["downloader", "indexer", "request", "mediaserver", "servarr"].includes(appDef.category)
      ) {
        shouldRoute = true
      }

      if (shouldRoute) {
        // Move ports to Gluetun
        if (service.ports && service.ports.length > 0) {
          gluetunPorts.push(...service.ports)
          service.ports = []
        }

        // Set network mode
        service.network_mode = "service:gluetun"
        routedApps.add(id)

        // Remove depends_on gluetun if it exists (circular check, though service:gluetun implies dependency)
        // Actually docker-compose handles implied dependency for network_mode: service:xxx
      }
    }

    // 3. Add ports to Gluetun
    if (gluetunPorts.length > 0) {
      services["gluetun"].ports = [...new Set([...(services["gluetun"].ports || []), ...gluetunPorts])]
    }
  }

  return formatComposeYaml({ services })
}

function buildService(appDef: ReturnType<typeof getApp>, appConfig: AppConfig, config: EasiarrConfig): ComposeService {
  if (!appDef) throw new Error("App definition not found")

  const port = appConfig.port ?? appDef.defaultPort
  // Use ${ROOT_DIR} for volumes
  const volumes = [...appDef.volumes("${ROOT_DIR}"), ...(appConfig.customVolumes ?? [])]

  // Build environment
  const environment: Record<string, string | number> = {
    TZ: "${TIMEZONE}",
  }

  // Add PUID/PGID (Use globals)
  if (appDef.puid > 0 || appDef.pgid > 0 || ["jellyfin", "tautulli"].includes(appDef.id)) {
    environment.PUID = "${PUID}"
    environment.PGID = "${PGID}"
    environment.UMASK = "${UMASK}"
  }

  // Add app-specific environment
  if (appDef.environment) {
    Object.assign(environment, appDef.environment)
  }

  // Add custom environment from config
  if (appConfig.customEnv) {
    Object.assign(environment, appConfig.customEnv)
  }

  // Build ports array
  let ports: string[] = []
  if (appDef.id !== "plex" && port !== 0 && appDef.defaultPort !== 0) {
    ports.push(`"${port}:${appDef.internalPort ?? appDef.defaultPort}"`)
  }
  // Add secondary ports (e.g., dashboard ports)
  if (appDef.secondaryPorts) {
    ports = ports.concat(appDef.secondaryPorts.map((p) => `"${p}"`))
  }

  const service: ComposeService = {
    image: appDef.image,
    container_name: appDef.id,
    environment,
    volumes,
    ports,
    restart: "unless-stopped",
  }

  // Add devices/caps
  if (appDef.devices) service.devices = [...appDef.devices]
  if (appDef.cap_add) service.cap_add = [...appDef.cap_add]

  // Add command (e.g., cloudflared)
  if (appDef.command) service.command = appDef.command

  // Plex uses network_mode: host
  if (appDef.id === "plex") {
    service.network_mode = "host"
  }

  // Add dependencies
  if (appDef.dependsOn && appDef.dependsOn.length > 0) {
    const enabledDeps = appDef.dependsOn.filter((dep) => config.apps.some((a) => a.id === dep && a.enabled))
    if (enabledDeps.length > 0) {
      service.depends_on = enabledDeps
    }
  }

  if (config.traefik?.enabled && appDef.id !== "plex" && appDef.id !== "cloudflared") {
    if (appDef.id === "traefik") {
      // Special labels for Traefik dashboard (accessible via traefik.domain on port 8080)
      service.labels = generateTraefikLabels("traefik", 8080, config.traefik)
    } else {
      service.labels = generateTraefikLabels(appDef.id, appDef.internalPort ?? appDef.defaultPort, config.traefik)
    }
  }

  // Huntarr: Add Homepage widget labels for Docker autodiscovery
  // This allows Homepage to discover widget config via Docker socket without auth
  if (appDef.id === "huntarr") {
    const huntarrLabels = generateHuntarrHomepageLabels(config)
    if (service.labels) {
      service.labels = [...service.labels, ...huntarrLabels]
    } else {
      service.labels = huntarrLabels
    }
  }

  return service
}

function generateTraefikLabels(serviceName: string, port: number, traefik: TraefikConfig): string[] {
  const labels: string[] = [
    "traefik.enable=true",
    // Router
    `traefik.http.routers.${serviceName}.service=${serviceName}`,
    `traefik.http.routers.${serviceName}.rule=Host(\`${serviceName}.${traefik.domain}\`)`,
    `traefik.http.routers.${serviceName}.entrypoints=${traefik.entrypoint}`,
  ]

  // Add middlewares if configured
  if (traefik.middlewares.length > 0) {
    labels.push(`traefik.http.routers.${serviceName}.middlewares=${traefik.middlewares.join(",")}`)
  }

  // Service/Load balancer
  labels.push(
    `traefik.http.services.${serviceName}.loadbalancer.server.scheme=http`,
    `traefik.http.services.${serviceName}.loadbalancer.server.port=${port}`
  )

  return labels
}

/**
 * Generate Homepage widget labels for Huntarr
 * Homepage discovers these via Docker socket, avoiding auth requirements
 */
function generateHuntarrHomepageLabels(config: EasiarrConfig): string[] {
  const huntarrApps = ["radarr", "sonarr", "lidarr", "whisparr", "readarr"]
  const enabledApps = huntarrApps.filter((appId) => config.apps.some((a) => a.id === appId && a.enabled))

  const labels: string[] = [
    "homepage.group=Utilities",
    "homepage.name=Huntarr",
    "homepage.icon=huntarr.png",
    "homepage.description=Missing content manager for *arr apps",
    "homepage.widget.type=customapi",
    "homepage.widget.method=GET",
    "homepage.widget.url=http://huntarr:9705/api/cycle/status",
  ]

  // Add mappings for each enabled *arr app
  enabledApps.forEach((appId, index) => {
    const appName = appId.charAt(0).toUpperCase() + appId.slice(1)
    labels.push(
      `homepage.widget.mappings[${index}].label=${appName}`,
      `homepage.widget.mappings[${index}].field=${appId}.next_cycle`,
      `homepage.widget.mappings[${index}].format=relativeDate`
    )
  })

  return labels
}

function formatComposeYaml(compose: ComposeFile): string {
  let yaml = "---\nservices:\n"

  for (const [name, service] of Object.entries(compose.services)) {
    yaml += generateServiceYaml(name, service)
  }

  return yaml
}

export async function saveCompose(config: EasiarrConfig): Promise<string> {
  const yaml = generateCompose(config)
  const path = getComposePath()
  await writeFile(path, yaml, "utf-8")

  // Update .env
  await updateEnvFile(config)

  // Generate Traefik config files if Traefik is enabled
  await saveTraefikConfig(config)

  return path
}

async function updateEnvFile(config: EasiarrConfig) {
  // Update .env with global configuration values
  await updateEnv({
    ROOT_DIR: config.rootDir,
    TIMEZONE: config.timezone,
    PUID: config.uid.toString(),
    PGID: config.gid.toString(),
    UMASK: config.umask,
    LOCAL_DOCKER_IP: getLocalIp(),
  })
}
