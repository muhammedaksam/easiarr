/**
 * Prowlarr Setup Actions
 *
 * Setup functions for Prowlarr indexer management.
 * Includes: connecting *arr apps, FlareSolverr configuration.
 */

import { ArrAppType, ProwlarrClient } from "~/api/prowlarr-api"
import { getApp } from "~/apps/registry"
import { getEnabledAppConfig, SetupContext, SetupResult } from "~/setup/types"

const ARR_APP_TYPES: Record<string, ArrAppType> = {
  radarr: "Radarr",
  sonarr: "Sonarr",
  lidarr: "Lidarr",
  readarr: "Readarr",
  whisparr: "Whisparr",
  mylar3: "Mylar",
}

/**
 * Create a ProwlarrClient if enabled
 */
export function createProwlarrClient(ctx: SetupContext): ProwlarrClient | null {
  const apiKey = ctx.env["API_KEY_PROWLARR"]
  if (!apiKey) return null

  const config = getEnabledAppConfig(ctx, "prowlarr")
  const port = config?.port || 9696
  return new ProwlarrClient("localhost", port, apiKey)
}

/**
 * Connect all enabled *arr apps to Prowlarr
 */
export async function setupProwlarrApps(ctx: SetupContext): Promise<SetupResult> {
  const apiKey = ctx.env["API_KEY_PROWLARR"]
  if (!apiKey) {
    return { success: false, message: "No Prowlarr API key" }
  }

  const prowlarrConfig = getEnabledAppConfig(ctx, "prowlarr")
  if (!prowlarrConfig) {
    return { success: false, message: "Prowlarr not enabled" }
  }

  const prowlarrPort = prowlarrConfig.port || 9696
  const prowlarr = new ProwlarrClient("localhost", prowlarrPort, apiKey)

  const arrApps = ctx.config.apps.filter((a) => {
    return a.enabled && ARR_APP_TYPES[a.id]
  })

  let configured = 0

  for (const app of arrApps) {
    const appType = ARR_APP_TYPES[app.id]
    if (!appType) continue

    const appApiKey = ctx.env[`API_KEY_${app.id.toUpperCase()}`]
    if (!appApiKey) continue

    const def = getApp(app.id)
    const port = app.port || def?.defaultPort || 7878

    try {
      await prowlarr.addArrApp(
        appType,
        app.id,
        port,
        appApiKey,
        "prowlarr",
        prowlarrPort,
        def?.prowlarrCategoryIds
      )
      configured++
    } catch {
      // Skip - may already exist
    }
  }

  // Trigger sync
  try {
    await prowlarr.syncApplications()
  } catch {
    // May fail if no indexers
  }

  return { success: true, message: `${configured} apps connected` }
}

/**
 * Configure FlareSolverr in Prowlarr
 */
export async function setupFlareSolverr(ctx: SetupContext): Promise<SetupResult> {
  const apiKey = ctx.env["API_KEY_PROWLARR"]
  const flaresolverr = getEnabledAppConfig(ctx, "flaresolverr")

  if (!apiKey) {
    return { success: false, message: "No Prowlarr API key" }
  }

  if (!flaresolverr) {
    return { success: false, message: "FlareSolverr not enabled" }
  }

  const prowlarrConfig = getEnabledAppConfig(ctx, "prowlarr")
  const prowlarrPort = prowlarrConfig?.port || 9696
  const prowlarr = new ProwlarrClient("localhost", prowlarrPort, apiKey)

  try {
    await prowlarr.configureFlareSolverr("http://flaresolverr:8191")
    return { success: true, message: "FlareSolverr configured" }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

/**
 * Full Prowlarr setup combining apps and FlareSolverr
 */
export async function runProwlarrFullSetup(ctx: SetupContext): Promise<SetupResult> {
  const appsResult = await setupProwlarrApps(ctx)

  // FlareSolverr is optional, so we don't fail if it doesn't work
  const flaresolverrResult = await setupFlareSolverr(ctx)

  if (!appsResult.success) {
    return appsResult
  }

  const message = flaresolverrResult.success
    ? `${appsResult.message}, FlareSolverr enabled`
    : appsResult.message

  return { success: true, message }
}
