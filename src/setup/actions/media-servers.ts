/**
 * Media Server Setup Actions
 *
 * Setup functions for Jellyfin, Plex, and related apps.
 */

import { SetupContext, SetupResult, getEnabledAppConfig } from "../types"
import { JellyfinClient } from "../../api/jellyfin-api"
import { PlexApiClient } from "../../api/plex-api"

/**
 * Setup Jellyfin media server
 */
export async function setupJellyfin(ctx: SetupContext): Promise<SetupResult> {
  const jellyfinConfig = getEnabledAppConfig(ctx, "jellyfin")
  if (!jellyfinConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = jellyfinConfig.port || 8096
  const client = new JellyfinClient("localhost", port)

  try {
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
    })

    return result
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Setup Plex media server
 */
export async function setupPlex(ctx: SetupContext): Promise<SetupResult> {
  const plexConfig = getEnabledAppConfig(ctx, "plex")
  if (!plexConfig) {
    return { success: false, message: "Not enabled" }
  }

  const port = plexConfig.port || 32400
  const client = new PlexApiClient("localhost", port)

  // Check if reachable
  const healthy = await client.isHealthy()
  if (!healthy) {
    return { success: false, message: "Not reachable yet" }
  }

  try {
    // Run auto-setup - pass enabled apps so Plex knows which libraries to create
    const enabledApps = ctx.config.apps.filter((a) => a.enabled).map((a) => a.id)
    const result = await client.setup({
      username: ctx.globalUsername,
      password: ctx.globalPassword,
      env: ctx.env,
      enabledApps,
    })

    return result
  } catch (e) {
    return { success: false, message: String(e) }
  }
}
