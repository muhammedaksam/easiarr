/**
 * Docker Compose YAML Templates
 * Generates properly formatted YAML for services
 */

import type { ComposeService } from "./generator"

export function generateServiceYaml(name: string, service: ComposeService): string {
  let yaml = `  ${name}:\n`
  yaml += `    image: ${service.image}\n`
  yaml += `    container_name: ${service.container_name}\n`

  // Command (for cloudflared etc.)
  if (service.command) {
    yaml += `    command: ${service.command}\n`
  }

  // Network mode (for Plex)
  if (service.network_mode) {
    yaml += `    network_mode: ${service.network_mode}\n`
  }

  // Dependencies
  if (service.depends_on && service.depends_on.length > 0) {
    yaml += `    depends_on:\n`
    for (const dep of service.depends_on) {
      yaml += `      - ${dep}\n`
    }
  }

  // Environment
  if (Object.keys(service.environment).length > 0) {
    yaml += `    environment:\n`
    for (const [key, value] of Object.entries(service.environment)) {
      yaml += `      - ${key}=${value}\n`
    }
  }

  // Volumes
  if (service.volumes.length > 0) {
    yaml += `    volumes:\n`
    for (const volume of service.volumes) {
      yaml += `      - ${volume}\n`
    }
  }

  // Ports (skip for network_mode: host)
  if (service.ports.length > 0 && !service.network_mode) {
    yaml += `    ports:\n`
    for (const port of service.ports) {
      yaml += `      - ${port}\n`
    }
  }

  // Labels (for Traefik etc.)
  if (service.labels && service.labels.length > 0) {
    yaml += `    labels:\n`
    for (const label of service.labels) {
      yaml += `      - ${label}\n`
    }
  }

  // User directive (for apps like slskd that don't support PUID/PGID)
  if (service.user) {
    yaml += `    user: ${service.user}\n`
  }

  yaml += `    restart: ${service.restart}\n\n`

  return yaml
}

export function generateNetworkYaml(name: string, driver: string): string {
  return `networks:
  ${name}:
    driver: ${driver}
`
}
