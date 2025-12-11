/**
 * Docker Client
 * Wrapper for docker compose commands using Bun.$
 */

import { $ } from "bun"
import { getComposePath } from "../config/manager"

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
    const result = await $`docker compose -f ${composePath} up -d`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

export async function composeDown(): Promise<{
  success: boolean
  output: string
}> {
  try {
    const composePath = getComposePath()
    const result = await $`docker compose -f ${composePath} down`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

export async function composeRestart(service?: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
    const result = service
      ? await $`docker compose -f ${composePath} restart ${service}`.text()
      : await $`docker compose -f ${composePath} restart`.text()
    return { success: true, output: result }
  } catch (error) {
    return { success: false, output: String(error) }
  }
}

export async function composeStop(service?: string): Promise<{ success: boolean; output: string }> {
  try {
    const composePath = getComposePath()
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
