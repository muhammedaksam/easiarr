/**
 * Arr Common Setup Actions
 *
 * Shared setup functions for *arr apps (Radarr, Sonarr, Lidarr, Readarr, Whisparr, Prowlarr).
 * Includes: root folders, naming, quality, authentication, external URLs.
 */

import { AddRootFolderOptions, ArrApiClient } from "~/api/arr-api"
import { BazarrApiClient } from "~/api/bazarr-api"
import { QualityProfileClient } from "~/api/quality-profile-api"
import { getApp } from "~/apps/registry"
import { getEnabledAppConfig, SetupContext, SetupResult } from "~/setup/types"
import { debugLog } from "~/utils/debug"
import { getApplicationUrl } from "~/utils/url-utils"

type NamingAppId = "radarr" | "sonarr" | "lidarr"

/**
 * Get all enabled *arr apps that have root folder configuration
 */
function getArrAppsWithRootFolder(ctx: SetupContext) {
  return ctx.config.apps.filter((a) => {
    const def = getApp(a.id)
    return a.enabled && def?.rootFolder
  })
}

/**
 * Get enabled *arr apps that support naming configuration
 */
function getNamingApps(ctx: SetupContext) {
  return ctx.config.apps.filter((a) => {
    return a.enabled && (a.id === "radarr" || a.id === "sonarr" || a.id === "lidarr")
  })
}

// ============================================
// ROOT FOLDERS
// ============================================

/**
 * Setup root folders for all enabled *arr apps
 */
export async function setupArrRootFolders(ctx: SetupContext): Promise<SetupResult> {
  const arrApps = getArrAppsWithRootFolder(ctx)

  if (arrApps.length === 0) {
    return { success: true, message: "No *arr apps enabled" }
  }

  let configured = 0
  const errors: string[] = []

  for (const app of arrApps) {
    const def = getApp(app.id)
    if (!def?.rootFolder) continue

    const apiKey = ctx.env[`API_KEY_${app.id.toUpperCase()}`]
    if (!apiKey) continue

    const port = app.port || def.defaultPort
    const client = new ArrApiClient("localhost", port, apiKey, def.rootFolder.apiVersion)

    try {
      const existing = await client.getRootFolders()
      if (existing.length === 0) {
        const options: AddRootFolderOptions = { path: def.rootFolder.path }
        if (app.id === "lidarr") options.name = "Music"
        await client.addRootFolder(options)
        configured++
      }
    } catch (e) {
      errors.push(`${app.id}: ${e}`)
    }
  }

  if (errors.length > 0) {
    return { success: configured > 0, message: `${configured} configured, ${errors.length} failed` }
  }

  return { success: true, message: `${configured || arrApps.length} apps configured` }
}

// ============================================
// NAMING SCHEME
// ============================================

/**
 * Configure TRaSH naming scheme for Radarr, Sonarr, and Lidarr
 */
export async function setupArrNaming(ctx: SetupContext): Promise<SetupResult> {
  const arrApps = getNamingApps(ctx)

  if (arrApps.length === 0) {
    return { success: true, message: "No apps need naming config" }
  }

  let configured = 0

  for (const app of arrApps) {
    const apiKey = ctx.env[`API_KEY_${app.id.toUpperCase()}`]
    if (!apiKey) continue

    const def = getApp(app.id)
    if (!def) continue

    const port = app.port || def.defaultPort
    const client = new ArrApiClient("localhost", port, apiKey, def.rootFolder?.apiVersion || "v3")

    try {
      await client.configureTRaSHNaming(app.id as NamingAppId)
      debugLog("ArrSetup", `Configured naming for ${app.id}`)
      configured++
    } catch (e) {
      debugLog("ArrSetup", `Failed to configure naming for ${app.id}: ${e}`)
    }
  }

  return { success: true, message: `${configured} apps configured` }
}

// ============================================
// QUALITY SETTINGS
// ============================================

/**
 * Configure TRaSH quality definitions for Radarr, Sonarr, and Lidarr
 */
export async function setupArrQuality(ctx: SetupContext): Promise<SetupResult> {
  const arrApps = getNamingApps(ctx)

  if (arrApps.length === 0) {
    return { success: true, message: "No apps need quality config" }
  }

  let configured = 0

  for (const app of arrApps) {
    const apiKey = ctx.env[`API_KEY_${app.id.toUpperCase()}`]
    if (!apiKey) continue

    const def = getApp(app.id)
    if (!def) continue

    const port = app.port || def.defaultPort
    const apiVersion = def.rootFolder?.apiVersion || "v3"
    const client = new QualityProfileClient("localhost", port, apiKey, apiVersion)

    try {
      await client.updateTrashQualityDefinitions(app.id as NamingAppId)
      debugLog("ArrSetup", `Configured quality settings for ${app.id}`)
      configured++
    } catch (e) {
      debugLog("ArrSetup", `Failed to configure quality settings for ${app.id}: ${e}`)
    }
  }

  return { success: true, message: `${configured} apps configured` }
}

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Setup form authentication for all *arr apps and Bazarr
 */
export async function setupArrAuthentication(ctx: SetupContext): Promise<SetupResult> {
  if (!ctx.globalPassword) {
    return { success: false, message: "No PASSWORD_GLOBAL set" }
  }

  let configured = 0

  // Setup *arr apps (Radarr, Sonarr, Lidarr, etc.) with form auth
  const arrApps = ctx.config.apps.filter((a) => {
    const def = getApp(a.id)
    return a.enabled && (def?.rootFolder || a.id === "prowlarr")
  })

  for (const app of arrApps) {
    const def = getApp(app.id)
    if (!def) continue

    const apiKey = ctx.env[`API_KEY_${app.id.toUpperCase()}`]
    if (!apiKey) continue

    const port = app.port || def.defaultPort
    const apiVersion = app.id === "prowlarr" ? "v1" : def.rootFolder?.apiVersion || "v3"
    const client = new ArrApiClient("localhost", port, apiKey, apiVersion)

    try {
      await client.updateHostConfig(ctx.globalUsername, ctx.globalPassword, false)
      configured++
    } catch {
      // Skip individual failures
    }
  }

  // Setup Bazarr form authentication
  const bazarrResult = await setupBazarrAuthentication(ctx)

  return {
    success: true,
    message: bazarrResult.success
      ? `${configured} *arr apps + Bazarr configured`
      : `${configured} *arr apps configured`,
  }
}

/**
 * Setup Bazarr authentication and connections to Radarr/Sonarr
 */
export async function setupBazarrAuthentication(ctx: SetupContext): Promise<SetupResult> {
  const bazarrConfig = getEnabledAppConfig(ctx, "bazarr")
  if (!bazarrConfig) {
    return { success: false, message: "Bazarr not enabled" }
  }

  const bazarrApiKey = ctx.env["API_KEY_BAZARR"]
  if (!bazarrApiKey) {
    return { success: false, message: "No Bazarr API key" }
  }

  const bazarrDef = getApp("bazarr")
  const bazarrPort = bazarrConfig.port || bazarrDef?.defaultPort || 6767
  const bazarrClient = new BazarrApiClient("localhost", bazarrPort)
  bazarrClient.setApiKey(bazarrApiKey)

  try {
    // Enable form auth
    if (ctx.globalPassword) {
      await bazarrClient.enableFormAuth(ctx.globalUsername, ctx.globalPassword, false)
    }

    // Configure Radarr connection
    const radarrConfig = getEnabledAppConfig(ctx, "radarr")
    const radarrApiKey = ctx.env["API_KEY_RADARR"]
    if (radarrConfig && radarrApiKey) {
      const radarrDef = getApp("radarr")
      const radarrPort = radarrConfig.port || radarrDef?.defaultPort || 7878
      await bazarrClient.configureRadarr("radarr", radarrPort, radarrApiKey)
      debugLog("BazarrSetup", "Bazarr -> Radarr connection configured")
    }

    // Configure Sonarr connection
    const sonarrConfig = getEnabledAppConfig(ctx, "sonarr")
    const sonarrApiKey = ctx.env["API_KEY_SONARR"]
    if (sonarrConfig && sonarrApiKey) {
      const sonarrDef = getApp("sonarr")
      const sonarrPort = sonarrConfig.port || sonarrDef?.defaultPort || 8989
      await bazarrClient.configureSonarr("sonarr", sonarrPort, sonarrApiKey)
      debugLog("BazarrSetup", "Bazarr -> Sonarr connection configured")
    }

    // TRaSH Recommended Settings
    await bazarrClient.configureGeneralSettings()
    await bazarrClient.configureDefaultLanguageProfile()

    return { success: true, message: "Bazarr configured" }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

// ============================================
// EXTERNAL URLS
// ============================================

/**
 * Set applicationUrl for all *arr apps
 */
export async function setupArrExternalUrls(ctx: SetupContext): Promise<SetupResult> {
  const arrApps = ctx.config.apps.filter((a) => {
    const def = getApp(a.id)
    return a.enabled && (def?.rootFolder || a.id === "prowlarr")
  })

  let configured = 0

  for (const app of arrApps) {
    const def = getApp(app.id)
    if (!def) continue

    const apiKey = ctx.env[`API_KEY_${app.id.toUpperCase()}`]
    if (!apiKey) continue

    const port = app.port || def.defaultPort
    const apiVersion = app.id === "prowlarr" ? "v1" : def.rootFolder?.apiVersion || "v3"
    const client = new ArrApiClient("localhost", port, apiKey, apiVersion)

    try {
      const applicationUrl = getApplicationUrl(app.id, port, ctx.config)
      await client.setApplicationUrl(applicationUrl)
      debugLog("ArrSetup", `Set applicationUrl for ${app.id}: ${applicationUrl}`)
      configured++
    } catch (e) {
      debugLog("ArrSetup", `Failed to set applicationUrl for ${app.id}: ${e}`)
    }
  }

  if (configured > 0) {
    return { success: true, message: `${configured} apps configured` }
  }

  return { success: false, message: "No apps with API keys" }
}
