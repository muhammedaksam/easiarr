/**
 * Docker Client
 * Wrapper for docker compose commands using Bun.$
 */

import { $ } from "bun"
import { getComposePath } from "../config/manager"
import { debugLog } from "../utils/debug"

export interface ContainerStatus {
  name: string
  status: "running" | "stopped" | "not_found"
  ports?: string
}

export async function composeUp(): Promise<{
  success: boolean
  output: string
}> {
  try {
    const composePath = getComposePath()
    debugLog("Docker", `compose up -d (path: ${composePath})`)
    const result = await $`docker compose -f ${composePath} up -d`.text()
    debugLog("Docker", `compose up success`)
    return { success: true, output: result }
  } catch (error) {
    debugLog("Docker", `compose up failed: ${error}`)
    return { success: false, output: String(error) }
  }
}

export async function composeDown(): Promise<{
  success: boolean
  output: string
}> {
  try {
    const composePath = getComposePath()
    debugLog("Docker", `compose down (path: ${composePath})`)
    const result = await $`docker compose -f ${composePath} down`.text()
    debugLog("Docker", `compose down success`)
    return { success: true, output: result }
  } catch (error) {
    debugLog("Docker", `compose down failed: ${error}`)
    return { success: false, output: String(error) }
  }
}

export async function composeRestart(service?: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    debugLog("Docker", `compose restart ${service || "all"}`)
    const result = service
      ? await $`docker compose -f ${composePath} restart ${service}`.text()
      : await $`docker compose -f ${composePath} restart`.text()
    debugLog("Docker", `compose restart success`)
    return { success: true, output: result }
  } catch (error) {
    debugLog("Docker", `compose restart failed: ${error}`)
    return { success: false, output: String(error) }
  }
}

export async function composeStop(service?: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    debugLog("Docker", `compose stop ${service || "all"}`)
    const result = service
      ? await $`docker compose -f ${composePath} stop ${service}`.text()
      : await $`docker compose -f ${composePath} stop`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

export async function composeStart(service?: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    const result = service
      ? await $`docker compose -f ${composePath} start ${service}`.text()
      : await $`docker compose -f ${composePath} start`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

export async function getContainerStatuses(): Promise<ContainerStatus[]> {
  try {
    const composePath = getComposePath()
    const result = await $`docker compose -f ${composePath} ps --format json`.text()

    if (!result.trim()) {
      return []
    }

    // Parse JSON lines output
    const lines = result.trim().split("\n")
    const statuses: ContainerStatus[] = []

    for (const line of lines) {
      try {
        const container = JSON.parse(line)
        statuses.push({
          name: container.Name || container.Service,
          status: container.State === "running" ? "running" : "stopped",
          ports: container.Ports,
        })
      } catch {
        // Skip malformed lines
      }
    }

    return statuses
  } catch {
    return []
  }
}

export async function pullImages(): Promise<{
  success: boolean
  output: string
}> {
  try {
    const composePath = getComposePath()
    const result = await $`docker compose -f ${composePath} pull`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await $`docker --version`.quiet()
    return true
  } catch {
    return false
  }
}

// ==========================================
// Individual Container Operations
// ==========================================

export interface ContainerDetails {
  id: string
  name: string
  service: string
  status: "running" | "stopped" | "exited" | "paused"
  state: string
  health?: string
  ports: string
  uptime?: string
  image: string
  createdAt: string
}

/**
 * Start a specific container by service name
 */
export async function startContainer(service: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    const result = await $`docker compose -f ${composePath} start ${service}`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

/**
 * Stop a specific container by service name
 */
export async function stopContainer(service: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    const result = await $`docker compose -f ${composePath} stop ${service}`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

/**
 * Restart a specific container by service name
 */
export async function restartContainer(service: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    const result = await $`docker compose -f ${composePath} restart ${service}`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

/**
 * Get detailed info for a specific container
 */
export async function getContainerDetails(containerName: string): Promise<ContainerDetails | null> {
  try {
    const result =
      await $`docker inspect ${containerName} --format '{"id":"{{.Id}}","name":"{{.Name}}","state":"{{.State.Status}}","health":"{{if .State.Health}}{{.State.Health.Status}}{{end}}","image":"{{.Config.Image}}","createdAt":"{{.Created}}"}'`.text()

    if (!result.trim()) return null

    const data = JSON.parse(result.trim())

    // Get uptime from Status
    const statusResult = await $`docker ps --filter "name=${containerName}" --format "{{.Status}}"`.text()

    // Get port mappings
    const portsResult = await $`docker port ${containerName} 2>/dev/null`.text()

    return {
      id: data.id.substring(0, 12),
      name: data.name.replace(/^\//, ""),
      service: containerName,
      status: data.state === "running" ? "running" : data.state === "exited" ? "exited" : "stopped",
      state: data.state,
      health: data.health || undefined,
      ports: portsResult.trim() || "-",
      uptime: statusResult.trim() || undefined,
      image: data.image,
      createdAt: data.createdAt,
    }
  } catch {
    return null
  }
}

/**
 * Get container logs
 */
export async function getContainerLogs(
  service: string,
  lines: number = 50
): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    const result = await $`docker compose -f ${composePath} logs ${service} --tail ${lines} --no-color`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

/**
 * Pull latest image for a specific service
 */
export async function pullServiceImage(service: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    const result = await $`docker compose -f ${composePath} pull ${service}`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

/**
 * Recreate a specific service (pull + up)
 */
export async function recreateService(service: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    // Pull first, then recreate
    await $`docker compose -f ${composePath} pull ${service}`.text()
    const result = await $`docker compose -f ${composePath} up -d --force-recreate ${service}`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}
